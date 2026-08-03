import { supabase } from "../supabaseClient.js";
import { buildProjectRow, deserializeProjectFromServer, normalizeServerProjects } from "../projectServer.js";

function assertResult(result, operation) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`, { cause: result.error });
  return result.data;
}

export function createProjectRepository(client = supabase) {
  const repository = {
    async listProjects(userId) {
      const result = await client.from("projects").select("id,user_id,client_id,name,data_version,project_data")
        .eq("user_id", userId);
      return normalizeServerProjects(assertResult(result, "Не удалось загрузить проекты"), userId);
    },
    async createProject(userId, project) {
      const result = await client.from("projects").insert(buildProjectRow(userId, project)).select().single();
      return deserializeProjectFromServer(assertResult(result, "Не удалось создать проект"));
    },
    async updateProject(userId, project) {
      const row = buildProjectRow(userId, project);
      const result = await client.from("projects").update(row).eq("user_id", userId).eq("client_id", row.client_id).select().single();
      return deserializeProjectFromServer(assertResult(result, "Не удалось обновить проект"));
    },
    async upsertProject(userId, project) {
      const result = await client.from("projects").upsert(buildProjectRow(userId, project), { onConflict: "user_id,client_id" }).select().single();
      return deserializeProjectFromServer(assertResult(result, "Не удалось сохранить проект"));
    },
    async upsertProjects(userId, projects) {
      const rows = (projects || []).map((project) => buildProjectRow(userId, project));
      if (!rows.length) return [];
      const result = await client.from("projects").upsert(rows, { onConflict: "user_id,client_id" }).select();
      return normalizeServerProjects(assertResult(result, "Не удалось сохранить проекты"), userId);
    },
    async deleteProject(userId, projectId) {
      const result = await client.from("projects").delete().eq("user_id", userId).eq("client_id", String(projectId)).select("client_id");
      const deleted = assertResult(result, "Не удалось удалить проект");
      if (!deleted?.length) throw new Error("Проект не найден или недоступен");
      return true;
    },
  };
  return repository;
}

export const projectRepository = createProjectRepository();
