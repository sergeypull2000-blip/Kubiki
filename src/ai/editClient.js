import { parseAiEditResponse } from "./editSchema.js";
import { sheetsOf } from "../sheets.js";
import { aiEditErrorMessage, requestErrorMessage } from "./requestErrors.js";

export const AI_EDIT_REQUEST_TIMEOUT_MS = 270_000;

const freshId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createAiEditIdPool(project, sizes = { stages: 6, tasks: 30, executors: 40, tags: 200 }) {
  const existing = new Set([project?.id]);
  const collect = (stages) => { for (const stage of stages) { existing.add(stage.id); for (const task of stage.tasks || []) { existing.add(task.id); for (const executor of task.executors || []) { existing.add(executor.id); for (const tag of executor.tags || []) existing.add(tag.id); } } } };
  const sheets = sheetsOf(project);
  if (sheets.length) sheets.forEach((sheet) => collect(sheet.stages || []));
  else collect(project?.stages || []);
  const make = (count) => { const result = []; while (result.length < count) { const value = freshId(); if (!existing.has(value)) { existing.add(value); result.push(value); } } return result; };
  return { stages: make(sizes.stages), tasks: make(sizes.tasks), executors: make(sizes.executors), tags: make(sizes.tags) };
}

export function createAiEditRequest({ projectId, baseRevision, scope, instruction, knowledge = { useStudioKnowledge: false, selectedSources: [] }, confirmed = {}, idPool, continuation }) {
  return { schemaVersion: 1, requestId: freshId(), projectId, baseRevision, scope, instruction, knowledge, confirmed, idPool, ...(continuation ? { continuation } : {}) };
}

export async function requestAiEdit(payload, { fetchImpl = fetch, getAccessToken, signal } = {}) {
  const resolveToken = getAccessToken || (async () => {
    const { supabase } = await import("../supabaseClient.js");
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) throw new Error("Сессия недействительна. Войдите снова.");
    return data.session.access_token;
  });
  const token = await resolveToken(), timeoutController = new AbortController();
  const abort = () => timeoutController.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), AI_EDIT_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl("/api/edit-estimate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: timeoutController.signal });
    if (!response.ok) { const error = await response.json().catch(() => ({})); const code = error.code || (response.status === 409 ? "stale_revision" : "request_failed"); const result = new Error(aiEditErrorMessage(code, error.error, requestErrorMessage(response.status))); result.code = code; if (typeof error.requestId === "string") result.requestId = error.requestId; throw result; }
    const value = await response.json().catch(() => null), parsed = parseAiEditResponse(value, payload);
    if (!parsed) throw new Error("Сервер вернул некорректный AI-diff.");
    return parsed;
  } catch (error) {
    if (error?.name === "AbortError") { const result = new Error(signal?.aborted ? "AI-запрос отменён" : requestErrorMessage(504)); result.code = signal?.aborted ? "cancelled" : "timeout"; throw result; }
    if (error instanceof TypeError) throw new Error("Нет связи с сервером. Проверьте подключение и попробуйте снова.");
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
