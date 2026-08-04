import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronsUp, ChevronsDown } from "lucide-react";
import { fmt } from "../utils.js";
import { projectSum } from "../calculations.js";
import { CUSTOM_STAGE } from "../constants.js";
import {
  makeExecutor, makeTask, makeStage,
  mapStage, withTask,
  findExecutor, cloneExecutor, insertStage, applyTagToExecutor,
} from "../store.js";
import { ImportModal, GenerateEstimateModal, UnifiedImportEmptyState, LogoMenu } from "../importExcel.jsx";
import { PalettePanel } from "./LeftPanel.jsx";
import { StageCard, CanvasDropZone } from "./Stage.jsx";
import { RightPanel } from "./RightPanel.jsx";
import { PerformerModal } from "./PerformerLibrary.jsx";
import { addPerformerToTask, buildPerformerFromExecutor, linkExecutorToPerformer, normalizePerformer } from "../performerLibrary.js";
import { sortQuickAccessItems } from "../quickAccess.js";
import { createTaskTemplate, createStageTemplate, cloneTaskTemplate, cloneStageTemplate } from "../templates.js";

/* ============================================================
   Рабочая зона
   ============================================================ */
export function Workspace({ project, onChange, onBack, editingTemplate = false, performers, onSavePerformer, quickAccess, onToggleQuickAccessPin, onRemoveQuickAccess, onOpenAiSettings, onSignOut, aiGenerationReady = false, saveState = "saved", saveError = "", onRetrySave, taskTemplates = [], stageTemplates = [], onTaskTemplatesChange, onStageTemplatesChange }) {
  // Брендинг клиентского PDF. В превью — React-стейт (localStorage в артефакте не работает);
  // в Клайне можно persist'ить в localStorage.
  const [importFile, setImportFile] = useState(null);
  const [generateDescription, setGenerateDescription] = useState(null);
  const [activeExecutorId, setActiveExecutorId] = useState(null);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeStageId, setActiveStageId] = useState(null);
  const [collapseButtonCompact, setCollapseButtonCompact] = useState(false);
  const [performerModal, setPerformerModal] = useState(null);
  const clipboardRef = useRef(null); // скопированный исполнитель (Ctrl+C/Ctrl+V)
  const dispatch = (fn) => onChange(fn);
  const total = projectSum(project);

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
    dispatch((p) => ({
      ...p,
      stages: [...(p.stages || []), ...stages],
      ...(meta && Number.isFinite(meta.globalMarkup) ? { globalMarkup: meta.globalMarkup } : {}),
      ...(meta?.generationMetadata ? { metadata: { ...p.metadata, aiGeneration: meta.generationMetadata } } : {}),
    }));
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

  dispatch((projectState) => ({
    ...projectState,
    stages: [
      ...(Array.isArray(projectState?.stages) ? projectState.stages : []),
      clone,
    ],
  }));

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

    return {
      ...current,
      stages: currentStages.map((stage) => {
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
      }),
    };
  });

  const rightPanel = (
    <RightPanel project={project} dispatch={dispatch}
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

          {!editingTemplate && <div className={`kb-save-status is-${saveState}`} title={saveError || undefined}>
            {saveState === "saving" ? "Сохранение…" : saveState === "error" ? "Не удалось сохранить" : "Сохранено"}
            {saveState === "error" && onRetrySave && <button type="button" onClick={onRetrySave}>Повторить</button>}
          </div>}

          {onOpenAiSettings && <button type="button" className="kb-ai-settings-open" onClick={onOpenAiSettings}>Персонализация ИИ</button>}
          <button type="button" className="kb-sign-out" onClick={onSignOut}>Выйти</button>

          <div className="kb-total-badge">
            <span className="kb-total-label">Итого</span>
            <span className="kb-total-figure">{fmt(total)} ₽</span>
          </div>
        </div>
      </header>

      <div className="kb-layout">
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
          />
          {/* клик по нейтральной зоне листа снимает все выделения. */}
          <main className="kb-canvas"
            onMouseDown={clearSelection}
            onScroll={(event) => setCollapseButtonCompact(event.currentTarget.scrollTop > 12)}>
            <div className="kb-canvas-inner">
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
                      onSaveExecutorToPerformer={handleSaveExecutorToPerformer}
                      stageTemplates={stageTemplates}
                      onApplyStageTemplate={handleApplyStageTemplate}
                      taskTemplates={taskTemplates}
                      onApplyTaskTemplate={handleApplyTaskTemplate}
                      quickAccessItems={visibleQuickAccess.map((entry) => entry.item)} onApplyQuickAccess={applyQuickAccess} />
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
          {performerModal && <PerformerModal initial={performerModal.draft} isNew={!performerModal.existingId} initialAddToQuickAccess={performerModal.addToQuickAccess} onSave={savePerformerCard} onClose={() => setPerformerModal(null)} />}
      </div>
    </div>
  );
}

