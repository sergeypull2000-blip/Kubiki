import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";

const CONTENT_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

const HASHED_ASSET = /-[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/;

function decodeSafePath(rawPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    return null;
  }
  const segments = pathname.replaceAll("\\", "/").split("/");
  if (pathname.includes("\0") || pathname.includes("\\") || segments.includes("..")) return null;
  return pathname;
}

async function containedFile(root, pathname) {
  const candidate = resolve(root, `.${pathname}`);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(rootPrefix)) return null;
  try {
    const [info, canonical] = await Promise.all([stat(candidate), realpath(candidate)]);
    if (!info.isFile() || (canonical !== root && !canonical.startsWith(rootPrefix))) return null;
    return { path: canonical, size: info.size };
  } catch {
    return null;
  }
}

async function sendFile(response, file, cacheControl) {
  response.writeHead(200, {
    "content-type": CONTENT_TYPES.get(extname(file.path).toLowerCase()) || "application/octet-stream",
    "content-length": file.size,
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
  await pipeline(createReadStream(file.path), response);
}

export async function serveFrontend(request, response, { distPath, rawPathname, pathname }) {
  if (request.method !== "GET") return false;
  const safePathname = decodeSafePath(rawPathname);
  if (safePathname === null) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "invalid_path" }));
    return true;
  }

  let root;
  try {
    root = await realpath(resolve(distPath));
  } catch {
    return false;
  }
  const requestedFile = await containedFile(root, safePathname);
  if (requestedFile) {
    const immutable = pathname.startsWith("/assets/") && HASHED_ASSET.test(pathname);
    await sendFile(response, requestedFile, immutable ? "public, max-age=31536000, immutable" : "no-cache");
    return true;
  }

  if (pathname.startsWith("/assets/")) return false;
  const indexFile = await containedFile(root, "/index.html");
  if (!indexFile) return false;
  await sendFile(response, indexFile, "no-cache");
  return true;
}
