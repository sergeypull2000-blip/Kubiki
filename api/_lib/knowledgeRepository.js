import { deserializeProjectFromServer } from "../../src/projectServer.js";

function resultData(result, operation) {
  if (result.error) throw new Error(operation, { cause: result.error });
  return result.data;
}

export async function loadOwnKnowledge(client, userId, { includeHistory = false } = {}) {
  if (!client || !userId) throw new Error("Authenticated knowledge request is required");
  const requests = [
    client.from("performers").select("user_id,client_id,performer_data").eq("user_id", userId),
    client.from("template_libraries").select("user_id,library_data").eq("user_id", userId).maybeSingle(),
  ];
  if (includeHistory) requests.push(client.from("projects").select("user_id,client_id,project_data").eq("user_id", userId).limit(50));
  const [performerResult, templateResult, projectResult] = await Promise.all(requests);
  const performerRows = resultData(performerResult, "Не удалось загрузить базу исполнителей");
  const templateRow = resultData(templateResult, "Не удалось загрузить библиотеку шаблонов");
  const projectRows = includeHistory ? resultData(projectResult, "Не удалось загрузить историю проектов") : [];
  const historicalProjects = (Array.isArray(projectRows) ? projectRows : []).filter((row) => row?.user_id === userId).map((row) => deserializeProjectFromServer(row)).sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0) || String(a.id).localeCompare(String(b.id))).slice(0, 12);
  return {
    performers: (Array.isArray(performerRows) ? performerRows : []).filter((row) => row?.user_id === userId).map((row) => ({ ...row.performer_data, id: String(row.client_id || row.performer_data?.id || "") })),
    templateLibrary: templateRow?.user_id === userId ? templateRow.library_data : {},
    historicalProjects,
  };
}
