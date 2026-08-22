import { createOpenAiCompatibleClient } from "./openAiCompatibleProvider.js";
import { DEFAULT_AI_BASE_URL, DEFAULT_AI_MODEL } from "./aiProvider.js";

export function createDeepSeekClient(options = {}) {
  return createOpenAiCompatibleClient({
    url: DEFAULT_AI_BASE_URL,
    model: DEFAULT_AI_MODEL,
    ...options,
  });
}

export {
  DeepSeekError,
  DEEPSEEK_ATTEMPT_TIMEOUT_MS,
  DEEPSEEK_RETRIES,
  MIN_DEEPSEEK_ATTEMPT_BUDGET_MS,
} from "./openAiCompatibleProvider.js";
