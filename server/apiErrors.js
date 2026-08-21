export class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export const badRequest = (code = "invalid_request") => new ApiError(400, code);
export const notFound = () => new ApiError(404, "not_found");

