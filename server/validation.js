import { badRequest } from "./apiErrors.js";

export const object = (value, code = "invalid_request") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw badRequest(code);
  return value;
};
export const jsonObject = (value, code = "invalid_json_object") => object(value, code);
export const text = (value, { code = "invalid_string", min = 1, max = 2000, nullable = false } = {}) => {
  if (nullable && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string") throw badRequest(code);
  const result = value.trim();
  if (result.length < min || result.length > max) throw badRequest(code);
  return result;
};
export const id = (value) => text(value, { code: "invalid_id", max: 200 });
export const uuid = (value) => {
  const result = text(value, { code: "invalid_id", max: 36 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw badRequest("invalid_id");
  return result;
};
export const boolean = (value, code = "invalid_boolean") => { if (typeof value !== "boolean") throw badRequest(code); return value; };
export const batch = (value, max = 100) => { if (!Array.isArray(value) || value.length > max) throw badRequest("invalid_batch"); return value; };

