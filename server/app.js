import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import generateEstimate from "../api/generate-estimate.js";
import editEstimate from "../api/edit-estimate.js";
import parseExcel from "../api/parse-excel.js";
import extractDoc from "../api/extract-doc.js";
import usage from "../api/usage.js";
import { matchOwnerApiRoute, handleOwnerApiRoute } from "./ownerApiRoutes.js";
import { MAX_LOGO_REQUEST_BYTES, handleLogoRoute, matchLogoRoute } from "./logoRoutes.js";
import { serveFrontend } from "./frontend.js";
import { LEGAL_DOCUMENT_VERSIONS } from "../src/legalConfig.js";
import { inspectAuthRateLimitRequest } from "./requestSecurity.js";

const DEFAULT_FRONTEND_DIST_PATH = fileURLToPath(new URL("../dist", import.meta.url));

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
};

export const INLINE_BOOTSTRAP_SCRIPT_CSP_HASH = "sha256-+wjbvfAq8SBtnvSoNFUCTT0pLgTnl1A48qWU4HFjIGA=";

function buildContentSecurityPolicyReportOnly(assetOrigin) {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    "form-action 'self'",
    `script-src 'self' '${INLINE_BOOTSTRAP_SCRIPT_CSP_HASH}'`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' ${assetOrigin}`,
    `connect-src 'self' ${assetOrigin}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ") + ";";
}

function createSecurityHeaders({ production, cspAssetOrigin }) {
  if (!cspAssetOrigin) throw new TypeError("cspAssetOrigin is required");
  return {
    ...SECURITY_HEADERS,
    "content-security-policy": buildContentSecurityPolicyReportOnly(cspAssetOrigin),
    ...(production ? { "strict-transport-security": "max-age=31536000" } : {}),
  };
}

function sendJson(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, { ...SECURITY_HEADERS, ...JSON_HEADERS, ...headers });
  response.end(JSON.stringify(body));
}

const API_HANDLERS = new Map([
  ["/api/generate-estimate", generateEstimate],
  ["/api/edit-estimate", editEstimate],
  ["/api/parse-excel", parseExcel],
  ["/api/extract-doc", extractDoc],
  ["/api/usage", usage],
]);
const AI_PATHS = new Set(["/api/generate-estimate", "/api/edit-estimate", "/api/parse-excel"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const JSON_METHODS = new Set(["POST", "PUT", "PATCH"]);

function mediaType(request) {
  return String(request.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
}

function mutationRequestError(request, trustedOrigins, expectedMediaType) {
  const origin = request.headers.origin;
  if (origin) {
    let canonicalOrigin;
    try { canonicalOrigin = new URL(origin).origin; } catch { return { status: 403, error: "origin_not_allowed" }; }
    if (canonicalOrigin !== origin || !trustedOrigins.includes(canonicalOrigin)) {
      return { status: 403, error: "origin_not_allowed" };
    }
  } else if (request.headers["sec-fetch-site"] === "cross-site") {
    return { status: 403, error: "origin_not_allowed" };
  }
  if (expectedMediaType && mediaType(request) !== expectedMediaType) {
    return { status: 415, error: "unsupported_media_type" };
  }
  return null;
}

function rejectUnsafeMutation(request, response, trustedOrigins, expectedMediaType) {
  const error = mutationRequestError(request, trustedOrigins, expectedMediaType);
  if (!error) return false;
  sendJson(response, error.status, { error: error.error });
  request.resume();
  return true;
}

async function readJson(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("request_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid_json"), { status: 400 }); }
}

function vercelResponse(response) {
  let statusCode = 200;
  return {
    setHeader: (...args) => response.setHeader(...args),
    status(code) { statusCode = code; return this; },
    json(body) { sendJson(response, statusCode, body); return this; },
    end() { response.writeHead(statusCode); response.end(); return this; },
  };
}

async function isDatabaseReady(pool, timeoutMillis) {
  let timer;
  try {
    await Promise.race([
      pool.query("select 1 as ready"),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("readiness timeout")), timeoutMillis);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createBackendServer({ pool, bodyLimitBytes, readinessTimeoutMillis, production = false, cspAssetOrigin, trustedOrigins = [], authHandler, authenticate, serverData, ownerApi, objectStorage, requestSecurity, frontendDistPath = DEFAULT_FRONTEND_DIST_PATH, logger = console }) {
  const securityHeaders = createSecurityHeaders({ production, cspAssetOrigin });
  return createServer((request, response) => {
    for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
    const contentLength = Number(request.headers["content-length"] || 0);
    const rawPathname = request.url.split("?", 1)[0];
    const pathname = new URL(request.url, "http://localhost").pathname;
    const logoRoute = matchLogoRoute(request.method, pathname);
    const requestLimit = logoRoute === "POST" ? MAX_LOGO_REQUEST_BYTES : bodyLimitBytes;
    if (Number.isFinite(contentLength) && contentLength > requestLimit) {
      sendJson(response, 413, { error: "request_too_large" });
      request.resume();
      return;
    }

    if (request.method === "GET" && pathname === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && pathname === "/readyz") {
      void isDatabaseReady(pool, readinessTimeoutMillis).then((ready) => {
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ready" : "unavailable",
        });
      });
      return;
    }

    const path = pathname;
    if (path.startsWith("/api/auth/") && authHandler) {
      const authInspection = inspectAuthRateLimitRequest(request, path, trustedOrigins);
      if (authInspection.rejection) {
        sendJson(response, authInspection.rejection.status, { error: authInspection.rejection.error });
        request.resume();
        return;
      }
      if (requestSecurity && authInspection.shouldCount) {
        const decision = requestSecurity.consumeAuth(request, path);
        if (!decision.allowed) {
          sendJson(response, 429, { error: "too_many_requests" }, {
            "retry-after": String(decision.retryAfterSeconds),
          });
          request.resume();
          return;
        }
      }
      void authHandler(request, response).catch((error) => {
        const requestId = request.headers["x-request-id"] || crypto.randomUUID();
        logger.error("Better Auth HTTP request failed", { requestId, name: error?.name || "Error", cause: error?.cause?.message || error?.message || "unknown" });
        if (!response.headersSent) sendJson(response, 500, { error: "internal_error", requestId });
        else if (!response.writableEnded) response.destroy(error);
      });
      return;
    }

    if (logoRoute && authenticate && ownerApi && objectStorage) {
      const expectedMediaType = logoRoute === "POST" ? "multipart/form-data" : undefined;
      if (["POST", "DELETE"].includes(logoRoute) && rejectUnsafeMutation(request, response, trustedOrigins, expectedMediaType)) return;
      void (async () => {
        const authContext = await authenticate(request);
        if (!authContext) return sendJson(response, 401, { error: "authentication_required" });
        const result = await handleLogoRoute(logoRoute, request, ownerApi, objectStorage, authContext.user.id, logger);
        sendJson(response, result.status, result.body);
      })().catch((error) => {
        logger.error("Logo API request failed", { name: error?.name || "Error" });
        if (!response.headersSent) sendJson(response, error?.status || 500, { error: error?.code || "internal_error" });
      });
      return;
    }

    const ownerRoute = matchOwnerApiRoute(request.method, path);
    if (ownerRoute && authenticate && ownerApi) {
      const expectsJson = JSON_METHODS.has(request.method) || ownerRoute.name === "DELETE /api/legal-acceptances";
      if (MUTATING_METHODS.has(request.method)
        && rejectUnsafeMutation(request, response, trustedOrigins, expectsJson ? "application/json" : undefined)) return;
      void (async () => {
        const authContext = await authenticate(request);
        if (!authContext) return sendJson(response, 401, { error: "authentication_required" });
        request.body = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) ? await readJson(request, bodyLimitBytes) : undefined;
        const result = await handleOwnerApiRoute(ownerRoute, request, ownerApi, authContext.user.id);
        sendJson(response, result.status, result.body);
      })().catch((error) => {
        logger.error("Owner API request failed", { name: error?.name || "Error" });
        const conflict = error?.code === "23505";
        const status = error?.status || (conflict ? 409 : 500);
        const code = error?.code || (error?.message === "invalid_json" ? "invalid_json" : conflict ? "conflict" : "internal_error");
        if (!response.headersSent) sendJson(response, status, { error: code });
      });
      return;
    }

    const handler = API_HANDLERS.get(path);
    if (handler && authenticate && serverData) {
      void (async () => {
        if (request.method === "OPTIONS") {
          await handler(request, vercelResponse(response));
          return;
        }
        if (!["GET", "HEAD"].includes(request.method)
          && rejectUnsafeMutation(request, response, trustedOrigins, "application/json")) return;
        const authContext = await authenticate(request);
        if (!authContext) return sendJson(response, 401, { error: "authentication_required" });
        if (requestSecurity && !requestSecurity.allowApi(authContext.user.id, path)) return sendJson(response, 429, { error: "too_many_requests" });
        if (AI_PATHS.has(path) && !await serverData.hasLegalAcceptance(authContext.user.id, "ai_disclosure", LEGAL_DOCUMENT_VERSIONS.ai_disclosure)) {
          return sendJson(response, 428, { error: "ai_disclosure_required", documentKey: "ai_disclosure", version: LEGAL_DOCUMENT_VERSIONS.ai_disclosure });
        }
        const release = requestSecurity ? requestSecurity.acquire(authContext.user.id, path) : (() => {});
        if (!release) return sendJson(response, 429, { error: "request_in_progress" });
        try {
          request.authContext = authContext;
          request.serverData = serverData;
          request.body = await readJson(request, bodyLimitBytes);
          await handler(request, vercelResponse(response));
        } finally {
          release();
        }
      })().catch((error) => {
        logger.error("API request failed", { name: error?.name || "Error" });
        if (!response.headersSent) sendJson(response, error?.status || 500, { error: error?.message === "invalid_json" ? "invalid_json" : "internal_error" });
        else response.end();
      });
      return;
    }

    if (path === "/api" || path.startsWith("/api/")) {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    void serveFrontend(request, response, { distPath: frontendDistPath, rawPathname, pathname }).then((served) => {
      if (!served && !response.writableEnded) sendJson(response, 404, { error: "not_found" });
    }).catch((error) => {
      logger.error("Frontend request failed", { name: error?.name || "Error" });
      if (!response.headersSent) sendJson(response, 500, { error: "internal_error" });
      else if (!response.writableEnded) response.destroy(error);
    });
  });
}
