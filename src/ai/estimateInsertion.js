import { uid, numVal } from "../utils.js";

/* AI returns internal production cost. Insert it into the fixed-price executor
   unchanged; project markup and taxes are applied later by Kubiki's model. */
export function stagesFromGeneratedEstimate(parsed) {
  return parsed.stages.map((stage) => ({
    id: uid(), presetKey: "custom", collapsed: false,
    name: stage.name || "Смета",
    tasks: (stage.tasks || []).map((task) => ({
      id: uid(), name: task.name || "", markupOverride: null,
      executors: [{
        id: uid(),
        amount: String(numVal(task.cost)),
        tags: [{ id: uid(), key: "payment", payment: { type: "fix_total", rate: "", hours: "", shifts: "" } }],
      }],
    })),
  }));
}
