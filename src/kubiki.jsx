import { useState, useEffect, useCallback, useRef } from "react";
import { makeProject, normalizeProject } from "./store.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Workspace } from "./components/Workspace.jsx";
import { KnowledgeBasePage } from "./components/KnowledgeBasePage.jsx";
import { TEMPLATE_KEYS, saveTemplates, cloneProjectTemplate, migrateProjectTemplates } from "./templates.js";
import { ImportModal, GenerateEstimateModal } from "./importExcel.jsx";
import { APP_SECTIONS } from "./appNavigation.js";
import { createPerformer, loadPerformerLibrary, removePerformer, savePerformerLibrary, updatePerformer } from "./performerLibrary.js";
import { applyQuickAccessPreference, loadQuickAccessState, migrateLegacyQuickAccess, removeQuickAccessByPerformerId, saveQuickAccessState } from "./quickAccess.js";
import { projectRepository } from "./repositories/projectRepository.js";
import { createLocalServerBackup, diffProjectCollections, migrateLocalProjects, shouldOfferProjectMigration } from "./projectServer.js";

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

export default function KubikiApp({ userId, onSignOut }) {
  const initialLocalState = useRef(loadStoredState(userId) || { projects: [], currentId: null });
  const [projects, setProjects] = useState(() => initialLocalState.current.projects || []);
  const projectsRef = useRef(projects);
  const [currentId, setCurrentId] = useState(() => initialLocalState.current.currentId || null);
  const [serverState, setServerState] = useState("loading");
  const [serverMessage, setServerMessage] = useState("");
  const [saveState, setSaveState] = useState("saved");
  const [retryVersion, setRetryVersion] = useState(0);
  const syncEnabledRef = useRef(false);
  const timersRef = useRef(new Map());
  const pendingRef = useRef(new Map());
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [projectSource, setProjectSource] = useState(null);
  const [activeSection, setActiveSection] = useState(APP_SECTIONS.PROJECTS);
  const [performers, setPerformers] = useState(loadPerformerLibrary);
  const [quickAccess, setQuickAccess] = useState(() => migrateLegacyQuickAccess(loadQuickAccessState()));
  const storedCurrentProject = projects.find((p) => p.id === currentId) || null;
  const currentProject = storedCurrentProject ? normalizeProject(storedCurrentProject) : null;

  const replaceProjects = useCallback((next) => {
    projectsRef.current = next;
    setProjects(next);
  }, []);

  const saveProjectNow = useCallback(async (project) => {
    if (!syncEnabledRef.current || !project) return false;
    setSaveState("saving");
    try {
      await projectRepository.upsertProject(userId, project);
      pendingRef.current.delete(project.id);
      setSaveState("saved");
      setServerMessage("");
      return true;
    } catch (error) {
      pendingRef.current.set(project.id, project);
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
    let cancelled = false;
    const timers = timersRef.current;
    const pending = pendingRef.current;
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
          setServerMessage("На устройстве остались локальные проекты. Они сохранены в резервной копии и не объединены с серверными.");
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
    };
  }, [userId, retryVersion, replaceProjects]);

  // шаблоны проектов — управляемое состояние (нужно для DnD папок)
  const [projectTemplates, setProjectTemplates] = useState(() =>
    migrateProjectTemplates()
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, currentId, serverUserId: userId }));
    } catch (_) { /* переполнение хранилища / приватный режим — тихо пропускаем */ }
  }, [projects, currentId, userId]);

  useEffect(() => { savePerformerLibrary(performers); }, [performers]);
  useEffect(() => { saveQuickAccessState(quickAccess); }, [quickAccess]);

  // синхронизация шаблонов в localStorage
  const handleTemplatesChange = useCallback((updated) => {
    setProjectTemplates(updated);
    saveTemplates(TEMPLATE_KEYS.projects, updated);
  }, []);

  const commitProject = useCallback((id, updater, delay = 800) => {
    const existing = projectsRef.current.find((project) => project.id === id);
    if (!existing) return null;
    const next = normalizeProject(updater(normalizeProject(existing)));
    replaceProjects(projectsRef.current.map((project) => project.id === id ? next : project));
    scheduleProjectSave(next, delay);
    return next;
  }, [replaceProjects, scheduleProjectSave]);

  const createProject = (template) => {
    const p = normalizeProject(template ? cloneProjectTemplate(template) : makeProject());
    p.createdAt = new Date().toISOString();
    replaceProjects([...projectsRef.current, p]);
    scheduleProjectSave(p, 0);
    setCurrentId(p.id);
  };
  const createProjectFromEstimate = (stages, meta) => {
    const project = makeProject();
    project.createdAt = new Date().toISOString();
    project.stages = stages;
    if (meta && Number.isFinite(meta.globalMarkup)) project.globalMarkup = meta.globalMarkup;
    if (meta?.projectName) project.name = meta.projectName;
    const normalized = normalizeProject(project);
    replaceProjects([...projectsRef.current, normalized]);
    scheduleProjectSave(normalized, 0);
    setProjectSource(null);
    setCurrentId(project.id);
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
    replaceProjects(projectsRef.current.filter((project) => project.id !== id));
    if (currentId === id) setCurrentId(null);
  };
  const toggleFavorite = (id) => commitProject(id, (project) => ({ ...project, favorite: !project.favorite }), 0);
  const renameProject = (id, name) => commitProject(id, (project) => ({ ...project, name }));
  const updateCurrent = (updater) => commitProject(currentId, updater);

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
    await flushAll();
    syncEnabledRef.current = false;
    await onSignOut();
  };
  const savePerformer = (draft, addToQuickAccess, existingId = null) => {
    const next = existingId ? updatePerformer(performers, existingId, draft) : createPerformer(performers, draft);
    const saved = existingId ? next.find((item) => item.id === existingId) : next[next.length - 1];
    setPerformers(next);
    if (saved) setQuickAccess((current) => addToQuickAccess
      ? applyQuickAccessPreference(current, saved.id, true)
      : removeQuickAccessByPerformerId(current, saved.id));
  };
  const togglePerformerQuickAccess = (performerId) => setQuickAccess((current) => current.items.some((item) => item.performerId === performerId)
    ? removeQuickAccessByPerformerId(current, performerId)
    : applyQuickAccessPreference(current, performerId, true));
  const deletePerformerCard = (performerId) => {
    setPerformers((current) => removePerformer(current, performerId));
    setQuickAccess((current) => removeQuickAccessByPerformerId(current, performerId));
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
      {serverMessage && serverState === "ready" && <div className="kb-toast" role="status">{serverMessage}{saveState === "error" && <button type="button" className="kb-toast-retry" onClick={flushAll}>Повторить</button>}</div>}
      {projectSource?.file && <ImportModal file={projectSource.file} instruction={projectSource.description || ""}
        onClose={() => setProjectSource(null)} onConfirm={createProjectFromEstimate} />}
      {projectSource && !projectSource.file && <GenerateEstimateModal description={projectSource.description}
        onClose={() => setProjectSource(null)} onConfirm={createProjectFromEstimate} />}
      {editingTemplateId ? (
        <Workspace
          project={normalizeProject(projectTemplates.find((template) => template.id === editingTemplateId))}
          onChange={(updater) => handleTemplatesChange(projectTemplates.map((template) => template.id === editingTemplateId
            ? normalizeProject(updater(normalizeProject(template)))
            : template))}
          onBack={() => setEditingTemplateId(null)}
          editingTemplate
          performers={performers} onPerformersChange={setPerformers}
          quickAccess={quickAccess} onQuickAccessChange={setQuickAccess}
          onSignOut={handleSignOut}
        />
      ) : currentProject ? (
        <Workspace project={currentProject} onChange={updateCurrent} onBack={async () => { await flushProject(currentProject.id); setCurrentId(null); }}
          saveState={saveState} saveError={serverMessage} onRetrySave={() => flushProject(currentProject.id)}
          performers={performers} onPerformersChange={setPerformers}
          quickAccess={quickAccess} onQuickAccessChange={setQuickAccess} onSignOut={handleSignOut} />
      ) : activeSection === APP_SECTIONS.KNOWLEDGE_BASE ? (
        <KnowledgeBasePage performers={performers} quickAccess={quickAccess} onSectionChange={setActiveSection}
          onSavePerformer={savePerformer} onToggleQuickAccess={togglePerformerQuickAccess} onDeletePerformer={deletePerformerCard}
          onSignOut={handleSignOut} />
      ) : (
        <Dashboard projects={projects} onOpen={setCurrentId} onCreate={createProject} onDelete={deleteProject}
          onImport={(file, description) => setProjectSource({ file, description })}
          onGenerate={(description, file) => setProjectSource({ file, description })}
          projectTemplates={projectTemplates}
          onTemplatesChange={handleTemplatesChange} onEditTemplate={setEditingTemplateId}
          onToggleFavorite={toggleFavorite} onRenameProject={renameProject} onSectionChange={setActiveSection} onSignOut={handleSignOut} />
      )}
    </>
  );
}
