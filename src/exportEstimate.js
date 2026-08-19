import {
  projectMarkupAmount,
  projectSum,
  projectTaxBreakdown,
  projectTotalWithTax,
  taskPrice,
  taskSum,
} from "./calculations.js";
import { normalizePresentationSettings } from "./exportSettings.js";
import { activeSheet, stagesOf } from "./sheets.js";

export const EXPORT_SETTINGS_VERSION = 1;
export const DEFAULT_EXPORT_SETTINGS = Object.freeze({
  version: EXPORT_SETTINGS_VERSION,
  markupPresentation: "separate_line",
  taxPresentation: "separate_line",
});

const PRESENTATIONS = new Set(["distributed", "separate_line"]);
const toMinor = (amount) => Math.round((Number(amount) || 0) * 100);
const fromMinor = (amount) => amount / 100;

export function normalizeExportSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const base = {
    version: EXPORT_SETTINGS_VERSION,
    markupPresentation: PRESENTATIONS.has(source.markupPresentation) ? source.markupPresentation : DEFAULT_EXPORT_SETTINGS.markupPresentation,
    taxPresentation: PRESENTATIONS.has(source.taxPresentation) ? source.taxPresentation : DEFAULT_EXPORT_SETTINGS.taxPresentation,
  };
  return ["branding", "typography", "content", "service"].some((key) => key in source) ? { ...base, ...normalizePresentationSettings(source) } : base;
}

const formatDate = (value) => { const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || ""); return match ? `${match[3]}.${match[2]}.${match[1]}` : ""; };

export function getEligibleExportTasks(project) {
  return stagesOf(project).flatMap((stage, stageIndex) =>
    (stage.tasks || []).map((task, taskIndex) => ({ stage, task, stageIndex, taskIndex })));
}

// Largest remainder: целая часть доли назначается сразу, остаток — строкам с
// наибольшей дробной частью, при равенстве сохраняется исходный порядок.
export function allocateMoneyProportionally(totalMinorUnits, weightedItems) {
  const total = Math.trunc(Number(totalMinorUnits) || 0);
  const items = Array.isArray(weightedItems) ? weightedItems : [];
  if (items.length === 0) return total === 0 ? [] : null;
  const weights = items.map((item) => Math.max(0, Number(item?.weight) || 0));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return total === 0 ? weights.map(() => 0) : null;

  const sign = total < 0 ? -1 : 1;
  const absoluteTotal = Math.abs(total);
  const exact = weights.map((weight) => absoluteTotal * weight / weightTotal);
  const allocated = exact.map(Math.floor);
  let remainder = absoluteTotal - allocated.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remainder; index += 1) allocated[order[index].index] += 1;
  return allocated.map((value) => value * sign);
}

function allocateOrUseActual(total, actual, fallbackWeights) {
  if (actual.length && actual.reduce((sum, value) => sum + value, 0) === total) return [...actual];
  const actualWeights = actual.map((value) => Math.max(0, value));
  return allocateMoneyProportionally(total, actualWeights.some(Boolean)
    ? actualWeights.map((weight) => ({ weight }))
    : fallbackWeights.map((weight) => ({ weight })));
}

export function distributeMarkupAcrossTasks(markupMinor, tasks) {
  return allocateOrUseActual(
    markupMinor,
    tasks.map((item) => item.actualMarkupMinor),
    tasks.map((item) => item.baseAmountMinor),
  );
}

export function distributeTaxAcrossTasks(componentMinor, tasks) {
  return allocateMoneyProportionally(componentMinor, tasks.map((item) => ({ weight: item.preTaxAmountMinor })));
}

export const buildSeparateMarkupRow = (amountMinor, metadata = {}) => ({
  type: "markup", label: metadata.label || "Агентская комиссия / Маркап", amount: fromMinor(amountMinor), amountMinor, metadata,
});

export const buildSeparateTaxRows = (components) => components.map((component) => ({
  type: "tax", label: component.label, amount: component.amount, amountMinor: toMinor(component.amount), metadata: { ...component },
}));

export const calculateExportStageSubtotal = (stage) => stage.rows.reduce((sum, row) => sum + row.exportedAmountMinor, 0);
export const calculateExportTotal = (model) => model.stages.reduce((sum, stage) => sum + stage.exportedSubtotalMinor, 0)
  + model.separateRows.reduce((sum, row) => sum + row.amountMinor, 0);

export function validateExportModelTotals(model) {
  const calculatedMinor = calculateExportTotal(model);
  return { valid: calculatedMinor === model.summary.totalMinor, calculatedMinor, expectedMinor: model.summary.totalMinor };
}

export function buildExportEstimateModel(project, rawSettings = project?.exportSettings) {
  const settings = { ...normalizeExportSettings(rawSettings), ...normalizePresentationSettings(rawSettings) };
  const flat = getEligibleExportTasks(project);
  const baseTotalMinor = toMinor(projectSum(project));
  const baseAllocations = allocateMoneyProportionally(baseTotalMinor, flat.map(({ task }) => ({ weight: Math.max(0, taskSum(task)) })))
    || flat.map(() => 0);
  const gm = project?.globalMarkup ?? 0;
  const mode = project?.markupMode === "transparent" ? "transparent" : "embedded";
  const tasks = flat.map((entry, index) => {
    const actualBaseMinor = toMinor(taskSum(entry.task));
    const actualPriceMinor = toMinor(taskPrice(entry.task, gm, mode));
    return { ...entry, baseAmountMinor: baseAllocations[index], actualMarkupMinor: actualPriceMinor - actualBaseMinor };
  });

  const markupMinor = toMinor(projectMarkupAmount(project));
  let markupAllocations = tasks.map(() => 0);
  let markupSeparate = settings.markupPresentation === "separate_line";
  const warnings = [];
  if (!markupSeparate && markupMinor !== 0) {
    const allocated = distributeMarkupAcrossTasks(markupMinor, tasks);
    if (allocated) markupAllocations = allocated;
    else {
      markupSeparate = true;
      warnings.push("Сумму невозможно распределить между задачами с нулевой стоимостью, поэтому она показана отдельной строкой.");
    }
  }
  tasks.forEach((task, index) => { task.distributedMarkupMinor = markupAllocations[index]; task.preTaxAmountMinor = task.baseAmountMinor + task.actualMarkupMinor; });

  const taxBreakdown = projectTaxBreakdown(project);
  const taxAllocations = taxBreakdown.map(() => tasks.map(() => 0));
  const separateTaxComponents = [];
  for (let componentIndex = 0; componentIndex < taxBreakdown.length; componentIndex += 1) {
    const component = taxBreakdown[componentIndex];
    // НДС остаётся самостоятельным компонентом сметы при любом способе
    // отображения основного налога проекта.
    if (component.type === "vat" || settings.taxPresentation === "separate_line") separateTaxComponents.push(component);
    else {
      const allocated = distributeTaxAcrossTasks(toMinor(component.amount), tasks);
      if (allocated) taxAllocations[componentIndex] = allocated;
      else {
        separateTaxComponents.push(component);
        if (!warnings.length) warnings.push("Сумму невозможно распределить между задачами с нулевой стоимостью, поэтому она показана отдельной строкой.");
      }
    }
  }

  const rowsByStage = new Map();
  tasks.forEach((item, taskIndex) => {
    const distributedTaxBreakdown = taxBreakdown.map((component, componentIndex) => ({
      ...component,
      amountMinor: taxAllocations[componentIndex][taskIndex],
      amount: fromMinor(taxAllocations[componentIndex][taskIndex]),
    })).filter((component) => component.amountMinor !== 0);
    const distributedTaxMinor = distributedTaxBreakdown.reduce((sum, component) => sum + component.amountMinor, 0);
    const exportedAmountMinor = item.baseAmountMinor + item.distributedMarkupMinor + distributedTaxMinor;
    const row = {
      type: "task", sourceTaskId: item.task.id, name: item.task.name || "Без названия",
      baseAmount: fromMinor(item.baseAmountMinor), baseAmountMinor: item.baseAmountMinor,
      distributedMarkupAmount: fromMinor(item.distributedMarkupMinor), distributedMarkupAmountMinor: item.distributedMarkupMinor,
      distributedTaxAmount: fromMinor(distributedTaxMinor), distributedTaxAmountMinor: distributedTaxMinor,
      distributedTaxBreakdown, exportedAmount: fromMinor(exportedAmountMinor), exportedAmountMinor,
      comment: settings.content.showComments ? String(item.task.exportComment || "") : "",
      performers: [],
      number: `${item.stageIndex + 1}.${item.taskIndex + 1}`,
      color: settings.content.rowColorOverrides[String(item.task.id)] || settings.branding.colors.task,
      textColor: settings.branding.colors.taskText,
    };
    const rows = rowsByStage.get(item.stage.id) || [];
    rows.push(row); rowsByStage.set(item.stage.id, rows);
  });

  const stages = stagesOf(project).filter((stage) => (stage.tasks || []).length).map((stage) => {
    const rows = rowsByStage.get(stage.id) || [];
    const baseSubtotalMinor = rows.reduce((sum, row) => sum + row.baseAmountMinor, 0);
    const exportedSubtotalMinor = rows.reduce((sum, row) => sum + row.exportedAmountMinor, 0);
    return { id: stage.id, number: String(stagesOf(project).indexOf(stage) + 1), name: stage.name || "Этап", color: settings.content.rowColorOverrides[String(stage.id)] || settings.branding.colors.stage, textColor: settings.branding.colors.stageText, rows, baseSubtotal: fromMinor(baseSubtotalMinor), baseSubtotalMinor, exportedSubtotal: fromMinor(exportedSubtotalMinor), exportedSubtotalMinor };
  });
  const separateRows = [
    ...(markupSeparate && markupMinor !== 0 ? [buildSeparateMarkupRow(markupMinor, {
      baseAmount: fromMinor(baseTotalMinor),
      rate: baseTotalMinor ? markupMinor / baseTotalMinor * 100 : 0,
    })] : []),
    ...buildSeparateTaxRows(separateTaxComponents),
  ];
  const totalMinor = toMinor(projectTotalWithTax(project));
  const model = {
    version: 2, settings, projectId: project?.id, projectName: project?.name || "Проект", sheetName: activeSheet(project)?.name || "",
    proposal: { title: project?.exportMetadata?.title || project?.name || "Коммерческое предложение", startDate: project?.exportMetadata?.startDate || "", endDate: project?.exportMetadata?.endDate || "", durationDays: project?.exportMetadata?.durationDays || "", createdAt: project?.exportMetadata?.createdAt || new Date().toISOString().slice(0, 10), validUntil: project?.exportMetadata?.validUntil || "", producer: project?.exportMetadata?.producer || "", artDirector: project?.exportMetadata?.artDirector || "", supervisor: project?.exportMetadata?.supervisor || "" },
    brand: { ...settings.branding, logoUrl: project?.exportLogoUrl || "" },
    typography: settings.typography,
    serviceBlocks: [
      settings.service.validUntil && formatDate(project?.exportMetadata?.validUntil) ? `Коммерческое предложение действительно до ${formatDate(project.exportMetadata.validUntil)}` : "",
      settings.service.copyrightIncluded ? "Стоимость передачи исключительного авторского права включена в итоговую стоимость" : "",
      settings.service.confidential ? "Конфиденциально" : "",
      settings.service.customEnabled ? settings.service.customText : "",
    ].filter(Boolean),
    stages, separateRows, warnings,
    display: { markupPresentation: settings.markupPresentation, taxPresentation: settings.taxPresentation, showComments: settings.content.showComments, performerVisibility: settings.content.performerVisibility },
    summary: {
      baseSubtotal: fromMinor(baseTotalMinor), baseSubtotalMinor: baseTotalMinor,
      markupAmount: fromMinor(markupMinor), markupAmountMinor: markupMinor,
      taxBreakdown: taxBreakdown.map((component) => ({ ...component, amountMinor: toMinor(component.amount) })),
      total: fromMinor(totalMinor), totalMinor,
    },
  };
  model.validation = validateExportModelTotals(model);
  return model;
}
