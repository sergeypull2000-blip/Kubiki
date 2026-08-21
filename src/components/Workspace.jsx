import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, ChevronsUp, ChevronsDown } from "lucide-react";
import { formatMoney } from "../utils.js";
import { projectTotalWithTax } from "../calculations.js";
import { activeSheetId as getActiveSheetId } from "../sheets.js";
import { CUSTOM_STAGE } from "../constants.js";
import {
  makeExecutor, makeTask, makeStage,
  mapStage, withTask, withStages,
  findExecutor, cloneExecutor, insertStage, applyTagToExecutor,
  createSheet, renameSheet, switchSheet, duplicateSheet, deleteSheet,
} from "../store.js";
import { ImportModal, GenerateEstimateModal, UnifiedImportEmptyState, LogoMenu } from "../importExcel.jsx";
import { applyConfirmedEstimate } from "../store.js";
import { PalettePanel } from "./LeftPanel.jsx";
import { StageCard, CanvasDropZone } from "./Stage.jsx";
import { RightPanel } from "./RightPanel.jsx";
import { PerformerModal } from "./PerformerLibrary.jsx";
import { AiEditTechnicalModal } from "./AiEditTechnicalModal.jsx";
import { globalAiEditScope } from "../ai/editScope.js";
import { addPerformerToTask, buildPerformerFromExecutor, linkExecutorToPerformer, normalizePerformer } from "../performerLibrary.js";
import { sortQuickAccessItems } from "../quickAccess.js";
import { createTaskTemplate, createStageTemplate, cloneTaskTemplate, cloneStageTemplate } from "../templates.js";
import { AccountControl } from "./AccountControl.jsx";
import { BetaBadge } from "./BetaBadge.jsx";

const WORKSPACE_FIXED_WIDTH = 1250;
const WORKSPACE_SIDEBAR_GAP = 24;
const LEFT_PANEL_RANGE = [210, Number.POSITIVE_INFINITY];
const RIGHT_PANEL_RANGE = [250, Number.POSITIVE_INFINITY];
const clampPanelWidth = (value, [min, max], fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
const panelViewportMax = ([min]) => Math.max(min, Math.floor((window.innerWidth - WORKSPACE_FIXED_WIDTH) / 2 - WORKSPACE_SIDEBAR_GAP));

/* ============================================================
   Вкладка сметы: single click переключает лист, double click — rename.
   ============================================================ */
function SheetTab({ sheet, isActive, canRemove, onSwitch, onRename, onDuplicate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const cancelRef = useRef(false);
  const startEdit = () => { setDraft(sheet.name || ""); setEditing(true); };
  const commit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (name && name !== sheet.name) onRename(sheet.id, name);
    setEditing(false);
  };
  const cancel = () => { cancelRef.current = true; setEditing(false); };
  return (
    <div
      className={"kb-sheet-tab" + (isActive ? " is-active" : "")}
      role="tab"
      aria-selected={isActive}
      onClick={() => { if (!isActive) onSwitch(sheet.id); }}
    >
      {editing ? (
        <input
          className="kb-sheet-name kb-sheet-name-edit"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onBlur={() => { if (cancelRef.current) cancelRef.current = false; else commit(); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.currentTarget.blur(); }
            else if (event.key === "Escape") { cancel(); }
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          autoFocus
          aria-label="Название сметы"
        />
      ) : (
        <span className="kb-sheet-name" title="Двойной клик — переименовать" onDoubleClick={startEdit}>
          {sheet.name || ""}
        </span>
      )}
      {canRemove && (
        <span className="kb-sheet-tools">
          <button type="button" className="kb-sheet-ctrl" title="Дублировать смету" onClick={(event) => { event.stopPropagation(); onDuplicate(sheet.id); }}>⧉</button>
          <button type="button" className="kb-sheet-ctrl kb-sheet-ctrl-del" title="Удалить смету" onClick={(event) => { event.stopPropagation(); onDelete(sheet.id); }}>×</button>
        </span>
      )}
    </div>
  );
}

/* ============================================================
   Рабочая зона
   ============================================================ */
export function Workspace({ project, onChange, onBack, editingTemplate = false, performers, onSavePerformer, quickAccess, onToggleQuickAccessPin, onRemoveQuickAccess, onOpenAiSettings, onOpenUsage, onOpenFeedback, onTrackAiGenerate, onSignOut, userAccount, aiGenerationReady = false, saveState = "saved", saveError = "", onRetrySave, taskTemplates = [], stageTemplates = [], onTaskTemplatesChange, onStageTemplatesChange, onRequestAiEdit, onCancelAiEdit, onApplyAiEdit, onUndoAiEdit, canUndoAiEdit = false }) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => clampPanelWidth(localStorage.getItem("kb-workspace-left-width"), LEFT_PANEL_RANGE, 248));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => clampPanelWidth(localStorage.getItem("kb-workspace-right-width"), RIGHT_PANEL_RANGE, 288));
  // Брендинг клиентского PDF. В превью — React-стейт (localStorage в артефакте не работает);
  // в Клайне можно persist'ить в localStorage.
  const [importFile, setImportFile] = useState(null);
  const [generateDescription, setGenerateDescription] = useState(null);
  const [activeExecutorId, setActiveExecutorId] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [collapseButtonCompact, setCollapseButtonCompact] = useState(false);
  const [performerModal, setPerformerModal] = useState(null);
  const [globalAiOpen, setGlobalAiOpen] = useState(false);
  const [globalAiClosing, setGlobalAiClosing] = useState(false);
  const [localAiPopover, setLocalAiPopover] = useState(null);
  const globalAiSubmitRef = useRef(null);
  const globalAiBoundaryRef = useRef(null);
  const canvasInnerRef = useRef(null);
  const sheetsBarRef = useRef(null);
  const [aiAnchor, setAiAnchor] = useState({ right: 12, width: 0 });
  useEffect(() => {
    const canvasInner = canvasInnerRef.current;
    if (!canvasInner) return;
    const update = () => {
      const rect = canvasInner.getBoundingClientRect();
      setAiAnchor({ right: Math.max(0, window.innerWidth - (rect.left + rect.width)), width: Math.max(0, rect.width) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvasInner);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  const clipboardRef = useRef(null); // скопированный исполнитель (Ctrl+C/Ctrl+V)
  const dispatch = (fn) => onChange(fn);
  // Итого справа сверху = финальное клиентское ИТОГО активной сметы
  // (base + markup + tax + VAT) — тот же helper, что даёт ИТОГО в экспорте.
  const total = projectTotalWithTax(project);
  const beginPanelResize = useCallback((side, event) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftPanelWidth : rightPanelWidth;
    const range = side === "left" ? LEFT_PANEL_RANGE : RIGHT_PANEL_RANGE;
    const [min] = range;
    const max = panelViewportMax(range);
    const onMove = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) * (side === "left" ? 1 : -1);
      const width = Math.min(max, Math.max(min, startWidth + delta));
      if (side === "left") setLeftPanelWidth(width); else setRightPanelWidth(width);
    };
    const onUp = () => {
      document.body.classList.remove("kb-is-panel-resizing");
      window.removeEventListener("pointermove", onMove);
    };
    document.body.classList.add("kb-is-panel-resizing");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [leftPanelWidth, rightPanelWidth]);
  useEffect(() => {
    const constrainPanels = () => {
      setLeftPanelWidth((width) => Math.min(width, panelViewportMax(LEFT_PANEL_RANGE)));
      setRightPanelWidth((width) => Math.min(width, panelViewportMax(RIGHT_PANEL_RANGE)));
    };
    constrainPanels();
    window.addEventListener("resize", constrainPanels);
    return () => window.removeEventListener("resize", constrainPanels);
  }, []);
  useEffect(() => { localStorage.setItem("kb-workspace-left-width", String(leftPanelWidth)); }, [leftPanelWidth]);
  useEffect(() => { localStorage.setItem("kb-workspace-right-width", String(rightPanelWidth)); }, [rightPanelWidth]);

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

  // Эта кнопка — global entry point. Локальные hard scopes остаются в ядре
  // для будущего context-menu entry point и здесь намеренно не используются.
  const globalScope = globalAiEditScope(project);
  const openAiContext = (event, context) => {
    if (!onRequestAiEdit || editingTemplate) return;
    event.preventDefault();
    setGlobalAiOpen(false);
    setLocalAiPopover({ x: event.clientX, y: event.clientY, context });
  };
  const localScope = (context) => ({ projectId: project.id, sheetId: getActiveSheetId(project), kind: context.kind, stageId: context.stageId, ...(context.taskId ? { taskId: context.taskId } : {}), ...(context.executorId ? { executorId: context.executorId } : {}) });
  const closeGlobalAi = () => {
    if (!globalAiOpen || globalAiClosing) return;
    setGlobalAiClosing(true);
    setTimeout(() => { setGlobalAiOpen(false); setGlobalAiClosing(false); }, 230);
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
    dispatch((p) => withStages(p, p.stages.filter((s) => s.id !== stageId)));
    if (activeStageId === stageId) clearSelection();
  };

  /* ---- добавление кликом из палитры ---- */
  const addStageByClick = (preset) => {
    const stage = makeStage(preset);
    dispatch((p) => withStages(p, [...p.stages, stage]));
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
    dispatch((p) => withStages(p, p.stages.map((s) => ({
      ...s,
      tasks: s.tasks.map((t) => ({
        ...t,
        executors: t.executors.map((e) =>
          e.id === activeExecutorId ? { ...e, tags: applyTagToExecutor(e.tags, payload) } : e),
      })),
    }))));
  };

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

  // Общая точка вставки этапов, подтверждённых в превью импорта/генерации.
  const insertParsedStages = (stages, meta) => {
    dispatch((project) => applyConfirmedEstimate(project, stages, meta));
  };

  const isEmpty = (project?.stages || []).length === 0;
  // п.4: смена вида снимает любое выделение (и в панели «Свойства»).
  /* ---- шаблоны (localStorage) ---- */
  // Уровень 1: сохранить исполнителя как шаблон
  const handleSaveExecutorToPerformer = useCallback((executor) => {
    const linked = executor.performerId && performers.find((item) => item.id === executor.performerId);
    setPerformerModal({ draft: linked || buildPerformerFromExecutor(executor), executorId: executor.id, existingId: linked?.id || null, addToQuickAccess: true });
  }, [performers]);

  const savePerformerCard = async (draft, addToQuickAccess) => {
    const existingId = performerModal?.existingId || (performers.some((item) => item.id === draft.id) ? draft.id : null);
    const saved = await onSavePerformer(draft, addToQuickAccess, existingId);
    if (performerModal?.executorId && saved) dispatch((current) => linkExecutorToPerformer(current, performerModal.executorId, saved));
    if (saved) setPerformerModal(null);
  };
  const openNewPerformer = () => setPerformerModal({ draft: normalizePerformer({ id: "" }), existingId: null, addToQuickAccess: true });

  // Уровень 2: сохранить задачу как шаблон
  const handleSaveTaskTemplate = useCallback((task) => {
    onTaskTemplatesChange?.([...taskTemplates, createTaskTemplate(task)]);
  }, [onTaskTemplatesChange, taskTemplates]);

  // Уровень 3: сохранить этап как шаблон
  const handleSaveStageTemplate = useCallback((stage) => {
    onStageTemplatesChange?.([...stageTemplates, createStageTemplate(stage)]);
  }, [onStageTemplatesChange, stageTemplates]);

  // удаление шаблонов
  const handleRemoveTaskTemplate = (id) => onTaskTemplatesChange?.(taskTemplates.filter((item) => item.id !== id));
  const handleRemoveStageTemplate = (id) => onStageTemplatesChange?.(stageTemplates.filter((item) => item.id !== id));

  // применение шаблонов
  const applyQuickAccess = useCallback((item, stageId = activeStageId, taskId = activeTaskId) => {
    if (!stageId || !taskId) { window.alert("Сначала выберите задачу"); return; }
    const performer = performers.find((entry) => entry.id === item.performerId);
    if (performer) dispatch((current) => addPerformerToTask(current, stageId, taskId, performer));
  }, [activeStageId, activeTaskId, performers]);
  const visibleQuickAccess = sortQuickAccessItems(quickAccess).map((item) => ({ item, performer: performers.find((performer) => performer.id === item.performerId) })).filter((entry) => entry.performer);

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

  dispatch((projectState) => withStages(projectState, [
    ...(Array.isArray(projectState?.stages) ? projectState.stages : []),
    clone,
  ]));

  activateStage(clone.id);
}, []);

const safeStages = Array.isArray(project?.stages)
  ? project.stages
  : [];

const allCollapsed =
  safeStages.length > 0 &&
  safeStages.every((stage) => {
    const safeTasks = Array.isArray(stage?.tasks)
      ? stage.tasks
      : [];

    return (
      stage?.collapsed &&
      safeTasks.every((task) => task?.collapsed)
    );
  });

const toggleAllCollapsed = () =>
  dispatch((current) => {
    const currentStages = Array.isArray(current?.stages)
      ? current.stages
      : [];

    return withStages(current, currentStages.map((stage) => {
      const stageTasks = Array.isArray(stage?.tasks)
        ? stage.tasks
        : [];

      return {
        ...stage,
        collapsed: !allCollapsed,
        tasks: stageTasks.map((task) => ({
          ...task,
          collapsed: !allCollapsed,
        })),
      };
    }));
  });

  const sheets = Array.isArray(project.sheets) ? project.sheets : [];
  const currentSheetId = project.activeSheetId ?? sheets[0]?.id ?? null;
  const addSheet = () => { dispatch((p) => createSheet(p, `Смета ${sheets.length + 1}`)); clearSelection(); };
  const renameActiveSheet = (id, name) => dispatch((p) => renameSheet(p, id, name));
  const switchActiveSheet = (id) => { dispatch((p) => switchSheet(p, id)); clearSelection(); };
  const duplicateActiveSheet = (id) => { dispatch((p) => duplicateSheet(p, id)); clearSelection(); };
  const deleteActiveSheet = (id) => {
    if (sheets.length <= 1) { window.alert("Нельзя удалить последнюю смету"); return; }
    dispatch((p) => deleteSheet(p, id));
    clearSelection();
  };

  // Горизонтальный скролл полосы sheet tabs: вертикальное колесо / Shift+wheel / trackpad deltaX
  // преобразуем в прокрутку табов. Листенер навешиваем нативно с passive:false, чтобы
  // preventDefault() действительно гасил вертикальный скролл канвы под полосой.
  useEffect(() => {
    const bar = sheetsBarRef.current;
    if (!bar) return;
    const onWheel = (event) => {
      if (bar.scrollWidth <= bar.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      bar.scrollLeft += delta;
    };
    bar.addEventListener("wheel", onWheel, { passive: false });
    return () => bar.removeEventListener("wheel", onWheel);
  }, [editingTemplate, sheets.length]);

  // При переключении листа стараемся держать активный таб в зоне видимости.
  useEffect(() => {
    const bar = sheetsBarRef.current;
    if (!bar) return;
    const activeTab = bar.querySelector('.kb-sheet-tab[aria-selected="true"]');
    if (activeTab) activeTab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentSheetId]);

  const rightPanel = (
    <RightPanel project={project} dispatch={dispatch} userId={userAccount?.id}
      activeStageId={activeStageId} activeTaskId={activeTaskId} activeExecutorId={activeExecutorId} />
  );
  const accountControl = <AccountControl userAccount={userAccount} onOpenAiSettings={onOpenAiSettings} onOpenUsage={onOpenUsage} onOpenFeedback={onOpenFeedback} onSignOut={onSignOut} />;

  return (
    <div className="kb-root kb-root-workspace">
      {importFile && (
        <ImportModal file={importFile.file} instruction={importFile.instruction} onClose={() => setImportFile(null)}
          onConfirm={(stages, meta) => { insertParsedStages(stages, meta); setImportFile(null); }} />
      )}
      {generateDescription && (
        <GenerateEstimateModal description={generateDescription} performers={performers} onClose={() => setGenerateDescription(null)}
          onConfirm={(stages, meta) => { onTrackAiGenerate?.(meta); insertParsedStages(stages, meta); setGenerateDescription(null); }} />
      )}
      <header className="kb-header kb-header-min">
        <div className="kb-header-inner">
          <LogoMenu onSaveProject={saveProjectFile} onLoadProject={loadProjectFile} />
          <BetaBadge />
          <nav className="kb-crumbs">
            <button type="button" className="kb-crumb-link" onClick={onBack}>{editingTemplate ? "Шаблоны" : "Проекты"}</button>
            <span className="kb-crumb-sep">/</span>
            <input className="kb-input kb-project-name" value={editingTemplate ? (project.templateName || project.name) : project.name}
              onChange={(e) => dispatch((p) => editingTemplate ? { ...p, templateName: e.target.value, name: e.target.value } : { ...p, name: e.target.value })} />
          </nav>

          <div className="kb-spacer" />

          {!editingTemplate && <div className={`kb-save-status is-${saveState}`} title={saveError || undefined}>
            {saveState === "saving" ? "Сохранение…" : saveState === "error" ? "Не удалось сохранить" : "Сохранено"}
            {saveState === "error" && onRetrySave && <button type="button" onClick={onRetrySave}>Повторить</button>}
          </div>}

          <div className="kb-total-badge">
            <span className="kb-total-label">Итого</span>
            <span className="kb-total-figure">{formatMoney(total)} ₽</span>
          </div>
        </div>
      </header>

      <div className="kb-layout">
        <div className="kb-panel-shell kb-panel-shell-left" style={{ width: leftPanelWidth, left: 0 }}>
          <PalettePanel
            activeExecutorId={activeExecutorId}
            activeExecutorTags={activeExecutorTags}
            activeTaskId={activeTaskId}
            onAddTagToActive={addTagToActive}
            onAddStage={addStageByClick}
            onAddTask={addTaskByClick}
            onAddExecutor={addExecutorByClick}
            quickAccessItems={visibleQuickAccess} onCreatePerformer={openNewPerformer}
            onApplyQuickAccess={applyQuickAccess} onToggleQuickAccessPin={onToggleQuickAccessPin}
            onRemoveQuickAccess={onRemoveQuickAccess}
            taskTemplates={taskTemplates}
            stageTemplates={stageTemplates}
            onApplyTaskTemplate={handleApplyTaskTemplate}
            onApplyStageTemplate={handleApplyStageTemplate}
            onRemoveTaskTemplate={handleRemoveTaskTemplate}
            onRemoveStageTemplate={handleRemoveStageTemplate}
            accountControl={accountControl}
            onOpenFeedback={onOpenFeedback}
          />
          <div className="kb-panel-resizer kb-panel-resizer-left" role="separator" aria-label="Изменить ширину левой панели" aria-orientation="vertical" onPointerDown={(event) => beginPanelResize("left", event)} />
        </div>
          {/* клик по нейтральной зоне листа снимает все выделения. */}
          <main className="kb-canvas" onMouseDown={clearSelection}>
            <div className="kb-canvas-scroll" onScroll={(event) => setCollapseButtonCompact(event.currentTarget.scrollTop > 12)}>
              <div ref={canvasInnerRef} className="kb-canvas-inner">
              {project.metadata?.aiGeneration?.knowledgeNames?.length > 0 && <div className="kb-generation-knowledge">Использованы знания студии: {project.metadata.aiGeneration.knowledgeNames.join(", ")}</div>}
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
                  <UnifiedImportEmptyState disabled={!aiGenerationReady} onPickFile={(file, instruction) => setImportFile({ file, instruction })} onGenerate={setGenerateDescription} />
                </>
              ) : (
                <>
                  {project.stages.map((s, stageIndex) => (
                    <StageCard key={s.id} stage={s} dispatch={dispatch}
                      stageNumber={stageIndex + 1}
                      activeStageId={activeStageId} activeTaskId={activeTaskId}
                      activeExecutorId={activeExecutorId}
                      onActivateStage={activateStage}
                      onActivateTask={activateTask}
                      onActivateExecutor={activateExecutor}
                      onRemove={() => removeStage(s.id)}
                      onSaveStageTemplate={handleSaveStageTemplate}
                      onSaveTaskTemplate={handleSaveTaskTemplate}
                      onSaveExecutorToPerformer={handleSaveExecutorToPerformer}
                      stageTemplates={stageTemplates}
                      onApplyStageTemplate={handleApplyStageTemplate}
                      taskTemplates={taskTemplates}
                      onApplyTaskTemplate={handleApplyTaskTemplate}
                      quickAccessItems={visibleQuickAccess.map((entry) => entry.item)} onApplyQuickAccess={applyQuickAccess} onAiContext={openAiContext} />
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
            </div>
            {!editingTemplate && onRequestAiEdit && project.stages.length > 0 && <div ref={globalAiBoundaryRef} className="kb-ai-launcher-wrap" style={{ right: Math.max(0, aiAnchor.right - 10), "--kb-ai-panel-width": `${aiAnchor.width}px` }}>
              {globalAiOpen && <AiEditTechnicalModal variant="launcher" closing={globalAiClosing} submitRef={globalAiSubmitRef} outsideBoundaryRef={globalAiBoundaryRef} scope={globalScope} contextLabel="Вся смета" onRequest={onRequestAiEdit} onCancelRequest={onCancelAiEdit} onApply={onApplyAiEdit} onUndo={onUndoAiEdit} canUndo={canUndoAiEdit} onClose={closeGlobalAi} />}
              {canUndoAiEdit && !globalAiOpen && <button type="button" className="kb-ai-undo-chip" onClick={onUndoAiEdit}>Undo AI</button>}
              <button type="button" className={`kb-ai-launcher${globalAiOpen && !globalAiClosing ? " is-open" : ""}`} aria-label={globalAiOpen ? "Предпросмотр изменений" : "Открыть AI-ассистента"} onClick={() => { setLocalAiPopover(null); if (globalAiOpen) globalAiSubmitRef.current?.(); else setGlobalAiOpen(true); }}><ArrowUp size={20} strokeWidth={1.8} /></button>
            </div>}
            {!editingTemplate && sheets.length > 0 && (
              <div ref={sheetsBarRef} className="kb-sheets-bar" role="tablist" aria-label="Сметы" onMouseDown={(event) => event.stopPropagation()}>
                {sheets.map((sheet) => (
                  <SheetTab
                    key={sheet.id}
                    sheet={sheet}
                    isActive={sheet.id === currentSheetId}
                    canRemove={sheets.length > 1}
                    onSwitch={switchActiveSheet}
                    onRename={renameActiveSheet}
                    onDuplicate={duplicateActiveSheet}
                    onDelete={deleteActiveSheet}
                  />
                ))}
                <button type="button" className="kb-sheet-add" onClick={addSheet} title="Новая смета">+</button>
              </div>
            )}
          </main>
          <div className="kb-panel-shell kb-panel-shell-right" style={{ width: rightPanelWidth, right: 0 }}>
            <div className="kb-panel-resizer kb-panel-resizer-right" role="separator" aria-label="Изменить ширину правой панели" aria-orientation="vertical" onPointerDown={(event) => beginPanelResize("right", event)} />
            {rightPanel}
          </div>
          {performerModal && <PerformerModal initial={performerModal.draft} isNew={!performerModal.existingId} initialAddToQuickAccess={performerModal.addToQuickAccess} onSave={savePerformerCard} onClose={() => setPerformerModal(null)} />}
          {localAiPopover && <AiEditTechnicalModal variant="inline" position={{ x: localAiPopover.x, y: localAiPopover.y }} scope={localScope(localAiPopover.context)} contextLabel={localAiPopover.context.label} onRequest={onRequestAiEdit} onCancelRequest={onCancelAiEdit} onApply={onApplyAiEdit} onClose={() => setLocalAiPopover(null)} />}
      </div>
    </div>
  );
}

