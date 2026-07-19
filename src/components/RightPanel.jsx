import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { fmt, numVal } from "../utils.js";
import {
  executorSum, taskSum, stageSum, projectSum,
  getMarkupMode, externalTaskPrice, externalStagePrice,
  externalTaskPriceWithCharges, externalStagePriceWithCharges,
  projectMarkupAmount, projectTaxPct, projectTaxAmount, projectVatPct, projectVatAmount, projectTotalWithTax,
  readExecutor,
} from "../calculations.js";
import { PAY_SHORT } from "../constants.js";
import { ExportPanel } from "../exportFiles.jsx";

/* Строка исполнителя в структуре себестоимости: имя, сумма, доля.
   Раскрывается в список ЗАДАЧ этого человека (задача · кубик · сумма). */
function PersonRow({ label, total, items, cost }) {
  const [open, setOpen] = useState(false);
  const pct = (v) => (cost > 0 ? (v / cost * 100).toFixed(1) + "%" : "—");
  const cubeLabel = (t) => (t === "none" ? "Без кубика" : (PAY_SHORT[t] || t));
  return (
    <div className="kb-person">
      <div className="kb-person-head is-multi" onClick={() => setOpen((o) => !o)}>
        <div className="kb-person-l">
          <ChevronDown size={12} strokeWidth={2} className={"kb-person-chev" + (open ? " is-open" : "")} />
          <div className="kb-person-name" title={label}>{label}</div>
        </div>
        <div className="kb-person-r">
          <span className="kb-person-sum">{fmt(total)} ₽ · {pct(total)}</span>
          <span className="kb-person-cube">задач: {items.length}</span>
        </div>
      </div>
      {open && (
        <div className="kb-person-cubes">
          {items.map((it, i) => (
            <div className="kb-props-row kb-person-cube-row" key={i}>
              <span className="kb-person-task" title={`${it.task} · ${cubeLabel(it.type)}`}>
                <span className="kb-person-taskname">{it.task}</span>
                <span className="kb-person-taskcube"> · {cubeLabel(it.type)}</span>
              </span>
              <span className="kb-person-cellsum">{fmt(it.sum)} ₽</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PropertiesPanel({ project, view, activeStageId, activeTaskId, activeExecutorId }) {
  const execName = (e) => ((e.tags || []).find((t) => t.key === "name")?.value || "").trim();
  const [structOpen, setStructOpen] = useState(true);
  const gm = project.globalMarkup ?? 0;
  const mode = getMarkupMode(project);
  const external = view === "external";

  let stage = null, task = null, executor = null;
  for (const s of project.stages || []) {
    if (s.id === activeStageId) stage = s;
    for (const t of s.tasks || []) {
      if (t.id === activeTaskId) { task = t; stage = s; }
      for (const e of t.executors || []) {
        if (e.id === activeExecutorId) { executor = e; task = t; stage = s; }
      }
    }
  }

  if (executor) {
    const R = readExecutor(executor);
    const detail = R.payType === "hourly" ? `${fmt(R.rate)} ₽/час × ${R.qty} ч`
      : R.payType === "shift" ? `${fmt(R.rate)} ₽/смену × ${R.qty} смен` : "";
    return (
      <div className="kb-props">
        <div className="kb-props-kind">Исполнитель</div>
        <div className="kb-props-name">{R.name}</div>
        {(R.role || R.grade) && <div className="kb-props-meta">{[R.role, R.grade].filter(Boolean).join(" · ")}</div>}
        <div className="kb-props-figure">{fmt(R.sum)} ₽</div>
        <div className="kb-props-row"><span>{R.payLabel || "Тип оплаты не задан"}</span>{detail && <span>{detail}</span>}</div>
      </div>
    );
  }

  if (task) {
    const execs = task.executors || [];
    return (
      <div className="kb-props">
        <div className="kb-props-kind">Задача</div>
        <div className="kb-props-name">{task.name || "Без названия"}</div>
        <div className="kb-props-meta">Исполнителей: {execs.length}</div>
        <div className="kb-props-figure">{fmt(external ? externalTaskPriceWithCharges(project, task) : taskSum(task))} ₽</div>
        {!external && <>
          <div className="kb-props-sub">Исполнители</div>
          {execs.length === 0 && <div className="kb-props-empty-sm">Нет исполнителей</div>}
          {execs.map((e) => {
            const R = readExecutor(e);
            return (
              <div className="kb-props-row" key={e.id}>
                <span className="kb-person-task" title={`${R.name} · ${R.payLabel}`}>
                  <span className="kb-person-taskname">{R.name}</span>
                  <span className="kb-person-taskcube"> · {R.payLabel}</span>
                </span>
                <span className="kb-person-cellsum">{fmt(R.sum)} ₽</span>
              </div>
            );
          })}
        </>}
      </div>
    );
  }

  if (stage) {
    const tasks = stage.tasks || [];
    return (
      <div className="kb-props">
        <div className="kb-props-kind">Этап</div>
        <div className="kb-props-name">{stage.name || "Без названия"}</div>
        <div className="kb-props-meta">Задач: {tasks.length}</div>
        <div className="kb-props-figure">{fmt(external ? externalStagePriceWithCharges(project, stage) : stageSum(stage))} ₽</div>
        {tasks.length === 0 && <div className="kb-props-empty-sm">Нет задач</div>}
        {tasks.map((t) => {
          const names = (t.executors || []).map(execName).filter(Boolean);
          return (
            <div className="kb-props-taskblock" key={t.id}>
              <div className="kb-props-row kb-props-taskrow">
                <span className="kb-person-task" title={t.name || "Без названия"}><span className="kb-person-taskname">{t.name || "Без названия"}</span></span>
                <span className="kb-person-cellsum">{fmt(external ? externalTaskPriceWithCharges(project, t) : taskSum(t))} ₽</span>
              </div>
              {names.length > 0 && <div className="kb-props-names" title={names.join(", ")}>{names.join(", ")}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // ничего не выделено
  const stages = project.stages || [];
  if (stages.length === 0) {
    return <div className="kb-props-empty">Выберите этап, задачу или исполнителя в рабочей зоне.</div>;
  }

  // сводка по проекту.
  // п.4: исполнители дедуплицируются по ИМЕНИ (одинаковое имя = один человек),
  // безымянные строки считаются каждая отдельно.
  // п.5: структура себестоимости — по людям (сумма, кубик(и), доля).
  let taskCount = 0;
  const people = new Map();
  for (const s of stages) for (const t of s.tasks || []) {
    taskCount += 1;
    for (const e of t.executors || []) {
      const name = execName(e);
      const key = name ? "n:" + name.toLowerCase() : "id:" + e.id;
      const type = (e.tags || []).find((tg) => tg.key === "payment")?.payment?.type || "none";
      const sum = executorSum(e);
      const entry = people.get(key) || { label: name || "Без имени", total: 0, items: [] };
      entry.total += sum;
      entry.items.push({ task: t.name || "Без названия", type, sum });
      people.set(key, entry);
    }
  }
  const cost = projectSum(project);
  const persons = [...people.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="kb-props">
      <div className="kb-props-kind">Проект</div>
      <div className="kb-props-name">{project.name || "Без названия"}</div>
      <div className="kb-props-figure">{fmt(external ? projectTotalWithTax(project) : cost)} ₽</div>
      <div className="kb-props-counts">
        <div className="kb-props-count"><b>{stages.length}</b><span>этапов</span></div>
        <div className="kb-props-count"><b>{taskCount}</b><span>задач</span></div>
        <div className="kb-props-count"><b>{people.size}</b><span>исполн.</span></div>
      </div>
      {external && <>
        <div className="kb-props-sub">Структура внешней сметы</div>
        <div className="kb-props-row"><span>Себестоимость</span><span>{fmt(cost)} ₽</span></div>
        <div className="kb-props-row"><span>Маркап</span><span>{fmt(projectMarkupAmount(project))} ₽</span></div>
        {projectTaxPct(project) > 0 && <div className="kb-props-row"><span>Налог ({fmt(projectTaxPct(project))}%)</span><span>{fmt(projectTaxAmount(project))} ₽</span></div>}
        {projectVatPct(project) > 0 && <div className="kb-props-row"><span>НДС ({fmt(projectVatPct(project))}%)</span><span>{fmt(projectVatAmount(project))} ₽</span></div>}
      </>}
      {!external && <>
        <button type="button" className="kb-props-sub kb-props-sub-toggle" onClick={() => setStructOpen((o) => !o)}>
          <span>Структура внутренней сметы</span>
          <ChevronDown size={12} strokeWidth={2} className={"kb-person-chev" + (structOpen ? " is-open" : "")} />
        </button>
        {structOpen && <>
          {persons.length === 0 && <div className="kb-props-empty-sm">Ещё нет исполнителей</div>}
          {persons.map((p, i) => <PersonRow key={i} label={p.label} total={p.total} items={p.items} cost={cost} />)}
        </>}
      </>}
    </div>
  );
}

function VisibilityToggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={"kb-mini-switch" + (checked ? " is-on" : "")}
      title={checked ? "Отображать отдельной строкой" : "Распределять по позициям"}
      onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

/* Правая панель: Вид · Маркап · Свойства · Экспорт. */
export function RightPanel({ project, view, setView, dispatch, activeStageId, activeTaskId, activeExecutorId }) {
  const globalMarkup = project.globalMarkup ?? 0;
  return (
    <aside className="kb-rightpanel">
      <section className="kb-rp-sec">
        <div className="kb-rp-title">Вид сметы</div>
        <div className="kb-viewtoggle kb-viewtoggle-full" role="tablist" aria-label="Вид сметы">
          <button type="button" className={"kb-viewtoggle-btn" + (view === "internal" ? " kb-viewtoggle-btn-active" : "")}
            onClick={() => setView("internal")}>Внутренняя</button>
          <button type="button" className={"kb-viewtoggle-btn" + (view === "external" ? " kb-viewtoggle-btn-active" : "")}
            onClick={() => setView("external")}>Внешняя</button>
        </div>
      </section>

      {view === "external" && (
        <section className="kb-rp-sec">
          <div className="kb-tax-row kb-rp-markup">
            <span className="kb-markup-label">Маркап, %</span>
            <span className="kb-tax-spacer" aria-hidden="true" />
            <input className="kb-input kb-input-num kb-markup-input kb-tax-input" value={globalMarkup}
              onChange={(e) => dispatch((p) => ({ ...p, globalMarkup: e.target.value === "" ? 0 : numVal(e.target.value) }))} />
            <VisibilityToggle checked={getMarkupMode(project) === "transparent"} label="Отображать маркап отдельной строкой"
              onChange={(visible) => dispatch((p) => ({ ...p, markupMode: visible ? "transparent" : "embedded" }))} />
          </div>
          <div className="kb-tax-row">
            <span className="kb-markup-label">Налог</span>
            <select className="kb-tax-type" value={["osno", "usn", "ausn"].includes(project.tax?.type) ? project.tax.type : "osno"}
              onChange={(e) => dispatch((p) => ({ ...p, tax: { ...(p.tax || {}), type: e.target.value } }))}>
              <option value="osno">ОСНО</option>
              <option value="usn">УСН</option>
              <option value="ausn">АУСН</option>
            </select>
            <input className="kb-input kb-input-num kb-tax-input" value={project.tax?.percent ?? ""} placeholder="%"
              onChange={(e) => dispatch((p) => ({ ...p, tax: { ...(p.tax || {}), percent: e.target.value } }))} />
            <VisibilityToggle checked={project.tax?.visible !== false} label="Отображать налог отдельной строкой"
              onChange={(visible) => dispatch((p) => ({ ...p, tax: { ...(p.tax || {}), visible } }))} />
          </div>
          <div className="kb-tax-row">
            <span className="kb-markup-label">НДС</span>
            <span className="kb-tax-spacer" aria-hidden="true" />
            <input className="kb-input kb-input-num kb-tax-input" value={project.vat?.percent ?? ""} placeholder="%"
              onChange={(e) => dispatch((p) => ({ ...p, vat: { ...(p.vat || {}), percent: e.target.value } }))} />
            <span className="kb-switch-spacer" aria-hidden="true" />
          </div>
        </section>
      )}

      <section className="kb-rp-sec kb-rp-grow">
        <div className="kb-rp-title">Свойства</div>
        <PropertiesPanel project={project} view={view} activeStageId={activeStageId} activeTaskId={activeTaskId} activeExecutorId={activeExecutorId} />
      </section>

      <section className="kb-rp-sec">
        <div className="kb-rp-title">Экспорт</div>
        <ExportPanel project={project} view={view} dispatch={dispatch} />
      </section>
    </aside>
  );
}
