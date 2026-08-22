import { createOpenAiCompatibleClient, requestOpenAiCompatibleCompletion } from "./openAiCompatibleProvider.js";

export const DEFAULT_AI_PROVIDER = "deepseek";
export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com/chat/completions";
export const DEFAULT_AI_MODEL = "deepseek-v4-flash";

export function resolveAiProviderConfig(env = process.env) {
  return {
    provider: env.AI_PROVIDER || DEFAULT_AI_PROVIDER,
    baseUrl: env.AI_BASE_URL || DEFAULT_AI_BASE_URL,
    model: env.AI_MODEL || DEFAULT_AI_MODEL,
    apiKey: env.AI_API_KEY || env.DEEPSEEK_API_KEY || "",
  };
}

export function createAiProvider({ env = process.env, fetchImpl = fetch, ...options } = {}) {
  const config = resolveAiProviderConfig(env);
  const assertConfigured = () => {
    if (!config.apiKey) throw new Error("AI_API_KEY или DEEPSEEK_API_KEY не задан в переменных окружения");
  };
  return {
    ...config,
    createModelClient(clientOptions = {}) {
      assertConfigured();
      return createOpenAiCompatibleClient({ ...options, ...clientOptions, fetchImpl, apiKey: config.apiKey, url: config.baseUrl, model: config.model });
    },
    requestCompletion(request) {
      assertConfigured();
      return requestOpenAiCompatibleCompletion({ ...request, fetchImpl, apiKey: config.apiKey, url: config.baseUrl, model: config.model });
    },
  };
}
