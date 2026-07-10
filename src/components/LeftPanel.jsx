import { useState } from "react";
import { Plus, ChevronDown, ListTodo, User } from "lucide-react";
import { CUSTOM_STAGE } from "../constants.js";
import { DND_TYPES, useDragSource } from "../store.js";

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

function NewCubeStub() {
  const [soon, setSoon] = useState(false);
  return (
    <button type="button" className="kb-chip kb-newcube"
      onClick={() => { setSoon(true); setTimeout(() => setSoon(false), 1600); }}>
      {soon ? <span className="kb-tpl-soon">Скоро</span> : <><Plus size={13} strokeWidth={1.75} /> Новый кубик</>}
    </button>
  );
}

function PaletteSection({ title, children, defaultOpen = false, hideTemplate = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [soon, setSoon] = useState(false);
  return (
    <div className="kb-palette-section">
      <button type="button" className="kb-palette-title" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={13} strokeWidth={1.5} className={"kb-chevron" + (open ? " kb-chevron-open" : "")} />
      </button>
      {open && (
        <div className="kb-palette-items">
          {children}
          {!hideTemplate && (
            <button type="button" className="kb-tpl-add"
              onClick={() => { setSoon(true); setTimeout(() => setSoon(false), 1600); }}>
              {soon ? <span className="kb-tpl-soon">Скоро</span> : <><Plus size={12} strokeWidth={1.75} /> создать шаблон</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// TODO: проверить использование — activeExecutorId/activeExecutorTags/activeTaskId/onAddTagToActive
// сейчас не читаются внутри (их потреблял удалённый неиспользуемый TagPaletteItem),
// но продолжают приходить от Workspace — уточнить, нужны ли они для будущей секции «Кубики исполнителя».
export function PalettePanel({ activeExecutorId, activeExecutorTags, activeTaskId, onAddTagToActive, onAddStage, onAddTask, onAddExecutor }) {
  return (
    <aside className="kb-palette">
      <PaletteSection title="Этапы" defaultOpen={true}>
        <StageChip preset={CUSTOM_STAGE} onClick={() => onAddStage(CUSTOM_STAGE)} />
      </PaletteSection>

      <PaletteSection title="Задачи">
        <SimpleChip icon={ListTodo} label="Новая задача" dndType={DND_TYPES.TASK} payload={{}} onClick={onAddTask}
          hint="Перетащите в этап или кликните, чтобы добавить в выделенный этап" />
      </PaletteSection>

      <PaletteSection title="Исполнители">
        <SimpleChip icon={User} label="Новый исполнитель" dndType={DND_TYPES.EXECUTOR} payload={{}} onClick={onAddExecutor}
          hint="Перетащите в задачу или кликните, чтобы добавить в выделенную задачу" />
      </PaletteSection>

      <PaletteSection title="Кубики исполнителя" hideTemplate>
        <NewCubeStub />
      </PaletteSection>

      <div className="kb-palette-foot">Тут вы можете создавать шаблоны этапов, задач и исполнителей</div>
    </aside>
  );
}
