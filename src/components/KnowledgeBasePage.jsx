import { useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { PAYMENT_LABEL } from "../constants.js";
import { performerDisplayName, searchPerformers } from "../performerLibrary.js";
import { AppTopNavigation } from "./AppTopNavigation.jsx";
import { PerformerModal } from "./PerformerLibrary.jsx";

const contact = (performer) => performer.phone || performer.email || performer.telegram || "";

export function PerformerLibraryItem({ performer, inQuickAccess, onEdit, onToggleQuickAccess, onDelete }) {
  const name = performerDisplayName(performer);
  const title = name || performer.primaryRole || "Исполнитель";
  const payment = PAYMENT_LABEL[performer.defaultPaymentType] || "";
  const rate = performer.defaultRate == null ? "" : Number(performer.defaultRate).toLocaleString("ru-RU");
  return <article className="kb-performer-card" onClick={() => onEdit(performer)}>
    <div className="kb-performer-card-main"><strong>{title}</strong>{name && performer.primaryRole && <span>{performer.primaryRole}</span>}
      <small>{[payment, rate && `${rate} ${performer.defaultUnit || "₽"}`, performer.legalStatus].filter(Boolean).join(" · ")}</small></div>
    {contact(performer) && <div className="kb-performer-contact">{performer.email ? <Mail size={14} /> : <Phone size={14} />}<span>{contact(performer)}</span></div>}
    <span className={`kb-quick-status${inQuickAccess ? " is-active" : ""}`}>{inQuickAccess ? "В быстром доступе" : "Только в базе"}</span>
    <div className="kb-performer-actions">
      <button type="button" title="Редактировать" onClick={(event) => { event.stopPropagation(); onEdit(performer); }}><Pencil size={16} /></button>
      <button type="button" title={inQuickAccess ? "Убрать из быстрого доступа" : "Добавить в быстрый доступ"}
        onClick={(event) => { event.stopPropagation(); onToggleQuickAccess(performer.id); }}>{inQuickAccess ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button>
      <button type="button" className="is-danger" title="Удалить из базы" onClick={(event) => { event.stopPropagation(); onDelete(performer.id); }}><Trash2 size={16} /></button>
    </div>
  </article>;
}

export function KnowledgeBasePage({ performers, performerState = "ready", performerMessage = "", onRetryPerformers, quickAccess, onSectionChange, onOpenAiSettings, onSavePerformer, onToggleQuickAccess, onDeletePerformer, onSignOut }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const visible = useMemo(() => searchPerformers(performers, query), [performers, query]);
  const quickIds = useMemo(() => new Set((quickAccess?.items || []).map((item) => item.performerId)), [quickAccess]);
  const create = () => setEditing({ performer: null, addToQuickAccess: true });
  const edit = (performer) => setEditing({ performer, addToQuickAccess: quickIds.has(performer.id) });
  const remove = async (id) => {
    if (window.confirm("Удалить карточку исполнителя из базы? Исполнители, уже добавленные в сметы, останутся в проектах.")) await onDeletePerformer(id);
  };
  return <div className="kb-root">
    <AppTopNavigation activeSection="knowledgeBase" onSectionChange={onSectionChange} onOpenAiSettings={onOpenAiSettings} onSignOut={onSignOut} />
    <main className="kb-knowledge-page">
      <div className="kb-knowledge-eyebrow">База знаний</div><h1>Исполнители</h1>
      {performerState === "loading" && <div className="kb-library-empty">Загружаем базу исполнителей…</div>}
      {performerState === "error" && <div className="kb-server-error" role="alert">{performerMessage}<button type="button" className="kb-toast-retry" onClick={onRetryPerformers}>Повторить</button></div>}
      {performerState !== "loading" && (performers.length ? <>
        <div className="kb-library-tools"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по исполнителям" /></label>
          <button type="button" className="kb-btn kb-btn-primary" onClick={create}><Plus size={16} />Добавить исполнителя</button></div>
        {visible.length ? <div className="kb-performer-list">{visible.map((performer) => <PerformerLibraryItem key={performer.id} performer={performer}
          inQuickAccess={quickIds.has(performer.id)} onEdit={edit} onToggleQuickAccess={onToggleQuickAccess} onDelete={remove} />)}</div>
          : <div className="kb-library-empty">Исполнители не найдены</div>}
      </> : <div className="kb-library-empty kb-library-empty-full"><strong>В базе пока нет исполнителей</strong><span>Сохраняйте карточки из смет или создайте нового исполнителя.</span>
        <button type="button" className="kb-btn kb-btn-primary" onClick={create}><Plus size={16} />Добавить исполнителя</button></div>)}
    </main>
    {editing && <PerformerModal initial={editing.performer || {}} isNew={!editing.performer} initialAddToQuickAccess={editing.addToQuickAccess}
      onSave={async (draft, addToQuickAccess) => { const saved = await onSavePerformer(draft, addToQuickAccess, editing.performer?.id || null); if (saved) setEditing(null); }} onClose={() => setEditing(null)} />}
  </div>;
}
