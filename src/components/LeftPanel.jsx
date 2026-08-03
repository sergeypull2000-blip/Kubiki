import { useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, Pencil, Pin, Plus, Trash2, UserRound, X } from "lucide-react";
import { DND_TYPES, useDragSource } from "../store.js";
import { fmt, uid } from "../utils.js";

function TemplateItem({ template, dndType, payloadKey, fallback, onApply, onRemove }) {
  const { isDragging, dragHandlers } = useDragSource(dndType, { [payloadKey]: template.id });
  const label = template.templateName || template.name || fallback;
  return <div className={`kb-template-item${isDragging ? " kb-chip-dragging" : ""}`} {...dragHandlers} onClick={() => onApply(template)}>
    <FileText size={13} /><span className="kb-template-item-name">{label}</span>
    <button className="kb-template-item-del" onClick={(e) => { e.stopPropagation(); onRemove(template.id); }}><X size={12} /></button>
  </div>;
}
function PaletteSection({ title, templates, dndType, payloadKey, fallback, onApply, onRemove }) {
  const [open, setOpen] = useState(true);
  return <div className="kb-palette-section"><button className="kb-palette-title" onClick={() => setOpen(!open)}><span>{title}</span><ChevronDown size={13} className={open ? "kb-chevron kb-chevron-open" : "kb-chevron"} /></button>
    {open && <div className="kb-palette-items">{templates.length ? templates.map((item) => <TemplateItem key={item.id} template={item} dndType={dndType} payloadKey={payloadKey} fallback={fallback} onApply={onApply} onRemove={onRemove} />) : <div className="kb-template-empty">Здесь пока нет шаблонов</div>}</div>}
  </div>;
}

function QuickItem({ item, performer, onApply, onPin, onRemove }) {
  const { isDragging, dragHandlers } = useDragSource(DND_TYPES.PERFORMER, { quickAccessItemId: item.id });
  const name = [performer.firstName, performer.lastName].filter(Boolean).join(" ").trim();
  const label = name || performer.primaryRole || "Исполнитель";
  return <div className={`kb-template-item kb-performer-item${isDragging ? " kb-chip-dragging" : ""}`} {...dragHandlers} onClick={() => onApply(item)} title="Перетащите или нажмите, чтобы добавить в задачу">
    <UserRound size={13} strokeWidth={1.5} /><span className="kb-template-item-name">{label}</span>
    {performer.defaultRate != null && <span className="kb-template-item-sum">{fmt(performer.defaultRate)} ₽</span>}
    <button className={`kb-performer-item-action${item.pinned ? " is-active" : ""}`} title={item.pinned ? "Открепить" : "Закрепить"} onClick={(e) => { e.stopPropagation(); onPin(item); }}><Pin size={11} fill={item.pinned ? "currentColor" : "none"} /></button>
    <button className="kb-performer-item-action" title="Удалить из быстрого доступа" onClick={(e) => { e.stopPropagation(); onRemove(item); }}><Trash2 size={11} /></button>
  </div>;
}

export function PalettePanel({ taskTemplates = [], stageTemplates = [], quickAccessItems = [], onCreatePerformer, onApplyQuickAccess, onToggleQuickAccessPin, onRemoveQuickAccess, onApplyTaskTemplate, onApplyStageTemplate, onRemoveTaskTemplate, onRemoveStageTemplate }) {
  return <aside className="kb-palette">
    <PaletteSection title="Этапы" templates={stageTemplates} dndType={DND_TYPES.STAGE} payloadKey="templateStageId" fallback="Этап" onApply={onApplyStageTemplate} onRemove={onRemoveStageTemplate} />
    <PaletteSection title="Задачи" templates={taskTemplates} dndType={DND_TYPES.TASK} payloadKey="templateTaskId" fallback="Задача" onApply={onApplyTaskTemplate} onRemove={onRemoveTaskTemplate} />
    <div className="kb-palette-section kb-performer-quick"><div className="kb-palette-title"><span>Исполнители</span><button className="kb-icon-btn-small" onClick={onCreatePerformer} title="Создать карточку исполнителя"><Plus size={13} /></button></div>
      <div className="kb-palette-items">{quickAccessItems.map(({ item, performer }) => <QuickItem key={item.id} item={item} performer={performer} onApply={onApplyQuickAccess} onPin={onToggleQuickAccessPin} onRemove={onRemoveQuickAccess} />)}{!quickAccessItems.length && <div className="kb-template-empty">Здесь пока нет исполнителей</div>}</div>
    </div>
    <div className="kb-palette-foot">Палитра этапов, задач и исполнителей</div>
  </aside>;
}

const FOLDERS_KEY = "kubiki_template_folders";
const DEFAULT_CATEGORIES = [
  { id: "new", name: "Новые", system: true },
  { id: "cg", name: "CG" },
  { id: "marketing", name: "Маркетинг" },
  { id: "production", name: "Съёмки" },
  { id: "web", name: "Разработка" },
];

export function loadDashboardCategories() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw == null) return DEFAULT_CATEGORIES;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return DEFAULT_CATEGORIES;
    const userCategories = saved.filter((folder) => folder.id !== "new" && folder.id !== "uncategorized");
    const savedIds = new Set(userCategories.map((folder) => folder.id));
    const missingDefaults = DEFAULT_CATEGORIES.slice(1).filter((folder) => !savedIds.has(folder.id));
    return [DEFAULT_CATEGORIES[0], ...userCategories, ...missingDefaults];
  } catch { return DEFAULT_CATEGORIES; }
}

function saveCategories(categories) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(categories.filter((category) => !category.system))); } catch { /* unavailable */ }
}

export default function LeftPanel({ activeNav, onNavChange, categories = [], onCategoriesChange, templates = [], onMoveTemplate, onDeleteCategory, onRenameTemplate, onDeleteTemplate }) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [openFolders, setOpenFolders] = useState(() => new Set(["new"]));
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");

  const updateCategories = (next) => { onCategoriesChange(next); saveCategories(next); };
  const addFolder = () => {
    if (!newFolderName.trim()) return;
    updateCategories([...categories, { id: uid(), name: newFolderName.trim(), order: Date.now() }]);
    setNewFolderName(""); setAddingFolder(false);
  };
  const toggleFolder = (id) => setOpenFolders((previous) => {
    const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const renameFolder = (id) => {
    if (!editingName.trim()) return;
    updateCategories(categories.map((category) => category.id === id ? { ...category, name: editingName.trim() } : category));
    setEditingId(null);
  };

  return <aside className="kb-dash-sidebar">
    <div className="kb-dash-nav-section-label">Проекты</div>
    {[{ id: "all", name: "Все проекты" }, { id: "recent", name: "Последние" }, { id: "favorites", name: "Избранное" }].map((item) => <button type="button" key={item.id} className={`kb-dash-nav-item${activeNav === item.id ? " kb-dash-nav-item-active" : ""}`} onClick={() => onNavChange(item.id)}><span>{item.name}</span></button>)}
    <div className="kb-dash-nav-divider" />
    <div className="kb-dash-nav-section-label">Шаблоны</div>
    {categories.map((category) => {
      const open = openFolders.has(category.id);
      const folderTemplates = templates.filter((template) => template.folderId === category.id);
      return <div className="kb-template-tree-folder" key={category.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-kubiki-template"); if (id) { onMoveTemplate(id, category.id); setOpenFolders((old) => new Set(old).add(category.id)); } }}>
        <div className={`kb-dash-nav-folder-row${activeNav === `category:${category.id}` ? " kb-dash-nav-item-active" : ""}`}>
          <button type="button" className="kb-tree-toggle" onClick={() => toggleFolder(category.id)} title={open ? "Свернуть" : "Раскрыть"} aria-expanded={open}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
          {editingId === category.id ? <input className="kb-dash-nav-input" value={editingName} autoFocus onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") renameFolder(category.id); if (event.key === "Escape") setEditingId(null); }} /> : <button type="button" className="kb-dash-nav-item kb-tree-folder-btn" onClick={() => { onNavChange(`category:${category.id}`); setOpenFolders((old) => new Set(old).add(category.id)); }}><span>{category.name}</span></button>}
          {!category.system && <div className="kb-dash-nav-folder-actions">{editingId === category.id ? <><button type="button" className="kb-icon-btn-small" onClick={() => renameFolder(category.id)}><Check size={13} /></button><button type="button" className="kb-icon-btn-small" onClick={() => setEditingId(null)}><X size={13} /></button></> : <><button type="button" className="kb-icon-btn-small" onClick={() => { setEditingId(category.id); setEditingName(category.name); }} title="Переименовать"><Pencil size={12} /></button><button type="button" className="kb-icon-btn-small" onClick={() => { const next = categories.filter((item) => item.id !== category.id); onDeleteCategory(category.id); saveCategories(next); }} title="Удалить"><Trash2 size={12} /></button></>}</div>}
        </div>
        {open && <div className="kb-template-tree-files">{folderTemplates.map((template) => <div key={template.id} className="kb-template-tree-file" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-kubiki-template", template.id); event.dataTransfer.effectAllowed = "move"; }} onClick={() => onNavChange(`category:${category.id}`)}><FileText size={13} /><span onDoubleClick={() => { const name = window.prompt("Название шаблона", template.templateName || template.name); if (name?.trim()) onRenameTemplate(template.id, name.trim()); }}>{template.templateName || template.name || "Без названия"}</span><div className="kb-template-tree-actions" onClick={(event) => event.stopPropagation()}><button type="button" className="kb-icon-btn-small" onClick={() => onDeleteTemplate(template.id)} title="Удалить шаблон"><Trash2 size={11} /></button></div></div>)}</div>}
      </div>;
    })}
    <div className="kb-dash-nav-new-row">{addingFolder ? <div style={{ display: "flex", gap: 4, alignItems: "center" }}><input className="kb-dash-nav-input" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addFolder(); if (event.key === "Escape") { setAddingFolder(false); setNewFolderName(""); } }} placeholder="Название категории" autoFocus style={{ flex: 1 }} /><button type="button" className="kb-icon-btn-small" onClick={addFolder} title="Сохранить"><Check size={13} /></button><button type="button" className="kb-icon-btn-small" onClick={() => { setAddingFolder(false); setNewFolderName(""); }} title="Отмена"><X size={13} /></button></div> : <button type="button" className="kb-dash-nav-new-btn" onClick={() => setAddingFolder(true)}><Plus size={13} />Новая категория</button>}</div>
  </aside>;
}
