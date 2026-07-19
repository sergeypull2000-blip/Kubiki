import { numVal } from "./utils.js";

/* ---------- calculations ----------
   Сумма исполнителя определяется тегом оплаты:
   - фикс (fix_total / fix_task): значение поля executor.amount
   - почасовая: rate × hours
   - посменная: rate × shifts
   Нет тега оплаты → 0. */
export const executorSum = (e) => {
  const payTag = (e.tags || []).find((t) => t.key === "payment");
  let base = 0;
  if (payTag) {
    const p = payTag.payment || {};
    switch (p.type) {
      case "fix_total":
      case "fix_task": base = numVal(e.amount); break;
      case "hourly": base = numVal(p.rate) * numVal(p.hours); break;
      case "shift": base = numVal(p.rate) * numVal(p.shifts); break;
    }
  }
  // п.7: кубик «Налог» у исполнителя — процент прибавляется к сумме оплаты
  // (фрилансер часто работает «сумма + налог»). Входит в себестоимость.
  const taxTag = (e.tags || []).find((t) => t.key === "tax");
  const taxPct = taxTag ? numVal(taxTag.value) : 0;
  return base * (1 + taxPct / 100);
};
/* Быстрый ввод стоимости: если у задачи есть хотя бы один исполнитель — сумма
   считается по исполнителям (как обычно), directCost игнорируется. Нет
   исполнителей — берётся напрямую вписанная в задачу стоимость. */
export const taskSum = (t) => (t.executors && t.executors.length > 0)
  ? t.executors.reduce((a, e) => a + executorSum(e), 0)
  : numVal(t.directCost);
export const stageSum = (s) => (s.tasks || []).reduce((a, t) => a + taskSum(t), 0);
export const projectSum = (p) => (p.stages || []).reduce((a, s) => a + stageSum(s), 0);

/* ---------- цена (себестоимость + маркап) ----------
   Параллельный каскад поверх *Sum. Чистые функции, один источник данных.
   Маркап задачи: markupOverride, если задан, иначе глобальный % проекта. */
export const taskMarkup = (t, globalMarkup) => (t.markupOverride ?? globalMarkup);
// Эффективный маркап задачи с учётом режима: в «Прозрачном» пер-задачные
// override игнорируются в РАСЧЁТЕ (данные в сторе не трогаем) — комиссия
// считается строго от глобального %. В «Классическом» override работает.
export const effTaskMarkup = (t, gm, mode) => (mode === "transparent" ? gm : (t.markupOverride ?? gm));
export const taskPrice = (t, globalMarkup, mode = "embedded") => taskSum(t) * (1 + effTaskMarkup(t, globalMarkup, mode) / 100);
export const stagePrice = (s, globalMarkup, mode = "embedded") => (s.tasks || []).reduce((a, t) => a + taskPrice(t, globalMarkup, mode), 0);
export const projectPrice = (p) => {
  const mode = getMarkupMode(p);
  const gm = p.globalMarkup ?? 0;
  return (p.stages || []).reduce((a, s) => a + stagePrice(s, gm, mode), 0);
};

/* ---------- режимы маркапа (ЗАДАЧА 3) ----------
   embedded    — маркап зашит в цену каждой позиции (клиент не видит прибыль),
                 пер-задачные override учитываются;
   transparent — Cost-Plus: строки = чистая себестоимость, маркап отдельной
                 строкой «Агентская комиссия / Маркап» внизу; считается строго
                 от глобального %, пер-задачные правки игнорируются (п.7).
   Итог клиенту (projectPrice) в обоих режимах = себестоимость + маркап. */
export const getMarkupMode = (p) => (p?.markupMode === "transparent" ? "transparent" : "embedded");
export const externalTaskPrice = (t, gm, mode) => (mode === "transparent" ? taskSum(t) : taskPrice(t, gm, mode));
export const externalStagePrice = (s, gm, mode) =>
  (s.tasks || []).reduce((a, t) => a + externalTaskPrice(t, gm, mode), 0);
export const projectMarkupAmount = (p) => projectPrice(p) - projectSum(p);
export const projectEffectiveMarkupPct = (p) => {
  const cost = projectSum(p);
  return cost <= 0 ? (p.globalMarkup ?? 0) : (projectMarkupAmount(p) / cost) * 100;
};

/* ---------- налог проекта (п.6) ----------
   Считается от общей цены с маркапом (projectPrice) и прибавляется ПОВЕРХ.
   Работает и в прозрачном, и в классическом режиме. Тип (ИП/НДС) —
   информативная метка, ставка задаётся процентом. Все «Итого» учитывают налог. */
export const projectTaxPct = (p) => numVal(p.tax?.percent);
export const projectTaxSystemLabel = (p) => ({ osno: "ОСНО", usn: "УСН", ausn: "АУСН" }[p.tax?.type] || "ОСНО");
export const projectTaxAmount = (p) => projectPrice(p) * projectTaxPct(p) / 100;
export const projectVatPct = (p) => numVal(p.vat?.percent);
export const projectVatBase = (p) => projectPrice(p) + projectTaxAmount(p);
export const projectVatAmount = (p) => projectVatBase(p) * projectVatPct(p) / 100;
export const projectTotalWithTax = (p) => projectPrice(p) + projectTaxAmount(p) + projectVatAmount(p);

export const chargeIsVisible = (charge) => charge?.visible !== false;
export const projectTaskCount = (p) => (p.stages || []).reduce((count, stage) => count + (stage.tasks || []).length, 0);
export const hiddenChargesPerTask = (p) => {
  const count = projectTaskCount(p);
  if (!count) return 0;
  const hiddenTax = chargeIsVisible(p.tax) ? 0 : projectTaxAmount(p);
  return hiddenTax / count;
};
export const externalTaskPriceWithCharges = (p, t) =>
  externalTaskPrice(t, p.globalMarkup ?? 0, getMarkupMode(p)) + hiddenChargesPerTask(p);
export const externalStagePriceWithCharges = (p, s) =>
  (s.tasks || []).reduce((sum, task) => sum + externalTaskPriceWithCharges(p, task), 0);

/* ---------- маржинальность (п.9) ----------
   Маржа ₽ = цена клиенту с маркапом (до налога) − себестоимость.
   Налог не наш доход (транзит) — в маржу не входит.
   Маржинальность % = маржа / цена клиенту × 100. */
export const projectMargin = (p) => projectPrice(p) - projectSum(p);
export const projectMarginPct = (p) => {
  const price = projectPrice(p);
  return price > 0 ? (projectMargin(p) / price) * 100 : 0;
};

/* ---------- аналитика «Котёл» (для внутреннего Excel-аудита) ---------- */
export const projectHours = (p) => {
  let h = 0;
  for (const s of p.stages || []) for (const t of s.tasks || []) for (const e of t.executors || []) {
    const pay = (e.tags || []).find((tg) => tg.key === "payment")?.payment;
    if (pay?.type === "hourly") h += numVal(pay.hours);
  }
  return h;
};
export const projectShifts = (p) => {
  let sh = 0;
  for (const s of p.stages || []) for (const t of s.tasks || []) for (const e of t.executors || []) {
    const pay = (e.tags || []).find((tg) => tg.key === "payment")?.payment;
    if (pay?.type === "shift") sh += numVal(pay.shifts);
  }
  return sh;
};
export const projectAnalytics = (p) => {
  const cost = projectSum(p);
  const clientTotal = projectPrice(p);
  const margin = clientTotal - cost;
  return { cost, clientTotal, margin, marginPct: cost > 0 ? (margin / cost) * 100 : 0, hours: projectHours(p), shifts: projectShifts(p) };
};
export const readExecutor = (e) => {
  const tag = (k) => (e.tags || []).find((t) => t.key === k);
  const pay = tag("payment")?.payment || {};
  const payLabel = { fix_total: "Фикс за всё", fix_task: "Фикс за задачу", hourly: "Почасовая", shift: "Посменная" }[pay.type] || "—";
  return {
    name: tag("name")?.value || "Без имени",
    role: tag("role")?.value || "", grade: tag("grade")?.value || "",
    payType: pay.type || "", payLabel,
    rate: numVal(pay.rate), qty: pay.type === "hourly" ? numVal(pay.hours) : pay.type === "shift" ? numVal(pay.shifts) : 0,
    sum: executorSum(e),
  };
};
