export const AI_INTENT_ROUTER_VERSION = 1;

const clean = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").trim();
const GENERATION_OBJECT = /(?:смет\p{L}*|структур\p{L}*|этап\p{L}*|стади\p{L}*)/iu;
const GENERATION_ACTION = /(?:сдела\p{L}*|собер\p{L}*|собра\p{L}*|созда\p{L}*|сгенер\p{L}*)/iu;
const EDIT_ACTION = /(?:добав\p{L}*|переимен\p{L}*|удал\p{L}*|замен\p{L}*|измен\p{L}*|увелич\p{L}*|уменьш\p{L}*|перемест\p{L}*)/iu;

export function routeAiIntentDeterministically(instruction) {
  const value = clean(instruction);
  if (!value) return null;
  if (EDIT_ACTION.test(value)) return { schemaVersion: AI_INTENT_ROUTER_VERSION, kind: "edit_existing" };
  if (GENERATION_ACTION.test(value) && GENERATION_OBJECT.test(value)) return { schemaVersion: AI_INTENT_ROUTER_VERSION, kind: "generate_structure" };
  return null;
}

export function parseAiIntentRoute(raw) {
  let value;
  try { value = typeof raw === "string" ? JSON.parse(raw.trim()) : raw; } catch { return null; }
  if (!value || value.schemaVersion !== AI_INTENT_ROUTER_VERSION) return null;
  if (["edit_existing", "generate_structure"].includes(value.kind) && Object.keys(value).length === 2) return value;
  if (value.kind === "clarification" && Object.keys(value).length === 3 && typeof value.question === "string" && value.question.trim() && value.question.includes("?")) return value;
  if (value.kind === "unsupported" && Object.keys(value).length === 3 && typeof value.code === "string" && value.code.trim()) return value;
  return null;
}

export async function routeAiIntent({ instruction, requestModel }) {
  const deterministic = routeAiIntentDeterministically(instruction);
  if (deterministic) return deterministic;
  const raw = await requestModel([
    { role: "system", content: `Classify one Kubiki request. Return strict JSON only. schemaVersion is 1. Kinds: edit_existing for changing existing estimate entities; generate_structure for creating a new Stage/Task structure; clarification with one concrete question only when truly ambiguous; unsupported otherwise. Never return replace_project. Schemas: {"schemaVersion":1,"kind":"edit_existing"}, {"schemaVersion":1,"kind":"generate_structure"}, {"schemaVersion":1,"kind":"clarification","question":"...?"}, {"schemaVersion":1,"kind":"unsupported","code":"unsupported_intent"}.` },
    { role: "user", content: `<instruction>${instruction}</instruction>` },
  ], { maxTokens: 180, retries: 1, stage: "ai_route" });
  return parseAiIntentRoute(raw);
}
