import { activeSheetId, stagesOf } from "../sheets.js";

const PRESENTATION_ONLY_KEYS = new Set(["collapsed"]);

function revisionValue(value) {
  if (Array.isArray(value)) return value.map(revisionValue);
  if (!value || typeof value !== "object") return value === undefined ? null : value;
  return Object.fromEntries(Object.keys(value).filter((key) => !PRESENTATION_ONLY_KEYS.has(key)).sort().map((key) => [key, revisionValue(value[key])]));
}

export function projectRevisionPayload(project) {
  return JSON.stringify(revisionValue(project && typeof project === "object" ? project : {}));
}

function bytesToHex(bytes) {
  return [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export async function projectRevision(project, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle) throw new Error("SHA-256 is unavailable");
  const bytes = new TextEncoder().encode(projectRevisionPayload(project));
  return `sha256:${bytesToHex(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes)))}`;
}

/* Sheet-scoped revision for AI stale protection: only the target sheet plus
   shared financial settings participate. Editing another sheet (or switching
   the active sheet) does NOT invalidate an in-flight AI request. */
const SHEET_SCOPE_KEYS = ["globalMarkup", "markupMode", "tax", "vat"];

export function sheetRevisionProjection(project, sheetId) {
  const source = project && typeof project === "object" ? project : {};
  const base = { sheetId: sheetId != null ? sheetId : activeSheetId(source) || null };
  for (const key of SHEET_SCOPE_KEYS) if (key in source) base[key] = source[key];
  base.stages = stagesOf(source, sheetId);
  return base;
}

export function sheetRevision(project, sheetId, cryptoImpl = globalThis.crypto) {
  return projectRevision(sheetRevisionProjection(project, sheetId), cryptoImpl);
}
