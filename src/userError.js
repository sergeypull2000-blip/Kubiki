const TECHNICAL = /(?:postgres|sqlstate|stack trace|syntax error|constraint|duplicate key|relation .* does not exist|provider|request[_ -]?id|\b[245]\d\d\b|<!doctype|\{\s*"(?:error|code)"|ECONN|fetch failed)/i;

export function userErrorMessage(error, fallback) {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  if (!message || TECHNICAL.test(message) || message.length > 240) return fallback;
  return message;
}
