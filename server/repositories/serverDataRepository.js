import { deserializeProjectFromServer } from "../../src/projectServer.js";

export function createServerDataRepository(pool) {
  const query = (text, values) => pool.query(text, values);
  return {
    async loadAiSettings(userId) {
      const { rows } = await query(`select personalization, use_project_history, use_studio_templates from public.ai_settings where user_id = $1`, [userId]);
      return rows[0] || null;
    },
    async loadKnowledge(userId, { includeHistory = false } = {}) {
      const [performers, templates, projects] = await Promise.all([
        query(`select client_id, performer_data from public.performers where user_id = $1`, [userId]),
        query(`select library_data from public.template_libraries where user_id = $1`, [userId]),
        includeHistory ? query(`select client_id, project_data, created_at from public.projects where user_id = $1 order by created_at desc, client_id limit 50`, [userId]) : { rows: [] },
      ]);
      return {
        performers: performers.rows.map((row) => ({ ...row.performer_data, id: String(row.client_id || row.performer_data?.id || "") })),
        templateLibrary: templates.rows[0]?.library_data || {},
        historicalProjects: projects.rows.map(deserializeProjectFromServer).slice(0, 12),
      };
    },
    async loadProject(userId, projectId) {
      const { rows } = await query(`select id, user_id, client_id, name, data_version, project_data from public.projects where user_id = $1 and client_id = $2`, [userId, projectId]);
      return rows[0] ? deserializeProjectFromServer(rows[0]) : null;
    },
    async listProjectClientIds(userId) {
      const { rows } = await query(`select client_id from public.projects where user_id = $1`, [userId]);
      return rows.map((row) => row.client_id).filter((id) => typeof id === "string" && id.trim());
    },
    async loadPerformers(userId) {
      const { rows } = await query(`select client_id, performer_data from public.performers where user_id = $1`, [userId]);
      return rows.map((row) => ({ ...row.performer_data, id: String(row.client_id || row.performer_data?.id || "") })).filter((item) => item.id && item.active !== false);
    },
    async loadTemplateLibrary(userId) {
      const { rows } = await query(`select library_data from public.template_libraries where user_id = $1`, [userId]);
      return rows[0]?.library_data || null;
    },
  };
}
