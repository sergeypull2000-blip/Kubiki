import { buildPerformerRow, deserializePerformerFromServer, normalizePerformerRows } from "../performerServer.js";

function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }

export function createPerformerRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async listPerformers(userId) { const result = await client.from("performers").select("id,user_id,client_id,performer_data,created_at,updated_at").eq("user_id", userId); return normalizePerformerRows(data(result, "Не удалось загрузить базу исполнителей"), userId); },
    async createPerformer(userId, performer) { const result = await client.from("performers").insert(buildPerformerRow(userId, performer)).select().single(); return deserializePerformerFromServer(data(result, "Не удалось создать исполнителя")); },
    async updatePerformer(userId, performer) { const row = buildPerformerRow(userId, performer); const result = await client.from("performers").update({ performer_data: row.performer_data }).eq("user_id", userId).eq("client_id", row.client_id).select().single(); return deserializePerformerFromServer(data(result, "Не удалось обновить исполнителя")); },
    async upsertPerformer(userId, performer) { const result = await client.from("performers").upsert(buildPerformerRow(userId, performer), { onConflict: "user_id,client_id" }).select().single(); return deserializePerformerFromServer(data(result, "Не удалось сохранить исполнителя")); },
    async upsertPerformers(userId, performers) { const rows = (performers || []).map((item) => buildPerformerRow(userId, item)); if (!rows.length) return []; const result = await client.from("performers").upsert(rows, { onConflict: "user_id,client_id" }).select(); return normalizePerformerRows(data(result, "Не удалось сохранить исполнителей"), userId); },
    async deletePerformer(userId, performerId) { const result = await client.from("performers").delete().eq("user_id", userId).eq("client_id", String(performerId)).select("client_id"); const deleted = data(result, "Не удалось удалить исполнителя"); if (!deleted?.length) throw new Error("Исполнитель не найден или недоступен"); return true; },
  };
}
