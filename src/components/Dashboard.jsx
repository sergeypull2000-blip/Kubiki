import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, X, Box, FileText, Bookmark, Star, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { fmt } from "../utils.js";
import { projectSum } from "../calculations.js";
import { Logo } from "../Logo.jsx";
import { saveProjectTemplate, loadTemplates, TEMPLATE_KEYS } from "../templates.js";
import LeftPanel, { loadDashboardCategories } from "./LeftPanel.jsx";

function isToday(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function EntityCard({ item, template = false, onOpen, onDelete, onMakeTemplate, onToggleFavorite, onEdit, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => { if (!cardRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  return (
    <div ref={cardRef} className={`kb-card${template ? " kb-card-template" : ""}`}
      draggable={template}
      onDragStart={template ? (event) => { event.dataTransfer.setData("application/x-kubiki-template", item.id); event.dataTransfer.effectAllowed = "move"; } : undefined}
      onClick={() => onOpen(item)}>
      {template ? (
        <>
          <span className="kb-template-badge">Шаблон</span>
          <button type="button" className="kb-card-menu-btn" onClick={(event) => { event.stopPropagation(); setMenuOpen((open) => !open); }} title="Действия с шаблоном">
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && <div className="kb-card-context" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { setMenuOpen(false); onEdit(item.id); }}><Pencil size={14} />Редактировать</button>
            <button type="button" className="is-danger" onClick={() => { setMenuOpen(false); onDelete(item.id); }}><Trash2 size={14} />Удалить</button>
          </div>}
        </>
      ) : (
        <button type="button" className="kb-card-del" onClick={(event) => { event.stopPropagation(); onDelete(item.id); }} title="Удалить проект">
          <X size={12} strokeWidth={1.5} />
        </button>
      )}
      <div className="kb-card-icon">{template ? <FileText size={19} strokeWidth={1.25} /> : <Box size={19} strokeWidth={1.25} />}</div>
      <input className="kb-card-name kb-card-name-input"
        value={template ? (item.templateName ?? item.name ?? "") : (item.name ?? "")}
        placeholder={template ? "Шаблон без названия" : "Без названия"}
        aria-label={template ? "Название шаблона" : "Название проекта"}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onRename(item.id, event.target.value)} />
      <div className="kb-card-sum">{fmt(projectSum(item))} ₽</div>
      <div className="kb-card-meta">{item.stages?.length || 0} этапов</div>
      {!template && <div className="kb-card-actions">
        <button type="button" className={`kb-icon-btn kb-card-favorite${item.favorite ? " is-active" : ""}`}
          onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.id); }} title={item.favorite ? "Убрать из избранного" : "Добавить в избранное"}>
          <Star size={15} fill={item.favorite ? "currentColor" : "none"} strokeWidth={1.5} />
        </button>
        <button type="button" className="kb-icon-btn kb-card-tpl-btn" onClick={(event) => { event.stopPropagation(); onMakeTemplate(item); }} title="Сохранить как шаблон">
          <Bookmark size={14} strokeWidth={1.5} />
        </button>
      </div>}
    </div>
  );
}

export function Dashboard({ projects, onOpen, onCreate, onDelete, projectTemplates, onTemplatesChange, onEditTemplate, onToggleFavorite, onRenameProject }) {
  const [activeNav, setActiveNav] = useState("all");
  const [categories, setCategories] = useState(loadDashboardCategories);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const categoryIds = new Set(categories.map((category) => category.id));
    if (projectTemplates.some((template) => !categoryIds.has(template.folderId))) {
      onTemplatesChange(projectTemplates.map((template) => categoryIds.has(template.folderId) ? template : { ...template, folderId: "new" }));
    }
  }, [categories, projectTemplates, onTemplatesChange]);

  const handleMakeTemplate = useCallback((project) => {
    const result = saveProjectTemplate(project, project.name || "Шаблон сметы");
    onTemplatesChange(loadTemplates(TEMPLATE_KEYS.projects));
    setToast(result.created ? "Шаблон сохранён" : "Этот проект уже сохранён как шаблон");
  }, [onTemplatesChange]);

  const deleteTemplate = (id) => onTemplatesChange(projectTemplates.filter((template) => template.id !== id));
  const renameTemplate = (id, name) => onTemplatesChange(projectTemplates.map((template) => template.id === id ? { ...template, templateName: name, name } : template));
  const moveTemplate = (templateId, folderId) => onTemplatesChange(projectTemplates.map((template) => template.id === templateId ? { ...template, folderId } : template));
  const deleteCategory = (id) => {
    onTemplatesChange(projectTemplates.map((template) => template.folderId === id ? { ...template, folderId: "new" } : template));
    const next = categories.filter((category) => category.id !== id);
    setCategories(next);
    if (activeNav === `category:${id}`) setActiveNav("category:new");
  };

  const allProjects = projects || [];
  const templates = projectTemplates || [];
  const activeCategory = categories.find((category) => `category:${category.id}` === activeNav);
  const visibleProjects = activeNav === "recent" ? allProjects.filter((project) => isToday(project.createdAt))
    : activeNav === "favorites" ? allProjects.filter((project) => project.favorite) : allProjects;
  const visibleTemplates = activeCategory ? templates.filter((template) => template.folderId === activeCategory.id) : [];

  return <div className="kb-root">
    <header className="kb-header kb-header-dash"><div className="kb-header-inner"><Logo size={21} /><div className="kb-brand"><span className="kb-brand-name">Kubiki</span><span className="kb-brand-sub">умная смета для продакшена и агентств</span></div></div></header>
    <div className="kb-dashboard-layout">
      <LeftPanel activeNav={activeNav} onNavChange={setActiveNav} categories={categories} onCategoriesChange={setCategories}
        templates={templates} onMoveTemplate={moveTemplate} onDeleteCategory={deleteCategory}
        onRenameTemplate={renameTemplate} onDeleteTemplate={deleteTemplate} />
      <main className="kb-dashboard"><div className="kb-board">
        {activeCategory ? (visibleTemplates.length ? visibleTemplates.map((template) =>
          <EntityCard key={template.id} item={template} template onOpen={onCreate} onDelete={deleteTemplate} onEdit={onEditTemplate} onRename={renameTemplate} />
        ) : <div className="kb-dash-empty">В этой категории пока нет шаблонов</div>) : <>
          {visibleProjects.map((project) => <EntityCard key={project.id} item={project} onOpen={(item) => onOpen(item.id)} onDelete={onDelete}
            onMakeTemplate={handleMakeTemplate} onToggleFavorite={onToggleFavorite} onRename={onRenameProject} />)}
          {!visibleProjects.length && <div className="kb-dash-empty">{activeNav === "recent" ? "Нет недавних проектов" : activeNav === "favorites" ? "Нет избранных проектов" : "Нет проектов"}</div>}
          {activeNav === "all" && <button type="button" className="kb-card kb-card-new" onClick={() => onCreate(null)}><Plus size={20} strokeWidth={1.25} /><span>Новый проект</span></button>}
        </>}
      </div></main>
    </div>
    {toast && <div className="kb-toast" role="status">{toast}</div>}
  </div>;
}
