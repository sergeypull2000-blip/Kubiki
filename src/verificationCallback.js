const VERIFICATION_ERRORS = new Set(["token_expired", "invalid_token"]);

export const EXPIRED_VERIFICATION_MESSAGE =
  "Ссылка для подтверждения устарела. Запросите новое письмо и используйте ссылку из него.";

export function readVerificationCallbackError(search = "") {
  const error = new URLSearchParams(search).get("error")?.toLowerCase();
  return VERIFICATION_ERRORS.has(error) ? error : null;
}

export function consumeVerificationCallbackError({ location = globalThis.location, history = globalThis.history } = {}) {
  const error = readVerificationCallbackError(location?.search || "");
  if (!error) return null;

  const url = new URL(location.href);
  url.searchParams.delete("error");
  history?.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  return error;
}
