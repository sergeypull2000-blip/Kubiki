import { deserializeProjectFromServer } from "../../src/projectServer.js";

function data(result, message) {
  if (result.error) throw new Error(message, { cause: result.error });
  return result.data;
}

export async function loadOwnProjectForEdit(client, userId, projectId) {
  if (typeof client?.loadProject === "function") return client.loadProject(userId, projectId);
  const result = await client.from("projects").select("id,user_id,client_id,name,data_version,project_data")
    .eq("user_id", userId).eq("client_id", projectId).maybeSingle();
  const row = data(result, "Не удалось загрузить смету");
  if (!row || row.user_id !== userId) return null;
  return deserializeProjectFromServer(row);
}

export async function listOwnProjectClientIds(client, userId) {
  if (typeof client?.listProjectClientIds === "function") return client.listProjectClientIds(userId);
  const result = await client.from("projects").select("client_id").eq("user_id", userId);
  const rows = data(result, "Не удалось диагностировать проекты пользователя");
  return (rows || []).map((row) => row?.client_id).filter((id) => typeof id === "string" && id.trim());
}

export async function loadOwnPerformersForEdit(client, userId) {
  if (typeof client?.loadPerformers === "function") return client.loadPerformers(userId);
  const result = await client.from("performers").select("user_id,client_id,performer_data").eq("user_id", userId);
  return (data(result, "Не удалось загрузить Performer") || [])
    .filter((row) => row?.user_id === userId)
    .map((row) => ({ ...row.performer_data, id: String(row.client_id || row.performer_data?.id || "") }))
    .filter((performer) => performer.id && performer.active !== false);
}

export async function loadOwnSelectedKnowledge(client, userId, selection) {
  const selected = Array.isArray(selection) ? selection.filter((item) => item.kind !== "performer") : [];
  if (!selected.length) return [];
  if (typeof client?.loadTemplateLibrary === "function") {
    const library = await client.loadTemplateLibrary(userId);
    if (!library) return [];
    const keyByKind = { project_template: "projectTemplates", stage_template: "stageTemplates", task_template: "taskTemplates" };
    return selected.map((source) => {
      const item = (library[keyByKind[source.kind]] || []).find((entry) => String(entry.id) === source.id);
      return item ? { kind: source.kind, id: source.id, value: item } : null;
    }).filter(Boolean);
  }
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
