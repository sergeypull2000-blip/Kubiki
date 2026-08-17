import { useState, useEffect, useCallback, useRef } from "react";
import { makeProject, makeProjectFromEstimate, normalizeProject } from "./store.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Workspace } from "./components/Workspace.jsx";
import { KnowledgeBasePage } from "./components/KnowledgeBasePage.jsx";
import { cloneProjectTemplate } from "./templates.js";
import { ImportModal, GenerateEstimateModal } from "./importExcel.jsx";
import { APP_SECTIONS } from "./appNavigation.js";
import { createPerformer, removePerformer, savePerformerLibrary, updatePerformer } from "./performerLibrary.js";
import { applyQuickAccessPreference, migrateLegacyQuickAccess, pinQuickAccessItem, removeQuickAccessByPerformerId, removeQuickAccessItem, saveQuickAccessState, unpinQuickAccessItem } from "./quickAccess.js";
import { projectRepository } from "./repositories/projectRepository.js";
import { createLocalServerBackup, diffProjectCollections, migrateLocalProjects, shouldOfferProjectMigration } from "./projectServer.js";
import { performerRepository } from "./repositories/performerRepository.js";
import { createPerformerBackup, localPerformersForUser, markPerformerServerOwner, migrateLocalPerformers, missingLocalPerformers } from "./performerServer.js";
import { quickAccessRepository } from "./repositories/quickAccessRepository.js";
import { createQuickAccessBackup, localQuickAccessForUser, markQuickAccessServerOwner, migrateLocalQuickAccess, missingLocalQuickAccessItems } from "./quickAccessServer.js";
import { templateLibraryRepository } from "./repositories/templateLibraryRepository.js";
import { createTemplateLibraryBackup, hasMeaningfulTemplateLibrary, localTemplateLibraryForUser, markTemplateServerOwner, migrateLocalTemplateLibrary, normalizeTemplateLibrary, saveLocalTemplateLibrary, templateLibrariesEqual } from "./templateLibrary.js";
import { aiSettingsRepository } from "./repositories/aiSettingsRepository.js";
import { loadLocalAiSettings, normalizeAiSettings, saveLocalAiSettings } from "./aiSettings.js";
import { AIPersonalizationModal } from "./components/AIPersonalizationModal.jsx";
import { isAiHydrationReady } from "./ai/hydrationGate.js";
import { createAiEditIdPool, createAiEditRequest, requestAiEdit } from "./ai/editClient.js";
import { buildAiEditPreview } from "./ai/editPreview.js";
import { projectRevision } from "./ai/projectRevision.js";
import { createAiEditUndoStore } from "./ai/editUndo.js";
import { drainProjectSaveQueue } from "./projectSaveQueue.js";

/* ============================================================
   п.7.1: автосохранение в localStorage браузера — заменяет бэкенд
   на первых порах. Продюсер открывает приложение, работает, закрывает
   вкладку — при следующем открытии смета на месте (пока не чистит кэш).
   ============================================================ */
const STORAGE_KEY = "kubiki_state_v1";
function loadStoredState(userId = null) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    if (userId && parsed.serverUserId && parsed.serverUserId !== userId) return null;
    return parsed;
  } catch (_) {
    return null; // битый/недоступный localStorage — стартуем с чистого листа
  }
}

/* ============================================================
   KUBIKI — умная смета для CG-производства (прототип)
   Себестоимость проекта. Наценка/клиентская смета — заглушка.

   Модель исполнителя — набор ТЕГОВ («кубиков исполнителя»), а не
   фиксированные поля. Тег может быть пустым (без состояния) или
   заполненным. Один тег «Тип оплаты» несёт расчёт суммы строки.

   Drag-and-drop — нативный HTML5 API, слой вынесен и помечен ниже,
   чтобы его было легко заменить на dnd-kit при переносе.

   Точка входа: собирает Dashboard/Workspace и хранит верхнеуровневый
   стейт списка проектов. Вся остальная логика — в соседних модулях:
     utils.js          — общие хелперы (uid/fmt/numVal)
     calculations.js    — расчёт сумм/цены/маркапа/налога
     constants.js        — справочники (этапы, теги, оплата)
     store.js            — фабрики, иммутабельные мутаторы, DnD-слой
     hooks.js             — общие React-хуки (шрифт, outside-click)
     importExcel.jsx       — импорт сметы из Excel через LLM
     exportFiles.jsx        — экспорт в Excel/PDF
     components/            — Left/Right панели, Рабочая зона, Этап/Задача/Исполнитель
   ============================================================ */

export default function KubikiApp({ userId, user, onSignOut }) {
  const initialLocalState = useRef(loadStoredState(userId) || { projects: [], currentId: null });
  const [projects, setProjects] = useState(() => initialLocalState.current.projects || []);
  const projectsRef = useRef(projects);
  const [currentId, setCurrentId] = useState(() => initialLocalState.current.currentId || null);
  const [serverState, setServerState] = useState("loading");
  const [serverMessage, setServerMessage] = useState("");
  const [migrationNotice, setMigrationNotice] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [retryVersion, setRetryVersion] = useState(0);
  const syncEnabledRef = useRef(false);
  const timersRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const inFlightSavesRef = useRef(new Map());
  const activeAiEditRequestsRef = useRef(new Map());
  const aiUndoRef = useRef(createAiEditUndoStore());
  const [aiUndoVersion, setAiUndoVersion] = useState(0);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [projectSource, setProjectSource] = useState(null);
  const [activeSection, setActiveSection] = useState(APP_SECTIONS.PROJECTS);
  const initialLocalPerformers = useRef(localPerformersForUser(userId));
  const [performers, setPerformers] = useState(() => initialLocalPerformers.current);
  const performersRef = useRef(performers);
  const performerSyncEnabledRef = useRef(false);
  const [performerState, setPerformerState] = useState("loading");
  const [performerMessage, setPerformerMessage] = useState("");
  const [performerRetry, setPerformerRetry] = useState(0);
  const [migrationCandidates, setMigrationCandidates] = useState([]);
  const serverPerformerIdsRef = useRef(new Set());
  const performerHydratedUserRef = useRef(null);
  const [performerHydrationVersion, setPerformerHydrationVersion] = useState(0);
  const initialLocalQuickAccess = useRef(migrateLegacyQuickAccess(localQuickAccessForUser(userId)));
  const [quickAccess, setQuickAccess] = useState(() => initialLocalQuickAccess.current);
  const quickAccessRef = useRef(quickAccess);
  const quickAccessSyncEnabledRef = useRef(false);
  const quickAccessOperationVersionRef = useRef(0);
  const [quickAccessState, setQuickAccessState] = useState("waiting");
  const [quickAccessMessage, setQuickAccessMessage] = useState("");
  const [quickAccessRetry, setQuickAccessRetry] = useState(0);
  const [quickAccessMigrationCandidates, setQuickAccessMigrationCandidates] = useState([]);
  const initialAiSettings = useRef(loadLocalAiSettings(userId));
  const [aiSettings, setAiSettings] = useState(() => initialAiSettings.current);
  const aiSettingsRef = useRef(aiSettings);
  const aiSettingsSyncEnabledRef = useRef(false);
  const aiSettingsHydrationRef = useRef(Promise.resolve());
  const [aiSettingsState, setAiSettingsState] = useState("loading");
  const [aiSettingsMessage, setAiSettingsMessage] = useState("");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const storedCurrentProject = projects.find((p) => p.id === currentId) || null;
  const currentProject = storedCurrentProject ? normalizeProject(storedCurrentProject) : null;

  const replaceProjects = useCallback((next) => {
    projectsRef.current = next;
    setProjects(next);
  }, []);

  const replacePerformers = useCallback((next, persist = true) => {
    performersRef.current = next;
    setPerformers(next);
    if (persist) savePerformerLibrary(next);
  }, []);

  const replaceQuickAccess = useCallback((next, persist = true) => {
    quickAccessRef.current = next;
    setQuickAccess(next);
    if (persist) saveQuickAccessState(next);
  }, []);

  const replaceAiSettings = useCallback((next, persist = true) => {
    const value = normalizeAiSettings(next);
    aiSettingsRef.current = value;
    setAiSettings(value);
    if (persist) saveLocalAiSettings(value, userId);
    return value;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    aiSettingsSyncEnabledRef.current = false;
    setAiSettingsState("loading"); setAiSettingsMessage("");
    const local = loadLocalAiSettings(userId);
    const hydration = aiSettingsRepository.loadAiSettings(userId).then(({ settings }) => {
      if (cancelled) return;
      replaceAiSettings(settings); aiSettingsSyncEnabledRef.current = true; setAiSettingsState("ready");
    }).catch(() => {
      if (cancelled) return;
      replaceAiSettings(local); setAiSettingsState("error"); setAiSettingsMessage("Настройки ИИ пока не синхронизированы с сервером. Используется локальная копия.");
    });
    aiSettingsHydrationRef.current = hydration;
    return () => { cancelled = true; aiSettingsSyncEnabledRef.current = false; aiSettingsRef.current = normalizeAiSettings(); };
  }, [userId, replaceAiSettings]);

  const saveAiSettings = useCallback(async (draft) => {
    const value = normalizeAiSettings(draft);
    await aiSettingsHydrationRef.current;
    if (!aiSettingsSyncEnabledRef.current) { replaceAiSettings(value); setAiSettingsState("save-error"); setAiSettingsMessage("Не удалось подключиться к серверным настройкам. Текст сохранён только на этом устройстве; попробуйте ещё раз."); return false; }
    setAiSettingsState("saving"); setAiSettingsMessage("");
    try {
      const saved = await aiSettingsRepository.upsertAiSettings(userId, value);
      replaceAiSettings(saved); setAiSettingsState("ready"); setAiSettingsMessage("Настройки сохранены"); return true;
    } catch (error) {
      replaceAiSettings(value); setAiSettingsState("save-error"); setAiSettingsMessage(`${error.message}. Текст сохранён только на этом устройстве; попробуйте ещё раз.`); return false;
    }
  }, [replaceAiSettings, userId]);

  useEffect(() => {
    let cancelled = false;
    quickAccessOperationVersionRef.current += 1;
    performerSyncEnabledRef.current = false;
    replacePerformers([], false);
    setPerformerState("loading");
    setPerformerMessage("");
    const local = localPerformersForUser(userId);
    performerRepository.listPerformers(userId).then((serverPerformers) => {
      if (cancelled) return;
      serverPerformerIdsRef.current = new Set(serverPerformers.map((item) => item.id));
      performerHydratedUserRef.current = userId;
      const missing = missingLocalPerformers(local, serverPerformers);
      if (missing.length) createPerformerBackup();
      replacePerformers(serverPerformers);
      markPerformerServerOwner(userId);
      if (missing.length) { setMigrationCandidates(missing); setPerformerState("migration-offer"); }
      else { performerSyncEnabledRef.current = true; setPerformerState("ready"); }
      setPerformerHydrationVersion((value) => value + 1);
    }).catch((error) => {
      if (cancelled) return;
      replacePerformers(local);
      setPerformerMessage(error.message || "Не удалось загрузить базу исполнителей");
      setPerformerState("error");
    });
    return () => { cancelled = true; performerSyncEnabledRef.current = false; performerHydratedUserRef.current = null; serverPerformerIdsRef.current = new Set(); performersRef.current = []; };
  }, [userId, performerRetry, replacePerformers]);

  useEffect(() => {
    if (performerHydratedUserRef.current !== userId || performerHydrationVersion === 0) return;
    let cancelled = false;
    quickAccessSyncEnabledRef.current = false;
    quickAccessOperationVersionRef.current += 1;
    replaceQuickAccess({ items: [] }, false);
    setQuickAccessState("loading"); setQuickAccessMessage("");
    const local = localQuickAccessForUser(userId);
    const performerIds = [...serverPerformerIdsRef.current];
    quickAccessRepository.listQuickAccessItems(userId, performerIds).then((serverState) => {
      if (cancelled) return;
      if (local.items.length) createQuickAccessBackup();
      const { items, skipped } = missingLocalQuickAccessItems(local, serverState, performerIds);
      replaceQuickAccess(serverState); markQuickAccessServerOwner(userId);
      if (items.length) { setQuickAccessMigrationCandidates(items); setQuickAccessState("migration-offer"); setQuickAccessMessage(skipped.length ? `Пропущено битых ссылок: ${skipped.length}` : ""); }
      else { quickAccessSyncEnabledRef.current = true; setQuickAccessState("ready"); if (skipped.length) setQuickAccessMessage(`Пропущено битых ссылок: ${skipped.length}`); }
    }).catch((error) => {
      if (cancelled) return;
      replaceQuickAccess(local); setQuickAccessState("error"); setQuickAccessMessage(error.message || "Не удалось загрузить быстрый доступ");
    });
    return () => { cancelled = true; quickAccessSyncEnabledRef.current = false; };
  }, [userId, performerHydrationVersion, quickAccessRetry, replaceQuickAccess]);

  const saveProjectNow = useCallback(async (project) => {
    if (!syncEnabledRef.current || !project) return false;
    setSaveState("saving");
    try {
      await drainProjectSaveQueue({
        project,
        pending: pendingRef.current,
        inFlight: inFlightSavesRef.current,
        persist: (snapshot) => projectRepository.upsertProject(userId, snapshot),
      });
      setSaveState("saved");
      setServerMessage("");
      return true;
    } catch (error) {
      if (!pendingRef.current.has(project.id)) pendingRef.current.set(project.id, project);
      setSaveState("error");
      setServerMessage(error.message || "Не удалось сохранить проект");
      return false;
    }
  }, [userId]);

  const scheduleProjectSave = useCallback((project, delay = 800) => {
    if (!syncEnabledRef.current || !project) return;
    const id = project.id;
    pendingRef.current.set(id, project);
    setSaveState("saving");
    const previous = timersRef.current.get(id);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      saveProjectNow(pendingRef.current.get(id));
    }, delay);
    timersRef.current.set(id, timer);
  }, [saveProjectNow]);

  const flushProject = useCallback(async (id) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    const pending = pendingRef.current.get(id);
    return pending ? saveProjectNow(pending) : true;
  }, [saveProjectNow]);

  const flushAll = useCallback(async () => {
    const ids = [...pendingRef.current.keys()];
    return Promise.all(ids.map(flushProject));
  }, [flushProject]);

  useEffect(() => {
    if (!migrationNotice) return;
    const timer = setTimeout(() => setMigrationNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [migrationNotice]);

  useEffect(() => {
    let cancelled = false;
    const timers = timersRef.current;
    const pending = pendingRef.current;
    const inFlightSaves = inFlightSavesRef.current;
    syncEnabledRef.current = false;
    setServerState("loading");
    setServerMessage("");
    projectRepository.listProjects(userId).then((serverProjects) => {
      if (cancelled) return;
      const localProjects = initialLocalState.current.projects || [];
      if (shouldOfferProjectMigration(serverProjects, localProjects)) {
        setServerState("migration-offer");
        return;
      }
      createLocalServerBackup();
      if (serverProjects.length && localProjects.length) {
        const { onlyLocal } = diffProjectCollections(localProjects, serverProjects);
        if (onlyLocal.length) {
          createLocalServerBackup();
          setMigrationNotice("На устройстве остались локальные проекты. Они сохранены в резервной копии и не объединены с серверными.");
        }
      }
      replaceProjects(serverProjects);
      setCurrentId((id) => serverProjects.some((project) => project.id === id) ? id : null);
      syncEnabledRef.current = true;
      setServerState("ready");
      setSaveState("saved");
    }).catch((error) => {
      if (cancelled) return;
      setServerMessage(error.message || "Не удалось загрузить проекты");
      setServerState("error");
    });
    return () => {
      cancelled = true;
      syncEnabledRef.current = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
      inFlightSaves.clear();
    };
  }, [userId, retryVersion, replaceProjects]);

  const initialLocalTemplates = useRef(localTemplateLibraryForUser(userId));
  const [templateLibrary, setTemplateLibrary] = useState(() => initialLocalTemplates.current);
  const templateLibraryRef = useRef(templateLibrary);
  const templateSyncEnabledRef = useRef(false);
  const templateTimerRef = useRef(null);
  const templatePendingRef = useRef(null);
  const [templateState, setTemplateState] = useState("loading");
  const aiGenerationReady = isAiHydrationReady({ projects: serverState, performers: performerState, templates: templateState, aiSettings: aiSettingsState });
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateRetry, setTemplateRetry] = useState(0);
  const projectTemplates = templateLibrary.projectTemplates;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, currentId, serverUserId: userId }));
    } catch (_) { /* переполнение хранилища / приватный режим — тихо пропускаем */ }
  }, [projects, currentId, userId]);

  useEffect(() => { performersRef.current = performers; }, [performers]);
  useEffect(() => { quickAccessRef.current = quickAccess; }, [quickAccess]);

  const saveTemplateLibraryNow = useCallback(async (library = templatePendingRef.current) => {
    if (!templateSyncEnabledRef.current || !library) return false;
    setTemplateState("saving");
    try {
      const saved = await templateLibraryRepository.upsertTemplateLibrary(userId, library);
      if (templatePendingRef.current === library) {
        templatePendingRef.current = null;
        templateLibraryRef.current = saved; setTemplateLibrary(saved); saveLocalTemplateLibrary(saved);
        setTemplateState("ready"); setTemplateMessage("");
      } else {
        setTemplateState("saving");
      }
      return true;
    } catch (error) {
      if (!templatePendingRef.current) templatePendingRef.current = library;
      setTemplateState("save-error"); setTemplateMessage(`${error.message}. Локальная копия сохранена.`); return false;
    }
  }, [userId]);

  const replaceTemplateLibrary = useCallback((next, { persist = true, schedule = true } = {}) => {
    const value = normalizeTemplateLibrary(typeof next === "function" ? next(templateLibraryRef.current) : next);
    templateLibraryRef.current = value; setTemplateLibrary(value);
    if (persist) saveLocalTemplateLibrary(value);
    if (schedule && templateSyncEnabledRef.current) {
      templatePendingRef.current = value; setTemplateState("saving");
      if (templateTimerRef.current) clearTimeout(templateTimerRef.current);
      templateTimerRef.current = setTimeout(() => { templateTimerRef.current = null; saveTemplateLibraryNow(templatePendingRef.current); }, 650);
    }
    return value;
  }, [saveTemplateLibraryNow]);

  const flushTemplateLibrary = useCallback(async () => {
    if (templateTimerRef.current) clearTimeout(templateTimerRef.current);
    templateTimerRef.current = null;
    return templatePendingRef.current ? saveTemplateLibraryNow(templatePendingRef.current) : true;
  }, [saveTemplateLibraryNow]);

  useEffect(() => {
    let cancelled = false;
    templateSyncEnabledRef.current = false; templatePendingRef.current = null;
    if (templateTimerRef.current) clearTimeout(templateTimerRef.current);
    templateTimerRef.current = null; setTemplateState("loading"); setTemplateMessage("");
    const local = localTemplateLibraryForUser(userId);
    templateLibraryRepository.loadTemplateLibrary(userId).then(({ exists, library: serverLibrary }) => {
      if (cancelled) return;
      createTemplateLibraryBackup();
      if (!exists && hasMeaningfulTemplateLibrary(local)) { replaceTemplateLibrary(local, { schedule: false }); setTemplateState("migration-offer"); return; }
      if (exists) {
        if (hasMeaningfulTemplateLibrary(local) && !templateLibrariesEqual(local, serverLibrary)) setTemplateMessage("Локальная библиотека отличается от серверной и сохранена в резервной копии.");
        replaceTemplateLibrary(serverLibrary, { schedule: false }); markTemplateServerOwner(userId); templateSyncEnabledRef.current = true; setTemplateState("ready");
      } else {
        replaceTemplateLibrary(serverLibrary, { schedule: false }); markTemplateServerOwner(userId); templateSyncEnabledRef.current = true; setTemplateState("ready");
      }
    }).catch((error) => {
      if (cancelled) return;
      replaceTemplateLibrary(local, { schedule: false }); setTemplateState("error"); setTemplateMessage(error.message || "Не удалось загрузить библиотеку шаблонов");
    });
    return () => { cancelled = true; templateSyncEnabledRef.current = false; if (templateTimerRef.current) clearTimeout(templateTimerRef.current); templateTimerRef.current = null; templatePendingRef.current = null; templateLibraryRef.current = normalizeTemplateLibrary(); };
  }, [userId, templateRetry, replaceTemplateLibrary]);

  const handleTemplatesChange = useCallback((updated) => replaceTemplateLibrary((library) => ({ ...library, projectTemplates: updated })), [replaceTemplateLibrary]);
  const handleTaskTemplatesChange = useCallback((updated) => replaceTemplateLibrary((library) => ({ ...library, taskTemplates: updated })), [replaceTemplateLibrary]);
  const handleStageTemplatesChange = useCallback((updated) => replaceTemplateLibrary((library) => ({ ...library, stageTemplates: updated })), [replaceTemplateLibrary]);

  const invalidateAiUndo = useCallback((projectId) => {
    if (aiUndoRef.current.invalidate(projectId)) setAiUndoVersion((value) => value + 1);
  }, []);

  const commitProject = useCallback((id, updater, delay = 800) => {
    const existing = projectsRef.current.find((project) => project.id === id);
    if (!existing) return null;
    const next = normalizeProject(updater(normalizeProject(existing)));
    invalidateAiUndo(id);
    replaceProjects(projectsRef.current.map((project) => project.id === id ? next : project));
    scheduleProjectSave(next, delay);
    return next;
  }, [invalidateAiUndo, replaceProjects, scheduleProjectSave]);

  const createProject = (template) => {
    const p = normalizeProject(template ? cloneProjectTemplate(template) : makeProject());
    p.createdAt = new Date().toISOString();
    replaceProjects([...projectsRef.current, p]);
    scheduleProjectSave(p, 0);
    setCurrentId(p.id);
  };
  const createProjectFromEstimate = (stages, meta) => {
    const normalized = makeProjectFromEstimate(stages, meta);
    replaceProjects([...projectsRef.current, normalized]);
    scheduleProjectSave(normalized, 0);
    setProjectSource(null);
    setCurrentId(normalized.id);
  };
  const deleteProject = async (id) => {
    if (!window.confirm("Удалить проект?")) return;
    if (syncEnabledRef.current) {
      try {
        await projectRepository.deleteProject(userId, id);
      } catch (error) {
        setSaveState("error");
        setServerMessage(error.message || "Не удалось удалить проект");
        return;
      }
    }
    pendingRef.current.delete(id);
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    invalidateAiUndo(id);
    replaceProjects(projectsRef.current.filter((project) => project.id !== id));
    if (currentId === id) setCurrentId(null);
  };
  const toggleFavorite = (id) => commitProject(id, (project) => ({ ...project, favorite: !project.favorite }), 0);
  const renameProject = (id, name) => commitProject(id, (project) => ({ ...project, name }));
  const updateCurrent = (updater) => commitProject(currentId, updater);

  const requestCurrentAiEdit = useCallback(async ({ scope, instruction, knowledge, confirmed, continuation }) => {
    const projectId = scope?.projectId;
    if (!projectId || activeAiEditRequestsRef.current.has(projectId)) throw new Error("Для этой сметы уже выполняется AI-запрос");
    if (!await flushProject(projectId)) throw new Error("Сначала нужно успешно сохранить текущую смету");
    const project = projectsRef.current.find((item) => item.id === projectId);
    if (!project) throw new Error("Смета не найдена");
    const baseRevision = await projectRevision(project), idPool = createAiEditIdPool(project);
    const payload = createAiEditRequest({ projectId, baseRevision, scope, instruction, knowledge, confirmed, idPool, continuation });
    const controller = new AbortController(); activeAiEditRequestsRef.current.set(projectId, controller);
    try {
      const response = await requestAiEdit(payload, { signal: controller.signal });
      if (response.kind !== "diff") return response;
      const current = projectsRef.current.find((item) => item.id === projectId);
      return await buildAiEditPreview({ project: current, response, performers: performersRef.current, idPool, expectedRevision: baseRevision, instruction, selectedSources: payload.knowledge.selectedSources });
    } finally { if (activeAiEditRequestsRef.current.get(projectId) === controller) activeAiEditRequestsRef.current.delete(projectId); }
  }, [flushProject]);

  const cancelCurrentAiEdit = useCallback(() => {
    const controller = activeAiEditRequestsRef.current.get(currentId);
    controller?.abort();
  }, [currentId]);

  const applyCurrentAiEdit = useCallback(async (preview) => {
    const projectId = preview?.scope?.projectId, current = projectsRef.current.find((item) => item.id === projectId);
    if (!current) throw new Error("Смета не найдена");
    const verified = await buildAiEditPreview({ project: current, response: preview.response, performers: performersRef.current, idPool: preview.idPool, expectedRevision: preview.baseRevision, instruction: preview.instruction, selectedSources: preview.selectedSources });
    const applied = commitProject(projectId, () => verified.afterProject, 0);
    if (!applied) throw new Error("Не удалось применить AI-diff");
    aiUndoRef.current.record(projectId, { beforeProject: verified.beforeProject, appliedRevision: verified.afterRevision, requestId: verified.requestId });
    setAiUndoVersion((value) => value + 1);
  }, [commitProject]);

  const undoCurrentAiEdit = useCallback(async () => {
    const entry = aiUndoRef.current.get(currentId), current = projectsRef.current.find((item) => item.id === currentId);
    if (!entry || !current) return false;
    if (await projectRevision(current) !== entry.appliedRevision) { invalidateAiUndo(currentId); throw new Error("Undo недоступен: после AI-изменения смета уже менялась"); }
    commitProject(currentId, () => structuredClone(entry.beforeProject), 0);
    return true;
  }, [commitProject, currentId, invalidateAiUndo]);

  const handleMigration = async () => {
    setServerState("migrating");
    setServerMessage("");
    try {
      await migrateLocalProjects({ userId, localProjects: initialLocalState.current.projects, repository: projectRepository });
      const serverProjects = await projectRepository.listProjects(userId);
      replaceProjects(serverProjects);
      setCurrentId((id) => serverProjects.some((project) => project.id === id) ? id : null);
      syncEnabledRef.current = true;
      setServerState("ready");
      setSaveState("saved");
      setServerMessage(`Перенесено проектов: ${serverProjects.length}`);
    } catch (error) {
      syncEnabledRef.current = false;
      setServerState("migration-offer");
      setServerMessage(error.message || "Не удалось перенести проекты");
    }
  };

  const handleSignOut = async () => {
    await Promise.all([flushAll(), flushTemplateLibrary()]);
    syncEnabledRef.current = false;
    templateSyncEnabledRef.current = false;
    if (templateTimerRef.current) clearTimeout(templateTimerRef.current);
    templateTimerRef.current = null; templatePendingRef.current = null;
    replaceTemplateLibrary(normalizeTemplateLibrary(), { persist: false, schedule: false });
    performerSyncEnabledRef.current = false;
    quickAccessSyncEnabledRef.current = false;
    quickAccessOperationVersionRef.current += 1;
    replacePerformers([], false);
    replaceQuickAccess({ items: [] }, false);
    aiSettingsSyncEnabledRef.current = false;
    replaceAiSettings(normalizeAiSettings(), false);
    await onSignOut();
  };

  const handleTemplateMigration = async () => {
    setTemplateState("migrating"); setTemplateMessage("");
    try {
      await migrateLocalTemplateLibrary({ userId, library: templateLibraryRef.current, repository: templateLibraryRepository });
      const { library } = await templateLibraryRepository.loadTemplateLibrary(userId);
      replaceTemplateLibrary(library, { schedule: false }); markTemplateServerOwner(userId);
      templateSyncEnabledRef.current = true; setTemplateState("ready"); setTemplateMessage("Библиотека шаблонов перенесена");
    } catch (error) { templateSyncEnabledRef.current = false; setTemplateState("migration-offer"); setTemplateMessage(error.message); }
  };

  const addQuickAccessForPerformer = async (performerId) => {
    const existing = quickAccessRef.current.items.find((item) => item.performerId === performerId);
    if (existing) return existing;
    if (!quickAccessSyncEnabledRef.current || !serverPerformerIdsRef.current.has(performerId)) { setQuickAccessState("save-error"); setQuickAccessMessage("Быстрый доступ ещё не готов к синхронизации"); return null; }
    const next = applyQuickAccessPreference(quickAccessRef.current, performerId, true);
    const item = next.items.find((entry) => entry.performerId === performerId);
    const operationVersion = quickAccessOperationVersionRef.current;
    replaceQuickAccess(next); setQuickAccessState("saving");
    try { const saved = await quickAccessRepository.upsertQuickAccessItem(userId, item); if (operationVersion !== quickAccessOperationVersionRef.current) return null; setQuickAccessState("ready"); setQuickAccessMessage(""); return saved; }
    catch (error) { if (operationVersion !== quickAccessOperationVersionRef.current) return null; setQuickAccessState("save-error"); setQuickAccessMessage(`${error.message}. Локальная копия сохранена.`); return null; }
  };

  const removeQuickAccessByItem = async (item) => {
    if (!quickAccessSyncEnabledRef.current) { setQuickAccessState("save-error"); setQuickAccessMessage("Быстрый доступ ещё не готов к синхронизации"); return false; }
    const operationVersion = quickAccessOperationVersionRef.current;
    setQuickAccessState("saving");
    try { await quickAccessRepository.deleteQuickAccessItem(userId, item.id); if (operationVersion !== quickAccessOperationVersionRef.current) return false; }
    catch (error) { if (operationVersion !== quickAccessOperationVersionRef.current) return false; setQuickAccessState("save-error"); setQuickAccessMessage(error.message); return false; }
    replaceQuickAccess(removeQuickAccessItem(quickAccessRef.current, item.id)); setQuickAccessState("ready"); setQuickAccessMessage(""); return true;
  };

  const removeQuickAccessForPerformer = async (performerId) => {
    const item = quickAccessRef.current.items.find((entry) => entry.performerId === performerId);
    return item ? removeQuickAccessByItem(item) : true;
  };

  const toggleQuickAccessPin = async (item) => {
    if (!quickAccessSyncEnabledRef.current) { setQuickAccessState("save-error"); setQuickAccessMessage("Быстрый доступ ещё не готов к синхронизации"); return false; }
    const next = item.pinned ? unpinQuickAccessItem(quickAccessRef.current, item.id) : pinQuickAccessItem(quickAccessRef.current, item.id);
    const changed = next.items.find((entry) => entry.id === item.id);
    const operationVersion = quickAccessOperationVersionRef.current;
    replaceQuickAccess(next); setQuickAccessState("saving");
    try { await quickAccessRepository.updateQuickAccessItem(userId, changed); if (operationVersion !== quickAccessOperationVersionRef.current) return false; setQuickAccessState("ready"); setQuickAccessMessage(""); return true; }
    catch (error) { if (operationVersion !== quickAccessOperationVersionRef.current) return false; setQuickAccessState("save-error"); setQuickAccessMessage(`${error.message}. Изменение сохранено локально.`); return false; }
  };
  const savePerformer = async (draft, addToQuickAccess, existingId = null) => {
    const current = performersRef.current;
    const next = existingId ? updatePerformer(current, existingId, draft) : createPerformer(current, draft);
    const saved = existingId ? next.find((item) => item.id === existingId) : next[next.length - 1];
    replacePerformers(next);
    if (!performerSyncEnabledRef.current) { setPerformerMessage("Серверная база ещё не готова. Изменение сохранено локально."); return null; }
    setPerformerState("saving");
    try { await performerRepository.upsertPerformer(userId, saved); serverPerformerIdsRef.current.add(saved.id); setPerformerState("ready"); setPerformerMessage("Карточка сохранена"); }
    catch (error) { setPerformerState("save-error"); setPerformerMessage(`${error.message}. Локальная копия сохранена.`); return null; }
    if (saved) {
      if (addToQuickAccess) await addQuickAccessForPerformer(saved.id);
      else await removeQuickAccessForPerformer(saved.id);
    }
    return saved;
  };
  const togglePerformerQuickAccess = async (performerId) => quickAccessRef.current.items.some((item) => item.performerId === performerId)
    ? removeQuickAccessForPerformer(performerId)
    : addQuickAccessForPerformer(performerId);
  const deletePerformerCard = async (performerId) => {
    if (!performerSyncEnabledRef.current) { setPerformerMessage("Удаление доступно после загрузки серверной базы"); return false; }
    setPerformerState("saving");
    try { await performerRepository.deletePerformer(userId, performerId); }
    catch (error) { setPerformerState("save-error"); setPerformerMessage(error.message); return false; }
    replacePerformers(removePerformer(performersRef.current, performerId));
    serverPerformerIdsRef.current.delete(performerId);
    replaceQuickAccess(removeQuickAccessByPerformerId(quickAccessRef.current, performerId));
    setPerformerState("ready"); setPerformerMessage("Карточка удалена"); return true;
  };

  const handleQuickAccessMigration = async () => {
    setQuickAccessState("migrating"); setQuickAccessMessage("");
    try {
      const results = await migrateLocalQuickAccess({ userId, items: quickAccessMigrationCandidates, performerIds: [...serverPerformerIdsRef.current], repository: quickAccessRepository });
      const serverQuickAccess = await quickAccessRepository.listQuickAccessItems(userId, [...serverPerformerIdsRef.current]);
      replaceQuickAccess(serverQuickAccess); markQuickAccessServerOwner(userId); quickAccessSyncEnabledRef.current = true;
      setQuickAccessMigrationCandidates([]); setQuickAccessState("ready");
      const skipped = results.filter((result) => result.skipped).length;
      setQuickAccessMessage(skipped ? `Перенос завершён. Пропущено битых ссылок: ${skipped}` : "Быстрый доступ перенесён");
    } catch (error) { quickAccessSyncEnabledRef.current = false; setQuickAccessState("migration-offer"); setQuickAccessMessage(error.message); }
  };

  const handlePerformerMigration = async () => {
    setPerformerState("migrating"); setPerformerMessage("");
    try {
      await migrateLocalPerformers({ userId, performers: migrationCandidates, repository: performerRepository });
      const serverPerformers = await performerRepository.listPerformers(userId);
      serverPerformerIdsRef.current = new Set(serverPerformers.map((item) => item.id));
      replacePerformers(serverPerformers); markPerformerServerOwner(userId); performerSyncEnabledRef.current = true;
      setPerformerHydrationVersion((value) => value + 1);
      setMigrationCandidates([]); setPerformerState("ready"); setPerformerMessage(`Перенесено карточек: ${migrationCandidates.length}`);
    } catch (error) { performerSyncEnabledRef.current = false; setPerformerState("migration-offer"); setPerformerMessage(error.message); }
  };

  if (serverState === "loading") return <div className="kb-server-screen"><div className="kb-auth-loading">Загружаем проекты…</div></div>;
  if (serverState === "error") return <div className="kb-server-screen"><div className="kb-server-card">
    <div className="kb-server-title">Не удалось загрузить проекты</div>
    <div className="kb-server-text">{serverMessage}. Локальная копия не изменена.</div>
    <div className="kb-modal-actions">
      <button className="kb-btn kb-btn-ghost" type="button" onClick={() => setServerState("local-deferred")}>Продолжить с локальной копией</button>
      <button className="kb-btn kb-btn-primary" type="button" onClick={() => setRetryVersion((value) => value + 1)}>Повторить</button>
    </div>
  </div></div>;

  return (
    <>
      {(serverState === "migration-offer" || serverState === "migrating") && <div className="kb-modal-overlay kb-server-overlay">
        <div className="kb-modal kb-server-card" role="dialog" aria-modal="true" aria-labelledby="project-migration-title">
          <div className="kb-server-title" id="project-migration-title">Перенести локальные проекты</div>
          <div className="kb-server-text">На этом устройстве найдено проектов: {initialLocalState.current.projects.length}.<br />Перенести их в аккаунт, чтобы они были доступны с других устройств?<br />Локальная резервная копия сохранится.</div>
          {serverMessage && <div className="kb-server-error" role="alert">{serverMessage}</div>}
          <div className="kb-modal-actions">
            <button className="kb-btn kb-btn-ghost" type="button" disabled={serverState === "migrating"} onClick={() => setServerState("local-deferred")}>Не сейчас</button>
            <button className="kb-btn kb-btn-primary" type="button" disabled={serverState === "migrating"} onClick={handleMigration}>{serverState === "migrating" ? "Переносим…" : "Перенести проекты"}</button>
          </div>
        </div>
      </div>}
      {aiSettingsOpen && <AIPersonalizationModal settings={aiSettings} state={aiSettingsState} message={aiSettingsMessage} onSave={saveAiSettings} onClose={() => setAiSettingsOpen(false)} />}
      {(templateState === "migration-offer" || templateState === "migrating") && <div className="kb-modal-overlay kb-server-overlay">
        <div className="kb-modal kb-server-card" role="dialog" aria-modal="true" aria-labelledby="template-migration-title">
          <div className="kb-server-title" id="template-migration-title">Перенести библиотеку шаблонов</div>
          <div className="kb-server-text">На этом устройстве найдены шаблоны и категории.<br />Перенести их в аккаунт, чтобы библиотека была доступна с других устройств?<br />Локальная резервная копия сохранится.</div>
          {templateMessage && <div className="kb-server-error" role="alert">{templateMessage}</div>}
          <div className="kb-modal-actions"><button className="kb-btn kb-btn-ghost" type="button" disabled={templateState === "migrating"} onClick={() => setTemplateState("local-deferred")}>Не сейчас</button><button className="kb-btn kb-btn-primary" type="button" disabled={templateState === "migrating"} onClick={handleTemplateMigration}>{templateState === "migrating" ? "Переносим…" : "Перенести"}</button></div>
        </div>
      </div>}
      {["error", "save-error"].includes(templateState) && <div className="kb-toast" role="alert">{templateMessage}<button className="kb-toast-retry" type="button" onClick={() => templateState === "error" ? setTemplateRetry((value) => value + 1) : flushTemplateLibrary()}>Повторить</button></div>}
      {(performerState === "migration-offer" || performerState === "migrating") && <div className="kb-modal-overlay kb-server-overlay">
        <div className="kb-modal kb-server-card" role="dialog" aria-modal="true" aria-labelledby="performer-migration-title">
          <div className="kb-server-title" id="performer-migration-title">Перенести базу исполнителей</div>
          <div className="kb-server-text">На этом устройстве найдено карточек: {migrationCandidates.length}.<br />Перенести их в аккаунт, чтобы база была доступна с других устройств?<br />Локальная резервная копия сохранится.</div>
          {performerMessage && <div className="kb-server-error" role="alert">{performerMessage}</div>}
          <div className="kb-modal-actions"><button className="kb-btn kb-btn-ghost" type="button" disabled={performerState === "migrating"} onClick={() => { replacePerformers([...performersRef.current, ...migrationCandidates]); setPerformerState("local-deferred"); }}>Не сейчас</button><button className="kb-btn kb-btn-primary" type="button" disabled={performerState === "migrating"} onClick={handlePerformerMigration}>{performerState === "migrating" ? "Переносим…" : "Перенести карточки"}</button></div>
        </div>
      </div>}
      {performerState === "error" && <div className="kb-toast" role="alert">{performerMessage}. Локальная копия не изменена. <button className="kb-toast-retry" onClick={() => setPerformerRetry((value) => value + 1)}>Повторить</button></div>}
      {["saving", "save-error"].includes(performerState) && <div className="kb-toast" role="status">{performerState === "saving" ? "Сохраняем карточку…" : performerMessage}</div>}
      {migrationNotice && serverState === "ready" && <div className="kb-toast kb-toast-dismissible" role="status">
        <span>{migrationNotice}</span>
        <button type="button" className="kb-toast-close" aria-label="Закрыть уведомление" onClick={() => setMigrationNotice("")}>×</button>
      </div>}
      {serverMessage && serverState === "ready" && <div className="kb-toast" role="status">{serverMessage}{saveState === "error" && <button type="button" className="kb-toast-retry" onClick={flushAll}>Повторить</button>}</div>}
      {(quickAccessState === "migration-offer" || quickAccessState === "migrating") && <div className="kb-modal-overlay kb-server-overlay">
        <div className="kb-modal kb-server-card" role="dialog" aria-modal="true" aria-labelledby="quick-access-migration-title">
          <div className="kb-server-title" id="quick-access-migration-title">Перенести быстрый доступ</div>
          <div className="kb-server-text">На этом устройстве найдено исполнителей в быстром доступе: {quickAccessMigrationCandidates.length}.<br />Перенести их в аккаунт, чтобы список был доступен с других устройств?<br />Локальная резервная копия сохранится.</div>
          {quickAccessMessage && <div className="kb-server-error" role="alert">{quickAccessMessage}</div>}
          <div className="kb-modal-actions"><button className="kb-btn kb-btn-ghost" type="button" disabled={quickAccessState === "migrating"} onClick={() => { replaceQuickAccess({ items: [...quickAccessRef.current.items, ...quickAccessMigrationCandidates] }); setQuickAccessState("local-deferred"); }}>Не сейчас</button><button className="kb-btn kb-btn-primary" type="button" disabled={quickAccessState === "migrating"} onClick={handleQuickAccessMigration}>{quickAccessState === "migrating" ? "Переносим…" : "Перенести"}</button></div>
        </div>
      </div>}
      {["error", "save-error"].includes(quickAccessState) && <div className="kb-toast" role="alert">{quickAccessMessage}<button className="kb-toast-retry" type="button" onClick={() => setQuickAccessRetry((value) => value + 1)}>Повторить</button><button className="kb-toast-retry" type="button" onClick={() => { setQuickAccessState("ready"); setQuickAccessMessage(""); }}>Закрыть</button></div>}
      {aiGenerationReady && projectSource?.file && <ImportModal file={projectSource.file} instruction={projectSource.description || ""}
        onClose={() => setProjectSource(null)} onConfirm={createProjectFromEstimate} />}
      {aiGenerationReady && projectSource && !projectSource.file && <GenerateEstimateModal description={projectSource.description} performers={performers}
        onClose={() => setProjectSource(null)} onConfirm={createProjectFromEstimate} />}
      {editingTemplateId ? (
        <Workspace
          project={normalizeProject(projectTemplates.find((template) => template.id === editingTemplateId))}
          onChange={(updater) => handleTemplatesChange(projectTemplates.map((template) => template.id === editingTemplateId
            ? normalizeProject(updater(normalizeProject(template)))
            : template))}
          onBack={async () => { await flushTemplateLibrary(); setEditingTemplateId(null); }}
          editingTemplate
          taskTemplates={templateLibrary.taskTemplates} stageTemplates={templateLibrary.stageTemplates}
          onTaskTemplatesChange={handleTaskTemplatesChange} onStageTemplatesChange={handleStageTemplatesChange}
          performers={performers} onSavePerformer={savePerformer}
          quickAccess={quickAccess} onToggleQuickAccessPin={toggleQuickAccessPin} onRemoveQuickAccess={removeQuickAccessByItem}
          onOpenAiSettings={() => setAiSettingsOpen(true)}
          userAccount={{ id: userId, displayName: user?.user_metadata?.full_name || "Аккаунт Kubiki", accountLabel: user?.email || "Авторизованный пользователь" }}
          aiGenerationReady={aiGenerationReady}
          onSignOut={handleSignOut}
        />
      ) : currentProject ? (
        <Workspace project={currentProject} onChange={updateCurrent} onBack={async () => { await Promise.all([flushProject(currentProject.id), flushTemplateLibrary()]); setCurrentId(null); }}
          saveState={saveState} saveError={serverMessage} onRetrySave={() => flushProject(currentProject.id)}
          performers={performers} onSavePerformer={savePerformer}
          quickAccess={quickAccess} onToggleQuickAccessPin={toggleQuickAccessPin} onRemoveQuickAccess={removeQuickAccessByItem} onSignOut={handleSignOut}
          onOpenAiSettings={() => setAiSettingsOpen(true)}
          userAccount={{ id: userId, displayName: user?.user_metadata?.full_name || "Аккаунт Kubiki", accountLabel: user?.email || "Авторизованный пользователь" }}
          aiGenerationReady={aiGenerationReady}
          taskTemplates={templateLibrary.taskTemplates} stageTemplates={templateLibrary.stageTemplates}
          onTaskTemplatesChange={handleTaskTemplatesChange} onStageTemplatesChange={handleStageTemplatesChange}
          onRequestAiEdit={requestCurrentAiEdit} onCancelAiEdit={cancelCurrentAiEdit} onApplyAiEdit={applyCurrentAiEdit}
          onUndoAiEdit={undoCurrentAiEdit} canUndoAiEdit={aiUndoVersion >= 0 && aiUndoRef.current.has(currentProject.id)} />
      ) : activeSection === APP_SECTIONS.KNOWLEDGE_BASE ? (
        <KnowledgeBasePage performers={performers} performerState={performerState} performerMessage={performerMessage} onRetryPerformers={() => setPerformerRetry((value) => value + 1)} quickAccess={quickAccess} onSectionChange={setActiveSection}
          onSavePerformer={savePerformer} onToggleQuickAccess={togglePerformerQuickAccess} onDeletePerformer={deletePerformerCard}
          onOpenAiSettings={() => setAiSettingsOpen(true)} onSignOut={handleSignOut} />
      ) : (
        <Dashboard projects={projects} onOpen={setCurrentId} onCreate={createProject} onDelete={deleteProject}
          onImport={(file, description) => setProjectSource({ file, description })}
          onGenerate={(description, file) => setProjectSource({ file, description })}
          aiGenerationReady={aiGenerationReady}
          projectTemplates={projectTemplates}
          onTemplatesChange={handleTemplatesChange} onEditTemplate={setEditingTemplateId}
          categories={templateLibrary.categories} onCategoriesChange={(categories) => replaceTemplateLibrary((library) => ({ ...library, categories }))}
          openCategoryIds={templateLibrary.metadata.openCategoryIds || ["new"]} onOpenCategoryIdsChange={(openCategoryIds) => replaceTemplateLibrary((library) => ({ ...library, metadata: { ...library.metadata, openCategoryIds } }))}
          onToggleFavorite={toggleFavorite} onRenameProject={renameProject} onSectionChange={setActiveSection} onOpenAiSettings={() => setAiSettingsOpen(true)} onSignOut={handleSignOut}
          userAccount={{ id: userId, displayName: user?.user_metadata?.full_name || "Аккаунт Kubiki", accountLabel: user?.email || "Авторизованный пользователь" }} />
      )}
    </>
  );
}
