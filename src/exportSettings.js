export const EXPORT_FONT_FAMILIES = Object.freeze(["Roboto"]);
export const DEFAULT_PRESENTATION_SETTINGS = Object.freeze({
  branding: { logoAssetPath: "", companyName: "", phone: "", email: "", website: "", colors: { stage: "#EEF2F7", task: "#FFFFFF", total: "#E8EEF7", stageText: "#1A2230", taskText: "#1A2230", totalText: "#1A2230", accent: "#1A2230", text: "#1A2230" }, fontFamily: "Roboto" },
  typography: { title: { size: 18, weight: 700 }, stage: { size: 11, weight: 700 }, task: { size: 10 }, total: { size: 13, weight: 700 }, service: { size: 8 } },
  content: { showComments: true, performerVisibility: "none", visibleExecutorIds: [], rowColorOverrides: {} },
  service: { validUntil: true, copyrightIncluded: false, confidential: false, customEnabled: false, customText: "" },
});

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, fallback = "") => typeof value === "string" ? value.slice(0, 2000) : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
const size = (value, fallback, min = 6, max = 36) => Math.min(max, Math.max(min, Number(value) || fallback));
const weight = (value, fallback) => [400, 500, 600, 700].includes(Number(value)) ? Number(value) : fallback;

export function normalizePresentationSettings(value) {
  const source = object(value), defaults = DEFAULT_PRESENTATION_SETTINGS;
  const brand = object(source.branding), colors = object(brand.colors), type = object(source.typography), content = object(source.content), service = object(source.service);
  const style = (key, withWeight = false) => { const item = object(type[key]), base = defaults.typography[key]; return { size: size(item.size, base.size), ...(withWeight ? { weight: weight(item.weight, base.weight) } : {}) }; };
  return {
    branding: { logoAssetPath: text(brand.logoAssetPath), companyName: text(brand.companyName, text(brand.studioName)), phone: text(brand.phone), email: text(brand.email), website: text(brand.website), colors: { stage: color(colors.stage, defaults.branding.colors.stage), task: color(colors.task, defaults.branding.colors.task), total: color(colors.total, defaults.branding.colors.total), stageText: color(colors.stageText, defaults.branding.colors.stageText), taskText: color(colors.taskText, defaults.branding.colors.taskText), totalText: color(colors.totalText, defaults.branding.colors.totalText), accent: color(colors.accent, defaults.branding.colors.accent), text: color(colors.text, defaults.branding.colors.text) }, fontFamily: EXPORT_FONT_FAMILIES.includes(brand.fontFamily) ? brand.fontFamily : defaults.branding.fontFamily },
    typography: { title: style("title", true), stage: style("stage", true), task: style("task"), total: style("total", true), service: style("service") },
    content: { showComments: content.showComments !== false, performerVisibility: "none", visibleExecutorIds: [], rowColorOverrides: Object.fromEntries(Object.entries(object(content.rowColorOverrides)).filter(([, value]) => /^#[0-9a-f]{6}$/i.test(value))) },
    service: { validUntil: service.validUntil !== false, copyrightIncluded: service.copyrightIncluded === true, confidential: service.confidential === true, customEnabled: service.customEnabled === true, customText: text(service.customText) },
  };
}

export function presentationSettingsForPreset(settings) {
  const normalized = normalizePresentationSettings(settings);
  return {
    version: 1,
    markupPresentation: settings?.markupPresentation === "distributed" ? "distributed" : "separate_line",
    taxPresentation: settings?.taxPresentation === "distributed" ? "distributed" : "separate_line",
    ...normalized,
    content: { ...normalized.content, visibleExecutorIds: [], rowColorOverrides: {} },
  };
}
