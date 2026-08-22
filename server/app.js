import { createServer } from "node:http";
import generateEstimate from "../api/generate-estimate.js";
import editEstimate from "../api/edit-estimate.js";
import parseExcel from "../api/parse-excel.js";
import extractDoc from "../api/extract-doc.js";
import usage from "../api/usage.js";
import { matchOwnerApiRoute, handleOwnerApiRoute } from "./ownerApiRoutes.js";
import { MAX_LOGO_REQUEST_BYTES, handleLogoRoute, matchLogoRoute } from "./logoRoutes.js";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body));
}

const API_HANDLERS = new Map([
  ["/api/generate-estimate", generateEstimate],
  ["/api/edit-estimate", editEstimate],
  ["/api/parse-excel", parseExcel],
  ["/api/extract-doc", extractDoc],
  ["/api/usage", usage],
]);

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

export function createBackendServer({ pool, bodyLimitBytes, readinessTimeoutMillis, authHandler, authenticate, serverData, ownerApi, objectStorage, logger = console }) {
  return createServer((request, response) => {
    const contentLength = Number(request.headers["content-length"] || 0);
    const pathname = new URL(request.url, "http://localhost").pathname;
    const logoRoute = matchLogoRoute(request.method, pathname);
    const requestLimit = logoRoute === "POST" ? MAX_LOGO_REQUEST_BYTES : bodyLimitBytes;
    if (Number.isFinite(contentLength) && contentLength > requestLimit) {
      sendJson(response, 413, { error: "request_too_large" });
      request.resume();
      return;
    }

    if (request.method === "GET" && request.url === "/healthz") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && request.url === "/readyz") {
      void isDatabaseReady(pool, readinessTimeoutMillis).then((ready) => {
        sendJson(response, ready ? 200 : 503, {
          status: ready ? "ready" : "unavailable",
        });
      });
      return;
    }

    const path = pathname;
    if (path.startsWith("/api/auth/") && authHandler) {
      void authHandler(request, response).catch((error) => {
        logger.error("Better Auth HTTP request failed", { name: error?.name || "Error" });
        if (!response.headersSent) sendJson(response, 500, { error: "internal_error" });
        else if (!response.writableEnded) response.destroy(error);
      });
      return;
    }

    if (logoRoute && authenticate && ownerApi && objectStorage) {
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
      void (async () => {
        const authContext = await authenticate(request);
        if (!authContext) return sendJson(response, 401, { error: "authentication_required" });
        request.body = ["POST", "PUT", "PATCH"].includes(request.method) ? await readJson(request, bodyLimitBytes) : undefined;
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
        const authContext = await authenticate(request);
        if (!authContext) return sendJson(response, 401, { error: "authentication_required" });
        request.authContext = authContext;
        request.serverData = serverData;
        request.body = await readJson(request, bodyLimitBytes);
        await handler(request, vercelResponse(response));
      })().catch((error) => {
        logger.error("API request failed", { name: error?.name || "Error" });
        if (!response.headersSent) sendJson(response, error?.status || 500, { error: error?.message === "invalid_json" ? "invalid_json" : "internal_error" });
        else response.end();
      });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });
}
