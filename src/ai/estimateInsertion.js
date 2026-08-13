import { uid } from "../utils.js";
import { buildExecutorFromPerformer } from "../performerLibrary.js";

const normalized = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const payment = (type) => ({ id: uid(), key: "payment", payment: { type, rate: "", units: "", hours: "", shifts: "" } });

function materializeDraft(draft, performers) {
  if (draft.type === "performer_binding") {
    const query = normalized(draft.performerName), matches = performers.filter((item) => {
      const full = normalized([item.firstName, item.lastName].filter(Boolean).join(" "));
      return query === normalized(item.firstName) || query === full || full.startsWith(`${query} `);
    });
    if (matches.length !== 1) throw new Error(matches.length ? `Нужно уточнить Performer «${draft.performerName}»` : `Performer «${draft.performerName}» не найден`);
    const executor = buildExecutorFromPerformer(matches[0]); executor.id = uid(); executor.tags = executor.tags.map((tag) => ({ ...tag, id: uid() })); return executor;
  }
  const type = draft.paymentType || (draft.compensation !== undefined ? "fix_total" : null), tags = [];
  if (draft.role) tags.push({ id: uid(), key: "role", value: draft.role });
  if (draft.name) tags.push({ id: uid(), key: "name", value: draft.name });
  if (draft.tax !== undefined) tags.push({ id: uid(), key: "tax", value: String(Number(draft.tax)) });
  if (type) {
    const tag = payment(type);
    if (draft.compensation !== undefined && type !== "fix_total") tag.payment.rate = String(Math.round(Number(draft.compensation)));
    if (draft.quantity !== undefined) tag.payment[{ fix_task: "units", hourly: "hours", shift: "shifts" }[type]] = String(draft.quantity);
    tags.push(tag);
  }
  return { id: uid(), amount: type === "fix_total" && draft.compensation !== undefined ? String(Math.round(Number(draft.compensation))) : "", tags };
}

export function stagesFromGeneratedEstimate(parsed, performers = []) {
  return parsed.stages.map((stage) => ({
    id: uid(), presetKey: "custom", collapsed: false, name: stage.name || "Смета",
    tasks: stage.tasks.map((task) => ({ id: uid(), name: task.name || "", markupOverride: null, executors: (task.executors || [{ type: "anonymous_unnamed", paymentType: "fix_total", compensation: task.cost }]).map((draft) => materializeDraft(draft, performers)) })),
  }));
}
