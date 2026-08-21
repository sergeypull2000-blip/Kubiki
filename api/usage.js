import { authenticateRequest } from "./_lib/auth.js";
import { isPricingConfigured } from "./_lib/aiPricing.js";
import { monthStartUtc, loadEffectiveLimit } from "./_lib/aiUsage.js";

/* Начало следующего месяца в UTC — дата сброса месячного лимита. */
function nextMonthStartUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/* ============================================================
   Vercel serverless: GET /api/usage
   Сводка по использованию ИИ за текущий месяц для текущего пользователя.
   Отдельно от product analytics — это только биллинг-метрика.
   ============================================================ */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const auth = await authenticateRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const limit = await loadEffectiveLimit(auth.client, auth.user.id);

  let spentUsd;
  if (typeof auth.client.loadMonthlySpent === "function") {
    spentUsd = await auth.client.loadMonthlySpent(auth.user.id, monthStartUtc());
  } else {
  const result = await auth.client.from("ai_usage_events")
    .select("cost_usd")
    .eq("user_id", auth.user.id)
    .gte("created_at", monthStartUtc());
  if (result.error) return res.status(500).json({ error: "Не удалось загрузить использование ИИ" });

  const rows = result.data || [];
  spentUsd = rows.reduce((sum, row) => sum + (Number(row.cost_usd) || 0), 0);
  }

  if (limit.unlimited) {
    return res.status(200).json({
      unlimited: true,
      limitUsd: null,
      spentUsd,
      remainingPct: 100,
      resetsAt: nextMonthStartUtc(),
      overLimit: false,
      pricingConfigured: isPricingConfigured(),
    });
  }

  const limitUsd = limit.limitUsd;
  return res.status(200).json({
    unlimited: false,
    limitUsd,
    spentUsd,
    remainingPct: Math.max(0, Math.min(100, Math.round((1 - spentUsd / limitUsd) * 100))),
    resetsAt: nextMonthStartUtc(),
    overLimit: spentUsd >= limitUsd,
    pricingConfigured: isPricingConfigured(),
  });
}
