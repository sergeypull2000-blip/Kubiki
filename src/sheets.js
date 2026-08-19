/* ---------- multi-sheet helpers (pure, no imports) ----------
   A Project is a container of independent Estimate Sheets.
   Canonical shape (after normalizeProject):
     { ...meta, sheets: [{ id, name, stages: [...] }], activeSheetId, stages: <active sheet stages> }
   - `sheets` is the single source of truth for every sheet.
   - `project.stages` is ALWAYS the active sheet's stages (derived reference),
     so single-sheet code (calc/export/AI/UI) keeps working unchanged.
   - `stagesOf(project, sheetId)` resolves the active (or a specific) sheet's
     stages and falls back to legacy `project.stages` for un-migrated payloads. */

export const DEFAULT_SHEET_NAME = "Смета 1";

/* Deterministic sheet id for the legacy { stages: [...] } → sheets[0] migration.
   Never depends on randomness, so re-reading the same legacy payload yields the
   same id, and normalizeProject stays idempotent. */
export function legacySheetId(projectId) {
  const base = String(projectId == null ? "" : projectId).trim() || "project";
  return `sheet-${base}-1`;
}

export function sheetsOf(project) {
  return project && typeof project === "object" && Array.isArray(project.sheets) ? project.sheets : [];
}

export function activeSheet(project) {
  const sheets = sheetsOf(project);
  if (!sheets.length) return null;
  const id = project && typeof project === "object" ? project.activeSheetId : null;
  return sheets.find((sheet) => sheet && sheet.id === id) || sheets[0] || null;
}

export function activeSheetId(project) {
  const sheet = activeSheet(project);
  return sheet ? sheet.id : null;
}

export function stagesOf(project, sheetId) {
  const sheets = sheetsOf(project);
  if (sheets.length) {
    const sheet = sheetId != null
      ? sheets.find((item) => item && item.id === sheetId)
      : activeSheet(project);
    if (sheet) return Array.isArray(sheet.stages) ? sheet.stages : [];
    return [];
  }
  // Legacy / un-migrated payloads carry stages at the top level.
  return project && typeof project === "object" && Array.isArray(project.stages) ? project.stages : [];
}

/* Read-only view of a project scoped to one sheet: replaces `stages` with the
   target sheet's stages (and points `activeSheetId` at that sheet) so existing
   single-sheet code treats it as a one-sheet project unchanged. */
export function sheetProject(project, sheetId) {
  if (!project || typeof project !== "object") return project;
  const resolvedId = sheetId != null ? sheetId : activeSheetId(project);
  return { ...project, activeSheetId: resolvedId ?? project.activeSheetId, stages: stagesOf(project, sheetId) };
}
