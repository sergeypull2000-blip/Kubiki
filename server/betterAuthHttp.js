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

export function createBetterAuthHttpHandler(handler, {
  recordSignUpAcceptances,
  rollbackSignUp,
  sendSignUpVerificationEmail,
} = {}) {
  if (typeof handler !== "function") throw new TypeError("Better Auth handler must be a function");
  return async (request, response) => {
    const webRequest = toWebRequest(request);
    const isSignUp = new URL(webRequest.url).pathname === SIGN_UP_PATH && webRequest.method === "POST";
    let signUpBody;
    if (isSignUp) {
      signUpBody = await webRequest.clone().json().catch(() => null);
      if (signUpBody?.acceptedBetaTerms !== true || signUpBody?.acceptedPersonalDataConsent !== true) {
        return writeWebResponse(response, Response.json({ code: "LEGAL_ACCEPTANCE_REQUIRED" }, { status: 400 }));
      }
    }
    let webResponse = await handler(webRequest);
    if (!(webResponse instanceof Response)) {
      throw new TypeError("Better Auth handler must return a Response");
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
          throw new Error("Signup could not be completed", { cause: error });
        }
        if (created && sendSignUpVerificationEmail) {
          try {
            await sendSignUpVerificationEmail({
              email: result.user.email,
              callbackURL: signUpBody?.callbackURL,
              headers: webRequest.headers,
            });
          } catch {
            const headers = new Headers(webResponse.headers);
            headers.delete("content-length");
            webResponse = Response.json({
              ...result,
              verificationEmailSent: false,
              verificationEmailResendAvailable: true,
            }, { status: webResponse.status, headers });
          }
        }
      }
    }
    await writeWebResponse(response, webResponse);
  };
}
