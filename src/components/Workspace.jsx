import { useState, useRef, useEffect, useCallback } from "react";
import { Percent, Save, ChevronsUp, ChevronsDown } from "lucide-react";
import { fmt, numVal, uid } from "../utils.js";
import {
  taskSum, projectSum,
  taskMarkup, getMarkupMode, externalTaskPrice, externalStagePrice,
  projectMarkupAmount, projectEffectiveMarkupPct,
  projectTaxPct, projectTaxAmount, projectTaxSystemLabel, projectVatPct, projectVatAmount, projectTotalWithTax,
  chargeIsVisible, externalTaskPriceWithCharges, externalStagePriceWithCharges,
} from "../calculations.js";
import { CUSTOM_STAGE } from "../constants.js";
import {
  makeExecutor, makeTask, makeStage,
  mapStage, withTask, withExecutorList, patchExecutorIn,
  findExecutor, cloneExecutor, insertStage, applyTagToExecutor,
} from "../store.js";
import { ImportModal, GenerateEstimateModal, UnifiedImportEmptyState, LogoMenu } from "../importExcel.jsx";
import { useOutsideClose } from "../hooks.js";
import { PalettePanel } from "./LeftPanel.jsx";
import { StageCard, CanvasDropZone } from "./Stage.jsx";
import { RightPanel } from "./RightPanel.jsx";
import {
  TEMPLATE_KEYS, loadTemplates, saveTemplates, removeTemplate,
  savePerformerTemplate, saveTaskTemplate, saveStageTemplate,
  cloneExecutorTemplate, cloneTaskTemplate, cloneStageTemplate, cloneProjectTemplate,
} from "../templates.js";

/* ============================================================
   Рабочая зона
   ============================================================ */
export function Workspace({ project, onChange, onBack, editingTemplate = false }) {
  const [view, setView] = useState("internal"); // 'internal' | 'external'
  // Брендинг клиентского PDF. В превью — React-стейт (localStorage в артефакте не работает);
  // в Клайне можно persist'ить в localStorage.
  const [importFile, setImportFile] = useState(null);
  const [generateDescription, setGenerateDescription] = useState(null);
  const [activeExecutorId, setActiveExecutorId] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [collapseButtonCompact, setCollapseButtonCompact] = useState(false);
  const clipboardRef = useRef(null); // скопированный исполнитель (Ctrl+C/Ctrl+V)
  const dispatch = (fn) => onChange(fn);
  const total = projectSum(project);
  const globalMarkup = project.globalMarkup ?? 0;
  const totalPrice = projectTotalWithTax(project);

  // теги выделенного исполнителя — для контекстной подсказки под «Кубиками исполнителя»
  const activeExecutorTags = (() => {
    if (!activeExecutorId) return null;
    for (const s of project.stages) {
      for (const t of s.tasks) {
        const direct = t.executors.find((e) => e.id === activeExecutorId);
        if (direct) return direct.tags;
      }
    }
    return null;
  })();

  const clearSelection = () => {
    setActiveExecutorId(null); setActiveTaskId(null); setActiveStageId(null);
  };

  // выбор с верхних уровней автоматически задаёт контекст ниже,
  // чтобы «клик по этапу → клик Задача» и «клик по задаче → клик Исполнитель» работали интуитивно
  const activateStage = (stageId) => { setActiveStageId(stageId); setActiveTaskId(null); setActiveExecutorId(null); };
  const activateTask = (stageId, taskId) => { setActiveStageId(stageId); setActiveTaskId(taskId); setActiveExecutorId(null); };
  const activateExecutor = (stageId, taskId, executorId) => { setActiveStageId(stageId); setActiveTaskId(taskId); setActiveExecutorId(executorId); };

  // Ctrl/Cmd+C копирует выделенного исполнителя, Ctrl/Cmd+V вставляет копию
  // в выделенную задачу (или в задачу выделенного исполнителя). Внутри полей ввода
  // не перехватываем — там работает обычное копирование текста.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const code = e.code; // физическая клавиша, не зависит от раскладки (RU/EN)
      const inField = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");

      if (code === "KeyC") {
        if (inField) return; // не мешаем копировать текст в поле
        if (!activeExecutorId) return;
        const found = findExecutor(project, activeExecutorId);
        if (found) { clipboardRef.current = found.executor; e.preventDefault(); }
      } else if (code === "KeyV") {
        if (inField) return;
        if (!clipboardRef.current) return;
        // цель: задача выделенного исполнителя → иначе выделенная задача
        let toStageId = activeStageId, toTaskId = activeTaskId;
        if (activeExecutorId) {
          const f = findExecutor(project, activeExecutorId);
          if (f) { toStageId = f.stageId; toTaskId = f.taskId; }
        }
        if (!toTaskId) return; // некуда вставлять — задача не выделена
        const clone = cloneExecutor(clipboardRef.current);
        dispatch((p) => withTask(p, toStageId, toTaskId, (t) => ({ ...t, executors: [...t.executors, clone] })));
        activateExecutor(toStageId, toTaskId, clone.id);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project, activeExecutorId, activeTaskId, activeStageId]);

  const removeStage = (stageId) => {
    dispatch((p) => ({ ...p, stages: p.stages.filter((s) => s.id !== stageId) }));
    if (activeStageId === stageId) clearSelection();
  };

  /* ---- добавление кликом из палитры ---- */
  const addStageByClick = (preset) => {
    const stage = makeStage(preset);
    dispatch((p) => ({ ...p, stages: [...p.stages, stage] }));
    activateStage(stage.id);
  };

  const addTaskByClick = () => {
    // цель — выделенный этап; если не выделен, но этап один — берём его; иначе последний
    const stages = project.stages;
    if (stages.length === 0) return;
    const targetStageId = activeStageId && stages.some((s) => s.id === activeStageId)
      ? activeStageId
      : stages[stages.length - 1].id;
    const task = makeTask();
    dispatch((p) => mapStage(p, targetStageId, (s) => ({ ...s, tasks: [...s.tasks, task] })));
    activateTask(targetStageId, task.id);
  };

  const addExecutorByClick = () => {
    // цель — выделенная задача; иначе последняя задача выделенного/последнего этапа
    let targetStageId = activeStageId;
    let targetTaskId = activeTaskId;
    if (!targetTaskId) {
      const stage = (activeStageId && project.stages.find((s) => s.id === activeStageId))
        || project.stages[project.stages.length - 1];
      if (!stage || stage.tasks.length === 0) return;
      targetStageId = stage.id;
      targetTaskId = stage.tasks[stage.tasks.length - 1].id;
    }
    const executor = makeExecutor();
    dispatch((p) => withTask(p, targetStageId, targetTaskId, (t) => ({ ...t, executors: [...t.executors, executor] })));
    activateExecutor(targetStageId, targetTaskId, executor.id);
  };

  // добавить тег активному исполнителю (клик из палитры)
  const addTagToActive = (payload) => {
    if (!activeExecutorId) return;
    dispatch((p) => ({
      ...p,
      stages: p.stages.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) => ({
          ...t,
          executors: t.executors.map((e) =>
            e.id === activeExecutorId ? { ...e, tags: applyTagToExecutor(e.tags, payload) } : e),
        })),
      })),
    }));
  };

  // override маркапа конкретной задачи (null = глобальный)
  const setTaskMarkupOverride = (stageId, taskId, value) =>
    dispatch((p) => withTask(p, stageId, taskId, (t) => ({ ...t, markupOverride: value })));

  /* ---- п.7.2: файл проекта (.json) — замена серверного сохранения ----
     «Скачать» отдаёт текущий проект файлом, «Загрузить» подставляет
     содержимое файла на место текущего проекта (id сохраняется, чтобы
     карточка на дашборде не задвоилась). */
  const saveProjectFile = () => {
    const safeName = (project.name || "project").trim()
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]+/g, "_").slice(0, 60) || "project";
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `smeta_${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const loadProjectFile = async (file) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.stages)) throw new Error("bad shape");
      dispatch(() => ({ ...parsed, id: project.id }));
      clearSelection();
    } catch (_) {
      window.alert("Не удалось загрузить файл проекта. Убедитесь, что это .json, сохранённый из Kubiki кнопкой «Сохранить проект».");
    }
  };

  const isEmpty = project.stages.length === 0;
  // п.4: смена вида снимает любое выделение (и в панели «Свойства»).
  const changeView = (v) => { clearSelection(); setView(v); };
  /* ---- шаблоны (localStorage) ---- */
  const [performerTemplates, setPerformerTemplates] = useState(() => loadTemplates(TEMPLATE_KEYS.performers));
  const [taskTemplates, setTaskTemplates] = useState(() => loadTemplates(TEMPLATE_KEYS.tasks));
  const [stageTemplates, setStageTemplates] = useState(() => loadTemplates(TEMPLATE_KEYS.stages));

  const refreshPerformerTemplates = () => setPerformerTemplates(loadTemplates(TEMPLATE_KEYS.performers));
  const refreshTaskTemplates = () => setTaskTemplates(loadTemplates(TEMPLATE_KEYS.tasks));
  const refreshStageTemplates = () => setStageTemplates(loadTemplates(TEMPLATE_KEYS.stages));

  // Уровень 1: сохранить исполнителя как шаблон
  const handleSavePerformerTemplate = useCallback((executor) => {
    savePerformerTemplate(executor);
    refreshPerformerTemplates();
  }, []);

  // Уровень 2: сохранить задачу как шаблон
  const handleSaveTaskTemplate = useCallback((task) => {
    saveTaskTemplate(task);
    refreshTaskTemplates();
  }, []);

  // Уровень 3: сохранить этап как шаблон
  const handleSaveStageTemplate = useCallback((stage) => {
    saveStageTemplate(stage);
    refreshStageTemplates();
  }, []);

  // удаление шаблонов
  const handleRemovePerformerTemplate = (id) => { removeTemplate(TEMPLATE_KEYS.performers, id); refreshPerformerTemplates(); };
  const handleRemoveTaskTemplate = (id) => { removeTemplate(TEMPLATE_KEYS.tasks, id); refreshTaskTemplates(); };
  const handleRemoveStageTemplate = (id) => { removeTemplate(TEMPLATE_KEYS.stages, id); refreshStageTemplates(); };

  // применение шаблонов
  const handleApplyPerformerTemplate = useCallback((template, overrideStageId, overrideTaskId) => {
    let targetStageId = overrideStageId || activeStageId;
    let targetTaskId = overrideTaskId || activeTaskId;
    if (!targetTaskId) {
      const stage = (activeStageId && project.stages.find((s) => s.id === activeStageId))
        || project.stages[project.stages.length - 1];
      if (!stage || stage.tasks.length === 0) return;
      targetStageId = stage.id;
      targetTaskId = stage.tasks[stage.tasks.length - 1].id;
    }
    const clone = cloneExecutorTemplate(template);
    dispatch((p) => withTask(p, targetStageId, targetTaskId, (t) => ({ ...t, executors: [...t.executors, clone] })));
    activateExecutor(targetStageId, targetTaskId, clone.id);
  }, [activeStageId, activeTaskId, project]);

  const handleApplyTaskTemplate = useCallback((template, overrideStageId) => {
    let targetStageId = overrideStageId || activeStageId;
    if (!targetStageId || !project.stages.some((s) => s.id === targetStageId)) {
      targetStageId = project.stages[project.stages.length - 1]?.id;
    }
    if (!targetStageId) return;
    const clone = cloneTaskTemplate(template);
    dispatch((p) => mapStage(p, targetStageId, (s) => ({ ...s, tasks: [...s.tasks, clone] })));
    activateTask(targetStageId, clone.id);
  }, [activeStageId, project]);

  const handleApplyStageTemplate = useCallback((template) => {
    const clone = cloneStageTemplate(template);
    dispatch((p) => ({ ...p, stages: [...p.stages, clone] }));
    activateStage(clone.id);
  }, []);

  const allCollapsed = project.stages.length > 0 && project.stages.every((stage) =>
    stage.collapsed && stage.tasks.every((task) => task.collapsed)
  );

  const toggleAllCollapsed = () => dispatch((current) => ({
    ...current,
    stages: current.stages.map((stage) => ({
      ...stage,
      collapsed: !allCollapsed,
      tasks: stage.tasks.map((task) => ({ ...task, collapsed: !allCollapsed })),
    })),
  }));

  const rightPanel = (
    <RightPanel project={project} view={view} setView={changeView} dispatch={dispatch}
      activeStageId={activeStageId} activeTaskId={activeTaskId} activeExecutorId={activeExecutorId} />
  );

  return (
    <div className="kb-root kb-root-workspace">
      {importFile && (
        <ImportModal file={importFile.file} instruction={importFile.instruction} onClose={() => setImportFile(null)}
          onConfirm={(stages, meta) => { insertParsedStages(stages, meta); setImportFile(null); }} />
      )}
      {generateDescription && (
        <GenerateEstimateModal description={generateDescription} onClose={() => setGenerateDescription(null)}
          onConfirm={(stages, meta) => { insertParsedStages(stages, meta); setGenerateDescription(null); }} />
      )}
      <header className="kb-header kb-header-min">
        <div className="kb-header-inner">
          <LogoMenu onSaveProject={saveProjectFile} onLoadProject={loadProjectFile} />
          <nav className="kb-crumbs">
            <button type="button" className="kb-crumb-link" onClick={onBack}>{editingTemplate ? "Шаблоны" : "Проекты"}</button>
            <span className="kb-crumb-sep">/</span>
            <input className="kb-input kb-project-name" value={editingTemplate ? (project.templateName || project.name) : project.name}
              onChange={(e) => dispatch((p) => editingTemplate ? { ...p, templateName: e.target.value, name: e.target.value } : { ...p, name: e.target.value })} />
          </nav>

          <div className="kb-spacer" />

          <div className={"kb-total-badge" + (view === "external" ? " kb-total-badge-price" : "")}>
            <span className="kb-total-label">{view === "external" ? "ИТОГО" : "Итого себестоимость"}</span>
            <span className="kb-total-figure">{fmt(view === "external" ? totalPrice : total)} ₽</span>
          </div>
        </div>
      </header>

      {view === "internal" ? (
        <div className="kb-layout">
          <PalettePanel
            activeExecutorId={activeExecutorId}
            activeExecutorTags={activeExecutorTags}
            activeTaskId={activeTaskId}
            onAddTagToActive={addTagToActive}
            onAddStage={addStageByClick}
            onAddTask={addTaskByClick}
            onAddExecutor={addExecutorByClick}
            performerTemplates={performerTemplates}
            taskTemplates={taskTemplates}
            stageTemplates={stageTemplates}
            onApplyPerformerTemplate={handleApplyPerformerTemplate}
            onApplyTaskTemplate={handleApplyTaskTemplate}
            onApplyStageTemplate={handleApplyStageTemplate}
            onRemovePerformerTemplate={handleRemovePerformerTemplate}
            onRemoveTaskTemplate={handleRemoveTaskTemplate}
            onRemoveStageTemplate={handleRemoveStageTemplate}
          />
          {/* клик по нейтральной зоне листа снимает все выделения. */}
          <main className="kb-canvas"
            onMouseDown={clearSelection}
            onScroll={(event) => setCollapseButtonCompact(event.currentTarget.scrollTop > 12)}>
            <div className="kb-canvas-inner">
              {!isEmpty && <button type="button" className={`kb-collapse-all-btn${collapseButtonCompact ? " is-compact" : ""}`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={toggleAllCollapsed}
                title={allCollapsed ? "Развернуть все этапы и задачи" : "Свернуть все этапы и задачи"}>
                {allCollapsed ? <ChevronsDown size={13} strokeWidth={1.7} /> : <ChevronsUp size={13} strokeWidth={1.7} />}
                <span>{allCollapsed ? "Развернуть всё" : "Свернуть всё"}</span>
              </button>}
              {isEmpty ? (
                <>
                  <CanvasDropZone isEmpty
                    onDropStage={(payload) => {
                      if (payload.templateStageId) {
                        const tpl = stageTemplates.find((t) => t.id === payload.templateStageId);
                        if (tpl) handleApplyStageTemplate(tpl);
                      } else {
                        dispatch((p) => insertStage(p, payload, null));
                      }
                    }}
                    onAddStage={() => addStageByClick(CUSTOM_STAGE)} />
                  <UnifiedImportEmptyState onPickFile={(file, instruction) => setImportFile({ file, instruction })} onGenerate={setGenerateDescription} />
                </>
              ) : (
                <>
                  {project.stages.map((s) => (
                    <StageCard key={s.id} stage={s} dispatch={dispatch}
                      activeStageId={activeStageId} activeTaskId={activeTaskId}
                      activeExecutorId={activeExecutorId}
                      onActivateStage={activateStage}
                      onActivateTask={activateTask}
                      onActivateExecutor={activateExecutor}
                      onRemove={() => removeStage(s.id)}
                      onSaveStageTemplate={handleSaveStageTemplate}
                      onSaveTaskTemplate={handleSaveTaskTemplate}
                      onSavePerformerTemplate={handleSavePerformerTemplate}
                      stageTemplates={stageTemplates}
                      onApplyStageTemplate={handleApplyStageTemplate}
                      taskTemplates={taskTemplates}
                      onApplyTaskTemplate={handleApplyTaskTemplate}
                      performerTemplates={performerTemplates}
                      onApplyPerformerTemplate={handleApplyPerformerTemplate} />
                  ))}
                  <CanvasDropZone isEmpty={false}
                    onDropStage={(payload) => {
                      if (payload.templateStageId) {
                        const tpl = stageTemplates.find((t) => t.id === payload.templateStageId);
                        if (tpl) handleApplyStageTemplate(tpl);
                      } else {
                        dispatch((p) => insertStage(p, payload, null));
                      }
                    }}
                    onAddStage={() => addStageByClick(CUSTOM_STAGE)} />
                </>
              )}
            </div>
          </main>
          {rightPanel}
        </div>
      ) : (
        <div className="kb-layout">
          {/* п.4: палитра остаётся видна и во внешнем виде (задел на будущее) */}
          <PalettePanel
            activeExecutorId={activeExecutorId}
            activeExecutorTags={activeExecutorTags}
            activeTaskId={activeTaskId}
            onAddTagToActive={addTagToActive}
            onAddStage={addStageByClick}
            onAddTask={addTaskByClick}
            onAddExecutor={addExecutorByClick}
            performerTemplates={performerTemplates}
            taskTemplates={taskTemplates}
            stageTemplates={stageTemplates}
            onApplyPerformerTemplate={handleApplyPerformerTemplate}
            onApplyTaskTemplate={handleApplyTaskTemplate}
            onApplyStageTemplate={handleApplyStageTemplate}
            onRemovePerformerTemplate={handleRemovePerformerTemplate}
            onRemoveTaskTemplate={handleRemoveTaskTemplate}
            onRemoveStageTemplate={handleRemoveStageTemplate}
          />
          <ExternalView project={project} globalMarkup={globalMarkup}
            activeStageId={activeStageId} onActivateStage={activateStage} onClear={clearSelection}
            onSetTaskOverride={setTaskMarkupOverride} />
          {rightPanel}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Внешний (клиентский) вид: только Этапы → Задачи → цены.
   Исполнители/теги/себестоимость скрыты. Один источник данных.
   ============================================================ */
function ExternalTaskRow({ project, task, stageId, globalMarkup, mode, onSetOverride }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useOutsideClose(ref, () => setOpen(false));

  const base = taskSum(task);
  const overridden = task.markupOverride !== null && task.markupOverride !== undefined;
  const effectiveMarkup = taskMarkup(task, globalMarkup);
  // В режиме «Отдельная строка» (Cost-Plus) строки показывают чистую себестоимость,
  // маркап вынесен вниз одной строкой. В «Размазать» — цена с зашитым маркапом.
  const price = externalTaskPrice(task, globalMarkup, mode);
  const displayPrice = externalTaskPriceWithCharges(project, task);

  const onPercentInput = (val) => {
    onSetOverride(stageId, task.id, val === "" ? null : numVal(val));
  };
  const onSumInput = (val) => {
    if (base === 0) return; // деление на ноль — override не задаём
    if (val === "") { onSetOverride(stageId, task.id, null); return; }
    const pct = Math.round((numVal(val) / base - 1) * 100 * 100) / 100; // до 2 знаков
    onSetOverride(stageId, task.id, pct);
  };
  const resetOverride = () => { onSetOverride(stageId, task.id, null); setOpen(false); };

  return (
    <div className="kb-ext-task">
      <span className="kb-ext-task-name">{task.name || "Без названия"}</span>

      {/* п.7: правка маркапа по задачам доступна только в классическом режиме */}
      {mode !== "transparent" && overridden && <span className="kb-ext-dot" title="Ручной маркап на задаче" />}

      {mode !== "transparent" && (
        <button type="button" className="kb-ext-editbtn" title="Настроить маркап задачи"
          onClick={() => setOpen((o) => !o)}>
          <Percent size={13} strokeWidth={1.5} />
        </button>
      )}

      <span className="kb-ext-price">{fmt(displayPrice)} ₽</span>

      {mode !== "transparent" && open && (
        <div className="kb-ext-pop" ref={ref}>
          <div className="kb-ext-pop-row">
            <span className="kb-ext-pop-lbl">Маркап, %</span>
            <input className="kb-input kb-input-num kb-ext-pop-input" value={overridden ? task.markupOverride : ""}
              placeholder={String(globalMarkup)}
              onChange={(e) => onPercentInput(e.target.value)} />
          </div>
          <div className="kb-ext-pop-row">
            <span className="kb-ext-pop-lbl">Сумма, ₽</span>
            <input className="kb-input kb-input-num kb-ext-pop-input"
              value={base === 0 ? "" : Math.round(price)}
              placeholder={base === 0 ? "—" : "0"}
              disabled={base === 0}
              onChange={(e) => onSumInput(e.target.value)} />
          </div>
          <div className="kb-ext-pop-foot">
            <span className="kb-ext-pop-hint">
              {overridden ? "Ручной: " + fmt(effectiveMarkup) + "%" : "Глобальный: " + fmt(globalMarkup) + "%"}
            </span>
            <button type="button" className="kb-ext-reset" onClick={resetOverride} disabled={!overridden}>
              Сбросить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalView({ project, globalMarkup, activeStageId, onActivateStage, onClear, onSetTaskOverride }) {
  const mode = getMarkupMode(project);
  const markupAmount = projectMarkupAmount(project);
  return (
    <main className="kb-canvas" onMouseDown={onClear}>
      <div className="kb-canvas-ext">
        {project.stages.length === 0 && (
          <div className="kb-ext-empty">В проекте пока нет этапов. Переключитесь на внутренний вид, чтобы собрать смету.</div>
        )}
        {project.stages.map((s) => (
          <div key={s.id} className={"kb-ext-stage" + (activeStageId === s.id ? " kb-ext-stage-active" : "")}>
            <div className="kb-ext-stage-head kb-ext-stage-head-sel"
              onMouseDown={(e) => { e.stopPropagation(); onActivateStage(s.id); }}
              title="Показать сводку по этапу">
              <span className="kb-ext-stage-name">{s.name || "Без названия"}</span>
              <span className="kb-sum kb-sum-stage">{fmt(externalStagePriceWithCharges(project, s))} ₽</span>
            </div>
            {s.tasks.length > 0 && (
              <div className="kb-ext-stage-body">
                {s.tasks.map((t) => (
                  <ExternalTaskRow key={t.id} project={project} task={t} stageId={s.id}
                    globalMarkup={globalMarkup} mode={mode} onSetOverride={onSetTaskOverride} />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Cost-Plus: прозрачная строка комиссии внизу */}
        {mode === "transparent" && markupAmount > 0 && (
          <div className="kb-ext-stage kb-ext-commission">
            <div className="kb-ext-stage-head">
              <span className="kb-ext-stage-name">Агентская комиссия / Маркап ({fmt(projectEffectiveMarkupPct(project))}%)</span>
              <span className="kb-sum kb-sum-stage">{fmt(markupAmount)} ₽</span>
            </div>
          </div>
        )}

        {/* п.6: налог поверх — прибавляется после маркапа */}
        {projectTaxPct(project) > 0 && chargeIsVisible(project.tax) && (
          <div className="kb-ext-stage kb-ext-commission">
            <div className="kb-ext-stage-head">
              <span className="kb-ext-stage-name">Налог {projectTaxSystemLabel(project)} ({fmt(projectTaxPct(project))}%)</span>
              <span className="kb-sum kb-sum-stage">{fmt(projectTaxAmount(project))} ₽</span>
            </div>
          </div>
        )}

        {projectVatPct(project) > 0 && (
          <div className="kb-ext-stage kb-ext-commission">
            <div className="kb-ext-stage-head">
              <span className="kb-ext-stage-name">НДС ({fmt(projectVatPct(project))}%)</span>
              <span className="kb-sum kb-sum-stage">{fmt(projectVatAmount(project))} ₽</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
