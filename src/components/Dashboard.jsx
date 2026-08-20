import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, X, Box, FileText, Bookmark, Star, MoreHorizontal, Pencil, Trash2, UploadCloud } from "lucide-react";
import { formatMoney } from "../utils.js";
import { projectSum } from "../calculations.js";
import { AppTopNavigation } from "./AppTopNavigation.jsx";
import { createProjectTemplate } from "../templates.js";
import LeftPanel from "./LeftPanel.jsx";
import { AccountControl } from "./AccountControl.jsx";

const DASH_SIDEBAR_MIN = 200;
const DASH_SIDEBAR_MAX = 340;
const DASH_SIDEBAR_DEFAULT = 240;

function isToday(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

/* Multi-sheet projects never show a "project total" (sheets are independent and
   are never summed). A single sheet keeps the legacy sum/stage count; multiple
   sheets show the number of independent estimates instead. */
const sheetCount = (item) => (Array.isArray(item?.sheets) && item.sheets.length) ? item.sheets.length : 1;
const sheetsLabel = (n) => (n === 1 ? "1 смета" : (n >= 2 && n <= 4 ? `${n} сметы` : `${n} смет`));

function EntityCard({ item, template = false, onOpen, onDelete, onMakeTemplate, onToggleFavorite, onEdit, onRename }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event) => { if (!cardRef.current?.contains(event.target)) setMenuOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const count = sheetCount(item);

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
      <div className="kb-card-sum">{count <= 1 ? `${formatMoney(projectSum(item))} ₽` : sheetsLabel(count)}</div>
      {count <= 1 && <div className="kb-card-meta">{`${item.stages?.length || 0} этапов`}</div>}
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

function ProjectSourceModal({ mode, aiGenerationReady, onClose, onSubmit }) {
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const isImport = mode === "import";
  const pickFile = (nextFile) => {
    const supported = isImport ? /\.(xlsx|csv|pdf)$/i : /\.(docx|doc)$/i;
    if (nextFile && supported.test(nextFile.name)) setFile(nextFile);
    if (inputRef.current) inputRef.current.value = "";
  };
  const canSubmit = aiGenerationReady && (isImport ? Boolean(file) : Boolean(description.trim() || file));
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ file, description: description.trim() });
  };

  return <div className="kb-modal-overlay" onMouseDown={onClose}>
    <div className={`kb-modal kb-project-source-modal is-${mode}`} onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head">
        <span className="kb-modal-title">{isImport ? "Импортировать смету" : "Создать по описанию"}</span>
        <button type="button" className="kb-icon-btn" onClick={onClose}><X size={16} strokeWidth={1.5} /></button>
      </div>
      <div className="kb-modal-body">
        {!isImport && <textarea className="kb-generate-textarea kb-project-source-description is-primary" rows={7}
          value={description} onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
          placeholder="Описание проекта" />}
        <input ref={inputRef} type="file" accept={isImport ? ".xlsx,.csv,.pdf" : ".docx,.doc"} hidden onChange={(event) => pickFile(event.target.files?.[0])} />
        <div className={`kb-import-zone kb-project-source-file ${isImport ? "is-primary" : "is-secondary"}${over ? " is-over" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => { event.preventDefault(); setOver(false); pickFile(event.dataTransfer.files?.[0]); }}>
          <UploadCloud size={isImport ? 20 : 16} strokeWidth={1.5} />
          <div className="kb-import-text">
            <strong>{file ? file.name : isImport ? "Выберите или перетащите файл" : "Прикрепить файл (необязательно)"}</strong>
            {isImport && <span>.xlsx, .csv, .pdf</span>}
          </div>
          {file && <button type="button" className="kb-icon-btn" title="Удалить файл"
            onClick={(event) => { event.stopPropagation(); setFile(null); }}><X size={14} /></button>}
        </div>
        {isImport && <textarea className="kb-generate-textarea kb-project-source-description is-secondary" rows={3}
          value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Дополнительные инструкции (необязательно)" />}
        <div className="kb-modal-actions">
          {!aiGenerationReady && <span className="kb-ai-hydration-note">Загружаем знания студии…</span>}
          <button type="button" className="kb-btn kb-btn-ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="kb-btn kb-btn-primary" disabled={!canSubmit}
            onClick={submit}>
            {isImport ? "Импортировать" : "Создать проект"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

function NewProjectCard({ onCreate }) {
  return <div className="kb-new-project-wrap">
    <button type="button" className="kb-card kb-card-new" onClick={onCreate}>
      <Plus size={20} strokeWidth={1.25} /><span>Новый проект</span>
    </button>
  </div>;
}

export function Dashboard({ projects, onOpen, onCreate, onImport, onGenerate, aiGenerationReady = false, onDelete, projectTemplates, onTemplatesChange, categories, onCategoriesChange, openCategoryIds, onOpenCategoryIdsChange, onEditTemplate, onToggleFavorite, onRenameProject, onSectionChange, onOpenAiSettings, onOpenUsage, onSignOut, onOpenFeedback, userAccount }) {
  const [activeNav, setActiveNav] = useState("all");
  const [toast, setToast] = useState("");
  const [sourceModal, setSourceModal] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem("kb-dashboard-sidebar-width"));
    return stored >= DASH_SIDEBAR_MIN && stored <= DASH_SIDEBAR_MAX ? stored : DASH_SIDEBAR_DEFAULT;
  });

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => { localStorage.setItem("kb-dashboard-sidebar-width", String(sidebarWidth)); }, [sidebarWidth]);

  const beginSidebarResize = useCallback((event) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const onMove = (moveEvent) => {
      setSidebarWidth(Math.min(DASH_SIDEBAR_MAX, Math.max(DASH_SIDEBAR_MIN, startWidth + (moveEvent.clientX - startX))));
    };
    const onUp = () => {
      document.body.classList.remove("kb-is-panel-resizing");
      window.removeEventListener("pointermove", onMove);
    };
    document.body.classList.add("kb-is-panel-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [sidebarWidth]);

  const accountControl = <AccountControl userAccount={userAccount} onOpenAiSettings={onOpenAiSettings} onOpenUsage={onOpenUsage} onOpenFeedback={onOpenFeedback} onSignOut={onSignOut} />;

  useEffect(() => {
    const categoryIds = new Set(categories.map((category) => category.id));
    if (projectTemplates.some((template) => !categoryIds.has(template.folderId))) {
      onTemplatesChange(projectTemplates.map((template) => categoryIds.has(template.folderId) ? template : { ...template, folderId: "new" }));
    }
  }, [categories, projectTemplates, onTemplatesChange]);

  const handleMakeTemplate = useCallback((project) => {
    const sourceProjectId = project.sourceProjectId || project.id;
    if (projectTemplates.some((item) => item.sourceProjectId === sourceProjectId)) { setToast("Этот проект уже сохранён как шаблон"); return; }
    onTemplatesChange([...projectTemplates, createProjectTemplate(project, project.name || "Шаблон сметы")]);
    setToast("Шаблон сохранён");
  }, [onTemplatesChange, projectTemplates]);

  const deleteTemplate = (id) => onTemplatesChange(projectTemplates.filter((template) => template.id !== id));
  const renameTemplate = (id, name) => onTemplatesChange(projectTemplates.map((template) => template.id === id ? { ...template, templateName: name, name } : template));
  const moveTemplate = (templateId, folderId) => onTemplatesChange(projectTemplates.map((template) => template.id === templateId ? { ...template, folderId } : template));
  const deleteCategory = (id) => {
    onTemplatesChange(projectTemplates.map((template) => template.folderId === id ? { ...template, folderId: "new" } : template));
    const next = categories.filter((category) => category.id !== id);
    onCategoriesChange(next);
    if (activeNav === `category:${id}`) setActiveNav("category:new");
  };

  const allProjects = projects || [];
  const templates = projectTemplates || [];
  const activeCategory = categories.find((category) => `category:${category.id}` === activeNav);
  const visibleProjects = (activeNav === "recent" ? allProjects.filter((project) => isToday(project.createdAt))
    : activeNav === "favorites" ? allProjects.filter((project) => project.favorite) : allProjects)
    .map((project, index) => ({ project, index }))
    .sort((a, b) => {
      const timeA = Date.parse(a.project.createdAt || "") || a.index;
      const timeB = Date.parse(b.project.createdAt || "") || b.index;
      return timeB - timeA;
    }).map(({ project }) => project);
  const visibleTemplates = activeCategory ? templates.filter((template) => template.folderId === activeCategory.id) : [];

  return <div className="kb-root kb-root-dash">
    <AppTopNavigation activeSection="projects" onSectionChange={onSectionChange} onOpenAiSettings={onOpenAiSettings} onSignOut={onSignOut} edge hideAccountActions />
    <div className="kb-dashboard-layout">
      <LeftPanel activeNav={activeNav} onNavChange={setActiveNav} categories={categories} onCategoriesChange={onCategoriesChange}
        openCategoryIds={openCategoryIds} onOpenCategoryIdsChange={onOpenCategoryIdsChange}
        templates={templates} onMoveTemplate={moveTemplate} onDeleteCategory={deleteCategory}
        onRenameTemplate={renameTemplate} onDeleteTemplate={deleteTemplate}
        width={sidebarWidth} accountControl={accountControl} onOpenFeedback={onOpenFeedback} />
      <div className="kb-dash-resizer" role="separator" aria-label="Изменить ширину панели" aria-orientation="vertical" onPointerDown={beginSidebarResize} />
      <main className="kb-dashboard"><div className="kb-board">
        {activeCategory ? (visibleTemplates.length ? visibleTemplates.map((template) =>
          <EntityCard key={template.id} item={template} template onOpen={onCreate} onDelete={deleteTemplate} onEdit={onEditTemplate} onRename={renameTemplate} />
        ) : <div className="kb-dash-empty">В этой категории пока нет шаблонов</div>) : <>
          {activeNav === "all" && <NewProjectCard onCreate={() => onCreate(null)} />}
          {visibleProjects.map((project) => <EntityCard key={project.id} item={project} onOpen={(item) => onOpen(item.id)} onDelete={onDelete}
            onMakeTemplate={handleMakeTemplate} onToggleFavorite={onToggleFavorite} onRename={onRenameProject} />)}
          {!visibleProjects.length && <div className="kb-dash-empty">{activeNav === "recent" ? "Нет недавних проектов" : activeNav === "favorites" ? "Нет избранных проектов" : "Нет проектов"}</div>}
        </>}
      </div></main>
    </div>
    {sourceModal && <ProjectSourceModal mode={sourceModal} aiGenerationReady={aiGenerationReady} onClose={() => setSourceModal(null)}
      onSubmit={({ file, description }) => {
        setSourceModal(null);
        if (sourceModal === "import") onImport(file, description);
        else onGenerate(description, file);
      }} />}
    {toast && <div className="kb-toast" role="status">{toast}</div>}
  </div>;
}
