import { createServer } from "node:http";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(body));
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

export function createBackendServer({ pool, bodyLimitBytes, readinessTimeoutMillis }) {
  return createServer((request, response) => {
    const contentLength = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > bodyLimitBytes) {
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

    sendJson(response, 404, { error: "not_found" });
  });
}
