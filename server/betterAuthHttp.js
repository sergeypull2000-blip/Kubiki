import { Readable } from "node:stream";

function firstForwardedValue(value) {
  return Array.isArray(value) ? value[0] : value?.split(",", 1)[0]?.trim();
}

function requestOrigin(request) {
  const protocol = firstForwardedValue(request.headers["x-forwarded-proto"])
    || (request.socket.encrypted ? "https" : "http");
  const host = firstForwardedValue(request.headers["x-forwarded-host"])
    || request.headers.host;
  if (!host) throw new Error("Better Auth HTTP request is missing the Host header");
  return `${protocol}://${host}`;
}

function requestHeaders(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

function toWebRequest(request) {
  const method = request.method || "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(new URL(request.url || "/", requestOrigin(request)), {
    method,
    headers: requestHeaders(request),
    body: hasBody ? Readable.toWeb(request) : undefined,
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
  });
}

function setResponseHeaders(response, webResponse) {
  const setCookies = webResponse.headers.getSetCookie();
  for (const [name, value] of webResponse.headers) {
    if (name !== "set-cookie") response.setHeader(name, value);
  }
  if (setCookies.length) response.setHeader("set-cookie", setCookies);
}

async function writeWebResponse(response, webResponse) {
  response.statusCode = webResponse.status;
  if (webResponse.statusText) response.statusMessage = webResponse.statusText;
  setResponseHeaders(response, webResponse);

  if (!webResponse.body) {
    response.end();
    return;
  }
  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(webResponse.body);
    body.once("error", reject);
    response.once("error", reject);
    response.once("finish", resolve);
    body.pipe(response);
  });
}

const SIGN_UP_PATH = "/api/auth/sign-up/email";
const SEND_VERIFICATION_EMAIL_PATH = "/api/auth/send-verification-email";
const REQUEST_PASSWORD_RESET_PATH = "/api/auth/request-password-reset";
const PUBLIC_EMAIL_RESPONSE_MINIMUM_MS = 500;
const GENERIC_SIGN_UP_RESPONSE = Object.freeze({
  status: true,
  verificationEmailResendAvailable: true,
});
const GENERIC_EMAIL_RESPONSE = Object.freeze({ status: true });
const GENERIC_PASSWORD_RESET_RESPONSE = Object.freeze({
  status: true,
  message: "If this email exists in our system, check your email for the reset link",
});
const DUPLICATE_SIGN_UP_CODES = new Set([
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);

function normalizedJsonResponse(webResponse, body) {
  const headers = new Headers(webResponse?.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  return Response.json(body, { status: 200, headers });
}

async function enforceMinimumResponseTime(startedAt) {
  const remaining = PUBLIC_EMAIL_RESPONSE_MINIMUM_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

export function createBetterAuthHttpHandler(handler, {
  recordSignUpAcceptances,
  rollbackSignUp,
  sendSignUpVerificationEmail,
  logger = console,
} = {}) {
  if (typeof handler !== "function") throw new TypeError("Better Auth handler must be a function");
  return async (request, response) => {
    const webRequest = toWebRequest(request);
    const pathname = new URL(webRequest.url).pathname;
    const isPost = webRequest.method === "POST";
    const isSignUp = pathname === SIGN_UP_PATH && isPost;
    const isSendVerificationEmail = pathname === SEND_VERIFICATION_EMAIL_PATH && isPost;
    const isRequestPasswordReset = pathname === REQUEST_PASSWORD_RESET_PATH && isPost;
    const publicEmailResponseStartedAt = Date.now();
    let signUpBody;
    if (isSignUp) {
      signUpBody = await webRequest.clone().json().catch(() => null);
      if (signUpBody?.acceptedBetaTerms !== true || signUpBody?.acceptedPersonalDataConsent !== true) {
        return writeWebResponse(response, Response.json({ code: "LEGAL_ACCEPTANCE_REQUIRED" }, { status: 400 }));
      }
    }
    let webResponse;
    try {
      webResponse = await handler(webRequest);
    } catch (error) {
      if (!isSendVerificationEmail && !isRequestPasswordReset) throw error;
      logger.error("Public auth email request failed", { route: pathname });
      webResponse = normalizedJsonResponse(
        undefined,
        isSendVerificationEmail ? GENERIC_EMAIL_RESPONSE : GENERIC_PASSWORD_RESET_RESPONSE,
      );
    }
    if (!(webResponse instanceof Response)) {
      throw new TypeError("Better Auth handler must return a Response");
    }
    if (isSignUp && !webResponse.ok) {
      const duplicate = await webResponse.clone().json().catch(() => null);
      if (DUPLICATE_SIGN_UP_CODES.has(duplicate?.code)) {
        webResponse = normalizedJsonResponse(webResponse, GENERIC_SIGN_UP_RESPONSE);
      }
    }
    if (isSignUp && webResponse.ok && recordSignUpAcceptances) {
      const result = await webResponse.clone().json().catch(() => null);
      if (result?.user?.id) {
        let created;
        try {
          created = await recordSignUpAcceptances(result.user.id);
        } catch (error) {
          if (rollbackSignUp) {
            try {
              await rollbackSignUp(result.user.id);
            } catch (rollbackError) {
              throw new AggregateError([error, rollbackError], "Signup rollback failed");
            }
          }
          const requestId = webRequest.headers.get("x-request-id") || crypto.randomUUID();
          logger.error("Signup legal persistence failed", { requestId, cause: error?.message || "unknown" });
          throw new Error(`Signup could not be completed (requestId: ${requestId})`, { cause: error });
        }
        if (created && sendSignUpVerificationEmail) {
          try {
            await sendSignUpVerificationEmail({
              email: result.user.email,
              callbackURL: signUpBody?.callbackURL,
              headers: webRequest.headers,
            });
          } catch {
            logger.error("Signup verification email request failed", { route: pathname });
          }
        }
      }
    }
    if (isSignUp && webResponse.ok) {
      webResponse = normalizedJsonResponse(webResponse, GENERIC_SIGN_UP_RESPONSE);
    } else if (isSendVerificationEmail && (webResponse.ok || webResponse.status >= 500)) {
      if (!webResponse.ok) logger.error("Public auth email response was suppressed", { route: pathname, status: webResponse.status });
      webResponse = normalizedJsonResponse(webResponse, GENERIC_EMAIL_RESPONSE);
    } else if (isRequestPasswordReset && (webResponse.ok || webResponse.status >= 500)) {
      if (!webResponse.ok) logger.error("Public auth email response was suppressed", { route: pathname, status: webResponse.status });
      webResponse = normalizedJsonResponse(webResponse, GENERIC_PASSWORD_RESET_RESPONSE);
    }
    if (webResponse.ok && (isSignUp || isSendVerificationEmail || isRequestPasswordReset)) {
      await enforceMinimumResponseTime(publicEmailResponseStartedAt);
    }
    await writeWebResponse(response, webResponse);
  };
}
