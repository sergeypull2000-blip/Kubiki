export const GENERATION_FUNCTION_BUDGET_MS = 260_000;

export class RequestDeadlineError extends Error {
  constructor() {
    super("Generation request deadline exceeded");
    this.name = "RequestDeadlineError";
    this.code = "request_deadline";
    this.status = 504;
  }
}

export function createRequestBudget({ timeoutMs = GENERATION_FUNCTION_BUDGET_MS, now = Date.now } = {}) {
  const deadlineAt = now() + timeoutMs;
  return {
    remainingMs() { return Math.max(0, deadlineAt - now()); },
    async run(promise) {
      const remaining = this.remainingMs();
      if (remaining <= 0) throw new RequestDeadlineError();
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new RequestDeadlineError()), remaining); }),
        ]);
      } finally { clearTimeout(timer); }
    },
  };
}
