import { deserializeProjectFromServer } from "../../src/projectServer.js";

function data(result, message) {
  if (result.error) throw new Error(message, { cause: result.error });
  return result.data;
}

export async function loadOwnProjectForEdit(client, userId, projectId) {
  const result = await client.from("projects").select("id,user_id,client_id,name,data_version,project_data")
    .eq("user_id", userId).eq("client_id", projectId).maybeSingle();
  const row = data(result, "Не удалось загрузить смету");
  if (!row || row.user_id !== userId) return null;
  return deserializeProjectFromServer(row);
}

export async function loadOwnPerformersForEdit(client, userId) {
  const result = await client.from("performers").select("user_id,client_id,performer_data").eq("user_id", userId);
  return (data(result, "Не удалось загрузить Performer") || [])
    .filter((row) => row?.user_id === userId)
    .map((row) => ({ ...row.performer_data, id: String(row.client_id || row.performer_data?.id || "") }))
    .filter((performer) => performer.id && performer.active !== false);
}

export async function loadOwnSelectedKnowledge(client, userId, selection) {
  const selected = Array.isArray(selection) ? selection.filter((item) => item.kind !== "performer") : [];
  if (!selected.length) return [];
  const result = await client.from("template_libraries").select("user_id,library_data").eq("user_id", userId).maybeSingle();
  const row = data(result, "Не удалось загрузить выбранные знания студии");
  if (!row || row.user_id !== userId) return [];
  const library = row.library_data && typeof row.library_data === "object" ? row.library_data : {};
  const keyByKind = { project_template: "projectTemplates", stage_template: "stageTemplates", task_template: "taskTemplates" };
  return selected.map((source) => {
    const item = (library[keyByKind[source.kind]] || []).find((entry) => String(entry.id) === source.id);
    return item ? { kind: source.kind, id: source.id, value: item } : null;
  }).filter(Boolean);
}
