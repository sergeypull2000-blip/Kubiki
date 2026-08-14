const MAX_NAMES = 8;

export function normalizeGenerationMetadata(value) {
  if (!value || typeof value !== "object" || value.version !== 1) return null;
  const generatedAt = typeof value.generatedAt === "string" && !Number.isNaN(Date.parse(value.generatedAt)) ? value.generatedAt : "";
  const knowledgeNames = [...new Set((Array.isArray(value.knowledgeNames) ? value.knowledgeNames : [])
    .map((name) => typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 80) : "")
    .filter(Boolean))].slice(0, MAX_NAMES);
  const pricingMode = ["estimate_missing", "leave_missing_blank"].includes(value.pricingMode) ? value.pricingMode : null;
  const performerRateMode = ["inherit_defaults", "leave_blank"].includes(value.performerRateMode) ? value.performerRateMode : null;
  return { version: 1, ...(generatedAt ? { generatedAt } : {}), knowledgeNames, profileFallbackUsed: Boolean(value.profileFallbackUsed), ...(pricingMode && performerRateMode ? { pricingMode, performerRateMode } : {}) };
}

export function decodeGenerationMetadataHeader(value) {
  if (!value || typeof value !== "string" || value.length > 4_000) return null;
  try { return normalizeGenerationMetadata(JSON.parse(decodeURIComponent(value))); }
  catch { return null; }
}

export function attachGenerationMetadata(estimate, metadata) {
  if (!estimate || typeof estimate !== "object" || !metadata) return estimate;
  Object.defineProperty(estimate, "__generationMetadata", { value: metadata, enumerable: false, configurable: false });
  return estimate;
}
