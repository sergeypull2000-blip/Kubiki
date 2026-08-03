import { useState, useEffect, useCallback } from "react";
import { makeProject, normalizeProject } from "./store.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Workspace } from "./components/Workspace.jsx";
import { KnowledgeBasePage } from "./components/KnowledgeBasePage.jsx";
import { TEMPLATE_KEYS, saveTemplates, cloneProjectTemplate, migrateProjectTemplates } from "./templates.js";
import { ImportModal, GenerateEstimateModal } from "./importExcel.jsx";
import { APP_SECTIONS } from "./appNavigation.js";
import { createPerformer, loadPerformerLibrary, removePerformer, savePerformerLibrary, updatePerformer } from "./performerLibrary.js";
import { applyQuickAccessPreference, loadQuickAccessState, migrateLegacyQuickAccess, removeQuickAccessByPerformerId, saveQuickAccessState } from "./quickAccess.js";

/* ============================================================
   п.7.1: автосохранение в localStorage браузера — заменяет бэкенд
   на первых порах. Продюсер открывает приложение, работает, закрывает
   вкладку — при следующем открытии смета на месте (пока не чистит кэш).
   ============================================================ */
const STORAGE_KEY = "kubiki_state_v1";
function loadStoredState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.projects) ? parsed : null;
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

export default function KubikiApp({ onSignOut }) {
  const [projects, setProjects] = useState(() => loadStoredState()?.projects || []);
  const [currentId, setCurrentId] = useState(() => loadStoredState()?.currentId || null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [projectSource, setProjectSource] = useState(null);
  const [activeSection, setActiveSection] = useState(APP_SECTIONS.PROJECTS);
  const [performers, setPerformers] = useState(loadPerformerLibrary);
  const [quickAccess, setQuickAccess] = useState(() => migrateLegacyQuickAccess(loadQuickAccessState()));
  const storedCurrentProject = projects.find((p) => p.id === currentId) || null;
  const currentProject = storedCurrentProject ? normalizeProject(storedCurrentProject) : null;

  // шаблоны проектов — управляемое состояние (нужно для DnD папок)
  const [projectTemplates, setProjectTemplates] = useState(() =>
    migrateProjectTemplates()
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, currentId }));
    } catch (_) { /* переполнение хранилища / приватный режим — тихо пропускаем */ }
  }, [projects, currentId]);

  useEffect(() => { savePerformerLibrary(performers); }, [performers]);
  useEffect(() => { saveQuickAccessState(quickAccess); }, [quickAccess]);

  // синхронизация шаблонов в localStorage
  const handleTemplatesChange = useCallback((updated) => {
    setProjectTemplates(updated);
    saveTemplates(TEMPLATE_KEYS.projects, updated);
  }, []);

  const createProject = (template) => {
    const p = normalizeProject(template ? cloneProjectTemplate(template) : makeProject());
    p.createdAt = new Date().toISOString();
    setProjects((prev) => [...prev, p]);
    setCurrentId(p.id);
  };
  const createProjectFromEstimate = (stages, meta) => {
    const project = makeProject();
    project.createdAt = new Date().toISOString();
    project.stages = stages;
    if (meta && Number.isFinite(meta.globalMarkup)) project.globalMarkup = meta.globalMarkup;
    if (meta?.projectName) project.name = meta.projectName;
    setProjects((previous) => [...previous, normalizeProject(project)]);
    setProjectSource(null);
    setCurrentId(project.id);
  };
  const deleteProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));
  const toggleFavorite = (id) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, favorite: !p.favorite } : p));
  const renameProject = (id, name) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p));
  const updateCurrent = (updater) =>
    setProjects((prev) => prev.map((p) => (p.id === currentId
      ? normalizeProject(updater(normalizeProject(p)))
      : p)));
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

  return (
    <>
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
          onSignOut={onSignOut}
        />
      ) : currentProject ? (
        <Workspace project={currentProject} onChange={updateCurrent} onBack={() => setCurrentId(null)}
          performers={performers} onPerformersChange={setPerformers}
          quickAccess={quickAccess} onQuickAccessChange={setQuickAccess} onSignOut={onSignOut} />
      ) : activeSection === APP_SECTIONS.KNOWLEDGE_BASE ? (
        <KnowledgeBasePage performers={performers} quickAccess={quickAccess} onSectionChange={setActiveSection}
          onSavePerformer={savePerformer} onToggleQuickAccess={togglePerformerQuickAccess} onDeletePerformer={deletePerformerCard}
          onSignOut={onSignOut} />
      ) : (
        <Dashboard projects={projects} onOpen={setCurrentId} onCreate={createProject} onDelete={deleteProject}
          onImport={(file, description) => setProjectSource({ file, description })}
          onGenerate={(description, file) => setProjectSource({ file, description })}
          projectTemplates={projectTemplates}
          onTemplatesChange={handleTemplatesChange} onEditTemplate={setEditingTemplateId}
          onToggleFavorite={toggleFavorite} onRenameProject={renameProject} onSectionChange={setActiveSection} onSignOut={onSignOut} />
      )}
    </>
  );
}
