const ENTITY_ORDER = ["projectTemplates", "stageTemplates", "taskTemplates", "performers", "historicalProjects"];
const MAX_DISPLAY_NAMES = 8;

function displayName(type, item) {
  if (type === "performers") return item?.displayName || item?.roles?.[0] || item?.specializations?.[0] || "";
  return item?.name || "";
}

export function buildGenerationMetadata({ shortlist, profileFallbackUsed, profile, now = () => new Date() } = {}) {
  const names = [];
  for (const type of ENTITY_ORDER) {
    for (const item of Array.isArray(shortlist?.[type]) ? shortlist[type] : []) {
      const name = String(displayName(type, item) || "").trim().replace(/\s+/g, " ").slice(0, 80);
      if (name && !names.includes(name)) names.push(name);
      if (names.length === MAX_DISPLAY_NAMES) break;
    }
    if (names.length === MAX_DISPLAY_NAMES) break;
  }
  return { version: 1, generatedAt: now().toISOString(), knowledgeNames: names, profileFallbackUsed: Boolean(profileFallbackUsed), ...(profile ? { pricingMode: profile.pricingMode, performerRateMode: profile.performerRateMode } : {}) };
}

export function serializeGenerationMetadata(metadata) {
  return encodeURIComponent(JSON.stringify(metadata));
}
