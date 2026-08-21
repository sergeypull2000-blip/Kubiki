import { randomUUID } from "node:crypto";
import { ApiError, badRequest, notFound } from "./apiErrors.js";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_REQUEST_BYTES = MAX_LOGO_BYTES + 64 * 1024;

const TYPES = {
  "image/png": { extension: "png", matches: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  "image/jpeg": { extension: "jpg", matches: (b) => b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255 },
  "image/webp": { extension: "webp", matches: (b) => b.length >= 12 && b.toString("ascii",0,4) === "RIFF" && b.toString("ascii",8,12) === "WEBP" },
};

async function readMultipart(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw badRequest("multipart_required");
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_LOGO_REQUEST_BYTES) throw new ApiError(413, "logo_too_large");
    chunks.push(chunk);
  }
  try {
    return await new Request("http://localhost/api/export-profile/logo", {
      method: "POST",
      headers: { "content-type": contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw badRequest("invalid_multipart");
  }
}

async function readLogo(request) {
  const form = await readMultipart(request);
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") throw badRequest("logo_required");
  if (file.size > MAX_LOGO_BYTES) throw new ApiError(413, "logo_too_large");
  const type = TYPES[file.type];
  const body = Buffer.from(await file.arrayBuffer());
  if (!type || !type.matches(body)) throw badRequest("invalid_logo_type");
  return { body, contentType: file.type, extension: type.extension };
}

const expectedPrefix = (userId) => `users/${userId}/export-logos/`;
const isOwnedKeyShape = (path, userId) => typeof path === "string"
  && path.startsWith(expectedPrefix(userId))
  && /^users\/[0-9a-f-]+\/export-logos\/[0-9a-f-]+\.(png|jpg|webp)$/.test(path);

export function matchLogoRoute(method, pathname) {
  if (pathname === "/api/export-profile/logo" && ["POST", "DELETE"].includes(method)) return method;
  if (pathname === "/api/export-profile/logo-url" && method === "GET") return method;
  return null;
}

export async function handleLogoRoute(method, request, repository, storage, userId, logger = console) {
  if (method === "POST") {
    const logo = await readLogo(request);
    const path = `${expectedPrefix(userId)}${randomUUID()}.${logo.extension}`;
    await storage.put(path, logo.body, logo.contentType);
    let oldPath;
    try {
      oldPath = await repository.replaceLogoPath(userId, path);
    } catch (error) {
      try { await storage.delete(path); } catch { logger.error("Failed to clean up unreferenced uploaded logo"); }
      throw error;
    }
    if (oldPath && oldPath !== path) {
      try { await storage.delete(oldPath); } catch { logger.error("Failed to clean up obsolete logo"); }
    }
    return { status: 200, body: { path } };
  }

  if (method === "GET") {
    const path = new URL(request.url, "http://localhost").searchParams.get("path");
    if (!isOwnedKeyShape(path, userId)) throw notFound();
    const ownedPath = await repository.getLogoPath(userId);
    if (!ownedPath || ownedPath !== path) throw notFound();
    return { status: 200, body: { signedUrl: await storage.signedGetUrl(path) } };
  }

  const oldPath = await repository.clearLogoPath(userId);
  if (oldPath) {
    try { await storage.delete(oldPath); } catch { logger.error("Failed to delete unreferenced logo"); }
  }
  return { status: 200, body: { ok: true } };
}
