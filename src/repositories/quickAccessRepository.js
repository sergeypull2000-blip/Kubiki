import { supabase } from "../supabaseClient.js";
import { buildQuickAccessRow, deserializeQuickAccessItemFromServer, normalizeQuickAccessServerRows } from "../quickAccessServer.js";

function data(result, message) { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; }

export function createQuickAccessRepository(client = supabase) {
  return {
    async listQuickAccessItems(userId, performerIds = []) { const result = await client.from("quick_access_items").select("id,user_id,client_id,performer_client_id,pinned,sort_order,item_data,created_at,updated_at").eq("user_id", userId); return normalizeQuickAccessServerRows(data(result, "Не удалось загрузить быстрый доступ"), userId, performerIds); },
    async createQuickAccessItem(userId, item) { const result = await client.from("quick_access_items").insert(buildQuickAccessRow(userId, item)).select().single(); return deserializeQuickAccessItemFromServer(data(result, "Не удалось добавить в быстрый доступ")); },
    async updateQuickAccessItem(userId, item) { const row = buildQuickAccessRow(userId, item); const result = await client.from("quick_access_items").update({ pinned: row.pinned, sort_order: row.sort_order, item_data: row.item_data }).eq("user_id", userId).eq("client_id", row.client_id).select().single(); return deserializeQuickAccessItemFromServer(data(result, "Не удалось обновить быстрый доступ")); },
    async upsertQuickAccessItem(userId, item) { const result = await client.from("quick_access_items").upsert(buildQuickAccessRow(userId, item), { onConflict: "user_id,performer_client_id" }).select().single(); return deserializeQuickAccessItemFromServer(data(result, "Не удалось сохранить быстрый доступ")); },
    async upsertQuickAccessItems(userId, items) { const rows = (items || []).map((item) => buildQuickAccessRow(userId, item)); if (!rows.length) return { items: [] }; const result = await client.from("quick_access_items").upsert(rows, { onConflict: "user_id,performer_client_id" }).select(); return normalizeQuickAccessServerRows(data(result, "Не удалось сохранить быстрый доступ"), userId, rows.map((row) => row.performer_client_id)); },
    async deleteQuickAccessItem(userId, itemId) { const result = await client.from("quick_access_items").delete().eq("user_id", userId).eq("client_id", String(itemId)).select("client_id"); const deleted = data(result, "Не удалось удалить из быстрого доступа"); if (!deleted?.length) throw new Error("Элемент быстрого доступа не найден"); return true; },
    async deleteQuickAccessItemByPerformerId(userId, performerId) { const result = await client.from("quick_access_items").delete().eq("user_id", userId).eq("performer_client_id", String(performerId)).select("client_id"); data(result, "Не удалось удалить связь быстрого доступа"); return true; },
  };
}

export const quickAccessRepository = createQuickAccessRepository();
