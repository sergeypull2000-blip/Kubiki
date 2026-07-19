import { useState, useEffect, useCallback } from "react";
import { makeProject } from "./store.js";
import { useGeistFont } from "./hooks.js";
import { Dashboard } from "./components/Dashboard.jsx";
import { Workspace } from "./components/Workspace.jsx";
import { CSS } from "./styles.js";
import { TEMPLATE_KEYS, saveTemplates, cloneProjectTemplate, migrateProjectTemplates } from "./templates.js";

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

export default function KubikiApp() {
  useGeistFont();
  const [projects, setProjects] = useState(() => loadStoredState()?.projects || []);
  const [currentId, setCurrentId] = useState(() => loadStoredState()?.currentId || null);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const currentProject = projects.find((p) => p.id === currentId) || null;

  // шаблоны проектов — управляемое состояние (нужно для DnD папок)
  const [projectTemplates, setProjectTemplates] = useState(() =>
    migrateProjectTemplates()
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ projects, currentId }));
    } catch (_) { /* переполнение хранилища / приватный режим — тихо пропускаем */ }
  }, [projects, currentId]);

  // синхронизация шаблонов в localStorage
  const handleTemplatesChange = useCallback((updated) => {
    setProjectTemplates(updated);
    saveTemplates(TEMPLATE_KEYS.projects, updated);
  }, []);

  const createProject = (template) => {
    const p = template ? cloneProjectTemplate(template) : makeProject();
    p.createdAt = new Date().toISOString();
    setProjects((prev) => [...prev, p]);
    setCurrentId(p.id);
  };
  const deleteProject = (id) => setProjects((prev) => prev.filter((p) => p.id !== id));
  const toggleFavorite = (id) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, favorite: !p.favorite } : p));
  const renameProject = (id, name) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p));
  const updateCurrent = (updater) =>
    setProjects((prev) => prev.map((p) => (p.id === currentId ? updater(p) : p)));

  return (
    <>
      <style>{CSS}</style>
      {editingTemplateId ? (
        <Workspace
          project={projectTemplates.find((template) => template.id === editingTemplateId)}
          onChange={(updater) => handleTemplatesChange(projectTemplates.map((template) => template.id === editingTemplateId ? updater(template) : template))}
          onBack={() => setEditingTemplateId(null)}
          editingTemplate
        />
      ) : currentProject ? (
        <Workspace project={currentProject} onChange={updateCurrent} onBack={() => setCurrentId(null)} />
      ) : (
        <Dashboard projects={projects} onOpen={setCurrentId} onCreate={createProject} onDelete={deleteProject}
          projectTemplates={projectTemplates}
          onTemplatesChange={handleTemplatesChange} onEditTemplate={setEditingTemplateId}
          onToggleFavorite={toggleFavorite} onRenameProject={renameProject} />
      )}
    </>
  );
}
