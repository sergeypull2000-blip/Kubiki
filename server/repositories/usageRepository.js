import { randomUUID } from "node:crypto";
import { DEFAULT_MONTHLY_LIMIT_USD } from "../../api/_lib/aiPricing.js";

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const value = await operation(client);
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createUsageRepository(pool, { reservationTtlSeconds = 180 } = {}) {
  return {
    async loadEffectiveLimit(userId) {
      const { rows } = await pool.query(`select monthly_limit_usd, unlimited from public.ai_usage_limits where user_id = $1`, [userId]);
      const row = rows[0];
      if (!row) return { limitUsd: DEFAULT_MONTHLY_LIMIT_USD, unlimited: false };
      const unlimited = Boolean(row.unlimited);
      const value = Number(row.monthly_limit_usd);
      return { limitUsd: unlimited ? null : (Number.isFinite(value) && value >= 0 ? value : DEFAULT_MONTHLY_LIMIT_USD), unlimited };
    },
    async loadMonthlySpent(userId, monthStart) {
      const { rows } = await pool.query(`select coalesce(sum(cost_usd), 0)::text as spent_usd from public.ai_usage_events where user_id = $1 and created_at >= $2`, [userId, monthStart]);
      return Number(rows[0]?.spent_usd) || 0;
    },
    async reserve(userId, monthStart) {
      return transaction(pool, async (client) => {
        await client.query(`delete from public.ai_usage_reservations where user_id = $1 and month_start = $2::date and expires_at <= now()`, [userId, monthStart]);
        const limitResult = await client.query(`select monthly_limit_usd, unlimited from public.ai_usage_limits where user_id = $1 for update`, [userId]);
        const limitRow = limitResult.rows[0];
        const unlimited = Boolean(limitRow?.unlimited);
        const rawLimit = Number(limitRow?.monthly_limit_usd);
        const limitUsd = unlimited ? null : (Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : DEFAULT_MONTHLY_LIMIT_USD);
        const spentResult = await client.query(`select coalesce(sum(cost_usd), 0)::text as spent_usd from public.ai_usage_events where user_id = $1 and created_at >= $2`, [userId, monthStart]);
        const spentUsd = Number(spentResult.rows[0]?.spent_usd) || 0;
        if (unlimited) return { acquired: true, reservationId: null, spentUsd, limitUsd: null, unlimited: true };
        if (spentUsd >= limitUsd) return { acquired: false, reason: "limit", spentUsd, limitUsd, unlimited: false };
        const reservationId = randomUUID();
        const inserted = await client.query(
          `insert into public.ai_usage_reservations (user_id, month_start, reservation_id, expires_at)
           values ($1, $2::date, $3, now() + ($4 * interval '1 second'))
           on conflict (user_id, month_start) do nothing returning reservation_id`,
          [userId, monthStart, reservationId, reservationTtlSeconds],
        );
        return inserted.rowCount
          ? { acquired: true, reservationId, spentUsd, limitUsd, unlimited: false }
          : { acquired: false, reason: "concurrent", spentUsd, limitUsd, unlimited: false };
      });
    },
    async record(userId, reservationId, event) {
      return transaction(pool, async (client) => {
        if (reservationId) {
          const owned = await client.query(`delete from public.ai_usage_reservations where user_id = $1 and reservation_id = $2 returning reservation_id`, [userId, reservationId]);
          if (!owned.rowCount) return false;
        }
        await client.query(
          `insert into public.ai_usage_events
           (user_id, model, stage, request_id, input_tokens, output_tokens, cost_usd, pricing_version, pricing_status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [userId, event.model, event.stage, event.requestId, event.inputTokens, event.outputTokens, event.costUsd, event.pricingVersion, event.pricingStatus],
        );
        return true;
      });
    },
    async release(userId, reservationId) {
      if (!reservationId) return;
      await pool.query(`delete from public.ai_usage_reservations where user_id = $1 and reservation_id = $2`, [userId, reservationId]);
    },
  };
}
