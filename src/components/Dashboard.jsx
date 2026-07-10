import { Plus, X, Box } from "lucide-react";
import { fmt } from "../utils.js";
import { projectSum } from "../calculations.js";
import { Logo } from "../Logo.jsx";

/* ============================================================
   Дашборд проектов
   ============================================================ */
export function Dashboard({ projects, onOpen, onCreate, onDelete }) {
  return (
    <div className="kb-root">
      <header className="kb-header kb-header-dash">
        <Logo size={21} />
        <div className="kb-brand">
          <span className="kb-brand-name">Kubiki</span>
          <span className="kb-brand-sub">умная смета для CG-производства</span>
        </div>
      </header>

      <div className="kb-dashboard">
        <div className="kb-board">
          {projects.map((p) => (
            <div key={p.id} className="kb-card" onClick={() => onOpen(p.id)}>
              <button type="button" className="kb-card-del"
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }} title="Удалить проект">
                <X size={12} strokeWidth={1.5} />
              </button>
              <div className="kb-card-icon"><Box size={19} strokeWidth={1.25} /></div>
              <div className="kb-card-name">{p.name || "Без названия"}</div>
              <div className="kb-card-sum">{fmt(projectSum(p))} ₽</div>
              <div className="kb-card-meta">
                {p.stages.reduce((a, s) => a + s.tasks.length, 0)} задач
              </div>
            </div>
          ))}
          <button type="button" className="kb-card kb-card-new" onClick={onCreate}>
            <Plus size={20} strokeWidth={1.25} />
            <span>Новый проект</span>
          </button>
        </div>
      </div>
    </div>
  );
}
