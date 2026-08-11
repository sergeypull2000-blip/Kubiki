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
