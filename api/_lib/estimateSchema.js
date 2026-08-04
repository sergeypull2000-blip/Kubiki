export function parseEstimate(raw) {
  if (!raw) return null;
  let parsed;
  try { parsed = JSON.parse(String(raw).trim()); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (typeof parsed.projectName !== "string" || !parsed.projectName.trim()) return null;
  if (!Array.isArray(parsed.stages) || parsed.stages.length === 0 || parsed.stages.length > 30) return null;
  if (!Array.isArray(parsed.warnings) || parsed.warnings.length > 30 || !parsed.warnings.every((item) => typeof item === "string" && item.length <= 500)) return null;
  let taskCount = 0;
  const validStages = parsed.stages.every((stage) => {
    if (!stage || typeof stage.name !== "string" || !stage.name.trim() || stage.name.length > 160 || !Array.isArray(stage.tasks) || !stage.tasks.length) return false;
    taskCount += stage.tasks.length;
    return stage.tasks.every((task) => task && typeof task.name === "string" && task.name.trim() && task.name.length <= 160 && Number.isInteger(task.cost) && task.cost >= 0 && task.cost <= 1_000_000_000);
  });
  return validStages && taskCount <= 200 ? parsed : null;
}

export const ESTIMATE_REPAIR_PROMPT = "Исправь предыдущий ответ. Верни только один валидный JSON-объект строго по заданной схеме. Не добавляй markdown, пояснения или текст вне JSON. Проверь, что строки завершены, stages и tasks — непустые массивы, cost — целое неотрицательное число.";

