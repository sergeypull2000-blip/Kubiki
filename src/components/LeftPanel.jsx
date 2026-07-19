import { useState } from "react";
import { ChevronDown, ChevronRight, ListTodo, User, Folder, FileText, Pencil, Trash2, Check, X } from "lucide-react";
import { CUSTOM_STAGE } from "../constants.js";
import { DND_TYPES, useDragSource } from "../store.js";
import { uid } from "../utils.js";
import { fmt } from "../utils.js";
import { executorSum } from "../calculations.js";

function StageChip({ preset, onClick }) {
  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.STAGE, { presetKey: preset.key });
  const Icon = preset.icon;
  return (
    <div className={"kb-chip" + (isDragging ? " kb-chip-dragging" : "")}
      {...dragHandlers} onClick={onClick} title="Перетащите на лист или кликните, чтобы добавить этап">
      <Icon size={14} strokeWidth={1.5} />
      <span>{preset.label || preset.name}</span>
    </div>
  );
}

function SimpleChip({ icon: Icon, label, dndType, payload, onClick, hint }) {
  const { isDragging, dragHandlers } = useDragSource(dndType, payload);
  return (
    <div className={"kb-chip" + (isDragging ? " kb-chip-dragging" : "")} {...dragHandlers} onClick={onClick} title={hint}>
      <Icon size={14} strokeWidth={1.5} />
      <span>{label}</span>
    </div>
  );
}

function templateLabel(template, fallback) {
  if (template.templateName || template.name) return template.templateName || template.name;
  const nameTag = template.tags?.find((tag) => tag.key === "name");
  return nameTag?.value || fallback;
}

function TemplateItem({ template, dndType, payloadKey, fallback, onApply, onRemove }) {
  const { isDragging, dragHandlers } = useDragSource(dndType, { [payloadKey]: template.id });
  const label = templateLabel(template, fallback);
  const templateAmount = payloadKey === "templateExecutorId" ? executorSum(template) : 0;
  return (
    <div className={"kb-template-item" + (isDragging ? " kb-chip-dragging" : "")}
      {...dragHandlers} onClick={() => onApply(template)} title={`Перетащите или нажмите, чтобы вставить «${label}»`}>
      <FileText size={13} strokeWidth={1.5} />
      <span className="kb-template-item-name">{label}</span>
      {templateAmount > 0 && <span className="kb-template-item-sum">{fmt(templateAmount)} ₽</span>}
      <button type="button" className="kb-template-item-del" title="Удалить шаблон"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => { event.stopPropagation(); onRemove(template.id); }}>
        <X size={12} />
      </button>
    </div>
  );
}

function PaletteSection({ title, children, defaultOpen = false, templates = [], dndType, payloadKey, fallback, onApply, onRemove }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="kb-palette-section">
      <button type="button" className="kb-palette-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={13} strokeWidth={1.5} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
      </button>
      {open && (
        <div className="kb-palette-items">
          {children}
          {templates.length > 0 ? <div className="kb-pal-templates">
            {templates.map((template) => <TemplateItem key={template.id} template={template}
              dndType={dndType} payloadKey={payloadKey} fallback={fallback}
              onApply={onApply} onRemove={onRemove} />)}
          </div> : <div className="kb-template-empty">Здесь пока нет шаблонов</div>}
        </div>
      )}
    </div>
  );
}

export function PalettePanel({ onAddStage, onAddTask, onAddExecutor,
  performerTemplates = [], taskTemplates = [], stageTemplates = [],
  onApplyPerformerTemplate, onApplyTaskTemplate, onApplyStageTemplate,
  onRemovePerformerTemplate, onRemoveTaskTemplate, onRemoveStageTemplate }) {
  return (
    <aside className="kb-palette">
      <PaletteSection title="Этапы" defaultOpen={true} templates={stageTemplates}
        dndType={DND_TYPES.STAGE} payloadKey="templateStageId" fallback="Этап"
        onApply={onApplyStageTemplate} onRemove={onRemoveStageTemplate} />

      <PaletteSection title="Задачи" defaultOpen={true} templates={taskTemplates}
        dndType={DND_TYPES.TASK} payloadKey="templateTaskId" fallback="Задача"
        onApply={onApplyTaskTemplate} onRemove={onRemoveTaskTemplate} />

      <PaletteSection title="Исполнители" defaultOpen={true} templates={performerTemplates}
        dndType={DND_TYPES.EXECUTOR} payloadKey="templateExecutorId" fallback="Исполнитель"
        onApply={onApplyPerformerTemplate} onRemove={onRemovePerformerTemplate} />

      <div className="kb-palette-foot">Тут вы можете создавать шаблоны этапов, задач и исполнителей</div>
    </aside>
  );
}

const FOLDERS_KEY = "kubiki_template_folders";
const FOLDERS_SCHEMA_KEY = "kubiki_template_folders_schema";
const FOLDERS_SCHEMA_VERSION = "2";
const DEFAULT_CATEGORIES = [
  { id: "new", name: "Новые", system: true },
  { id: "cg", name: "CG", legacyId: "CG" },
  { id: "marketing", name: "Маркетинг", legacyId: "Маркетинг" },
  { id: "production", name: "Съёмки", legacyId: "Продакшн" },
  { id: "web", name: "Разработка", legacyId: "Веб" },
];

export function loadDashboardCategories() {
  try {
    if (localStorage.getItem(FOLDERS_SCHEMA_KEY) !== FOLDERS_SCHEMA_VERSION) {
      const defaultsToSave = DEFAULT_CATEGORIES.filter((category) => !category.system);
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(defaultsToSave));
      localStorage.setItem(FOLDERS_SCHEMA_KEY, FOLDERS_SCHEMA_VERSION);

      const templatesKey = "kubiki_templates_projects";
      const templates = JSON.parse(localStorage.getItem(templatesKey) || "[]");
      if (Array.isArray(templates)) {
        const allowedFolders = new Set(DEFAULT_CATEGORIES.map((category) => category.id));
        const migratedTemplates = templates.map((template) => allowedFolders.has(template.folderId)
          ? template
          : { ...template, folderId: "new" });
        localStorage.setItem(templatesKey, JSON.stringify(migratedTemplates));
      }
      return DEFAULT_CATEGORIES;
    }
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw == null) return DEFAULT_CATEGORIES;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_CATEGORIES;
    const migrated = saved.filter((folder) => folder.id !== "new" && folder.id !== "uncategorized").map((folder) => {
      if (folder.id === "production" && folder.name === "Продакшн") return { ...folder, name: "Съёмки" };
      if (folder.id === "web" && folder.name === "Веб") return { ...folder, name: "Разработка" };
      return folder;
    });
    return [DEFAULT_CATEGORIES[0], ...migrated];
  } catch (_) {
    return DEFAULT_CATEGORIES;
  }
}

function saveCategories(categories) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(categories.filter((category) => !category.system))); } catch (_) {}
}

export default function LeftPanel({ activeNav, onNavChange, categories, onCategoriesChange, templates = [],
  onMoveTemplate, onDeleteCategory, onRenameTemplate, onDeleteTemplate }) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [openFolders, setOpenFolders] = useState(() => new Set(["new"]));
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");

  const addFolder = () => {
    if (!newFolderName.trim()) return;
    const folder = { id: uid(), name: newFolderName.trim(), order: Date.now() };
    const next = [...categories, folder];
    onCategoriesChange(next);
    saveCategories(next);
    setNewFolderName(""); setAddingFolder(false);
  };

  const toggleFolder = (id) => setOpenFolders((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const renameFolder = (id) => {
    if (!editingName.trim()) return;
    const next = categories.map((category) => category.id === id ? { ...category, name: editingName.trim() } : category);
    onCategoriesChange(next); saveCategories(next); setEditingId(null);
  };

  const renameTemplate = (id) => {
    const name = editingTemplateName.trim();
    if (!name) return;
    onRenameTemplate(id, name);
    setEditingTemplateId(null);
    setEditingTemplateName("");
  };

  return (
    <aside className="kb-dash-sidebar">
      <div className="kb-dash-nav-section-label">ПРОЕКТЫ</div>
      {[{ id: "all", name: "Все проекты" }, { id: "recent", name: "Последние" }, { id: "favorites", name: "Избранное" }].map((item) => (
        <button type="button" key={item.id}
          className={`kb-dash-nav-item${activeNav === item.id ? " kb-dash-nav-item-active" : ""}`}
          onClick={() => onNavChange(item.id)}>
          <span>{item.name}</span>
        </button>
      ))}
      <div className="kb-dash-nav-divider" />
      <div className="kb-dash-nav-section-label">ШАБЛОНЫ</div>
      {categories.map((category) => {
        const folderTemplates = templates.filter((template) => template.folderId === category.id);
        const open = openFolders.has(category.id);
        return <div className="kb-template-tree-folder" key={category.id}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
          onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-kubiki-template"); if (id) { onMoveTemplate(id, category.id); setOpenFolders((old) => new Set(old).add(category.id)); } }}>
          <div className={`kb-dash-nav-folder-row${activeNav === `category:${category.id}` ? " kb-dash-nav-item-active" : ""}`}>
            <button type="button" className="kb-tree-toggle" onClick={() => toggleFolder(category.id)} title={open ? "Свернуть" : "Раскрыть"}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
            {editingId === category.id ? <input className="kb-dash-nav-input" value={editingName} autoFocus onChange={(event) => setEditingName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") renameFolder(category.id); if (event.key === "Escape") setEditingId(null); }} /> :
              <button type="button" className="kb-dash-nav-item kb-tree-folder-btn" onClick={() => { onNavChange(`category:${category.id}`); setOpenFolders((old) => new Set(old).add(category.id)); }}>
                <Folder size={15} /><span>{category.name}</span>
              </button>}
            {!category.system && <div className="kb-dash-nav-folder-actions">
              {editingId === category.id ? <><button className="kb-icon-btn-small" onClick={() => renameFolder(category.id)}><Check size={13} /></button><button className="kb-icon-btn-small" onClick={() => setEditingId(null)}><X size={13} /></button></> : <>
                <button className="kb-icon-btn-small" onClick={() => { setEditingId(category.id); setEditingName(category.name); }} title="Переименовать"><Pencil size={12} /></button>
                <button className="kb-icon-btn-small" onClick={() => onDeleteCategory(category.id)} title="Удалить"><Trash2 size={12} /></button>
              </>}
            </div>}
          </div>
          {open && <div className="kb-template-tree-files">{folderTemplates.map((template) => {
            const isEditingTemplate = editingTemplateId === template.id;
            return <div key={template.id} className="kb-template-tree-file" draggable={!isEditingTemplate}
              onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("application/x-kubiki-template", template.id); event.dataTransfer.effectAllowed = "move"; }}
              onClick={() => onNavChange(`category:${category.id}`)} title={template.templateName || template.name}>
              <FileText size={13} />
              {isEditingTemplate ? <input className="kb-template-tree-input" value={editingTemplateName} autoFocus
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => setEditingTemplateName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") renameTemplate(template.id);
                  if (event.key === "Escape") setEditingTemplateId(null);
                }} /> : <span>{template.templateName || template.name || "Без названия"}</span>}
              <div className="kb-template-tree-actions" onClick={(event) => event.stopPropagation()}>
                {isEditingTemplate ? <>
                  <button type="button" className="kb-icon-btn-small" onClick={() => renameTemplate(template.id)} title="Сохранить"><Check size={12} /></button>
                  <button type="button" className="kb-icon-btn-small" onClick={() => setEditingTemplateId(null)} title="Отмена"><X size={12} /></button>
                </> : <>
                  <button type="button" className="kb-icon-btn-small" onClick={() => {
                    setEditingTemplateId(template.id);
                    setEditingTemplateName(template.templateName || template.name || "");
                  }} title="Переименовать шаблон"><Pencil size={11} /></button>
                  <button type="button" className="kb-icon-btn-small" onClick={() => onDeleteTemplate(template.id)} title="Удалить шаблон"><Trash2 size={11} /></button>
                </>}
              </div>
            </div>;
          })}</div>}
        </div>;
      })}
      <div className="kb-dash-nav-new-row">
        {addingFolder ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input
              className="kb-dash-nav-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addFolder();
                if (e.key === "Escape") { setAddingFolder(false); setNewFolderName(""); }
              }}
              placeholder="Название категории"
              autoFocus
              style={{ flex: 1 }}
            />
            <button type="button" className="kb-icon-btn-small" onClick={addFolder} title="Сохранить"
              style={{ color: "var(--accent)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
            <button type="button" className="kb-icon-btn-small" onClick={() => { setAddingFolder(false); setNewFolderName(""); }} title="Отмена">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <button type="button" className="kb-dash-nav-new-btn" onClick={() => setAddingFolder(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Новая категория
          </button>
        )}
      </div>
    </aside>
  );
}
