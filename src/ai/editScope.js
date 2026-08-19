import { activeSheetId } from "../sheets.js";

export const globalAiEditScope = (project) => {
  const sheetId = activeSheetId(project);
  return { kind: "project", projectId: project?.id, ...(sheetId ? { sheetId } : {}) };
};
