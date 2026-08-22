import { createHmac, timingSafeEqual } from "node:crypto";

export const AI_EDIT_CONTINUATION_VERSION = 1;
export const AI_EDIT_CONTINUATION_TTL_MS = 15 * 60 * 1000;
const encode = (value) => Buffer.from(value).toString("base64url");
const secret = () => process.env.AI_EDIT_CONTINUATION_SECRET || process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || "";

export function signAiEditContinuation(payload, now = Date.now()) {
  if (!secret()) throw new Error("AI_EDIT_CONTINUATION_SECRET не задан");
  const body = encode(JSON.stringify({ v: AI_EDIT_CONTINUATION_VERSION, iat: now, exp: now + AI_EDIT_CONTINUATION_TTL_MS, ...payload }));
  const signature = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyAiEditContinuation(token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 50_000 || !secret()) return null;
  const [body, signature, extra] = token.split("."); if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  let actual; try { actual = Buffer.from(signature, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return value.v === AI_EDIT_CONTINUATION_VERSION && Number.isFinite(value.exp) && value.exp >= now && value.iat <= now + 60_000 ? value : null;
  } catch { return null; }
}
