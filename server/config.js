const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseDatabaseUrl(value) {
  if (!value) throw new Error("DATABASE_URL is required to start the backend");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres or postgresql protocol");
  }
  return value;
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required to start the backend`);
  return value;
}

function parseBoolean(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

export function parseBackendConfig(env = process.env) {
  return {
    databaseUrl: parseDatabaseUrl(env.DATABASE_URL),
    host: env.HOST || DEFAULT_HOST,
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT, "PORT"),
    bodyLimitBytes: parsePositiveInteger(
      env.BACKEND_BODY_LIMIT_BYTES,
      1_048_576,
      "BACKEND_BODY_LIMIT_BYTES",
    ),
    readinessTimeoutMillis: parsePositiveInteger(
      env.READINESS_TIMEOUT_MILLIS,
      2_000,
      "READINESS_TIMEOUT_MILLIS",
    ),
  };
}

export function parseBetterAuthConfig(env = process.env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
  }
  let baseUrl;
  try {
    baseUrl = new URL(env.BETTER_AUTH_URL);
  } catch {
    throw new Error("BETTER_AUTH_URL must be a valid absolute URL");
  }
  return { secret: env.BETTER_AUTH_SECRET, baseUrl: baseUrl.toString() };
}

export function parseSmtpConfig(env = process.env) {
  const port = parsePositiveInteger(required(env.SMTP_PORT, "SMTP_PORT"), undefined, "SMTP_PORT");
  if (port > 65_535) throw new Error("SMTP_PORT must not exceed 65535");
  return {
    host: required(env.SMTP_HOST, "SMTP_HOST"),
    port,
    secure: parseBoolean(required(env.SMTP_SECURE, "SMTP_SECURE"), undefined, "SMTP_SECURE"),
    user: required(env.SMTP_USER, "SMTP_USER"),
    password: required(env.SMTP_PASSWORD, "SMTP_PASSWORD"),
    from: required(env.SMTP_FROM, "SMTP_FROM"),
  };
}

export function parseObjectStorageConfig(env = process.env) {
  let endpoint;
  try {
    endpoint = new URL(required(env.S3_ENDPOINT, "S3_ENDPOINT"));
  } catch (error) {
    if (error.message?.startsWith("S3_ENDPOINT is required")) throw error;
    throw new Error("S3_ENDPOINT must be a valid absolute URL");
  }
  if (!["http:", "https:"].includes(endpoint.protocol)) {
    throw new Error("S3_ENDPOINT must use the http or https protocol");
  }
  const signedUrlTtlSeconds = parsePositiveInteger(
    env.S3_SIGNED_URL_TTL_SECONDS,
    300,
    "S3_SIGNED_URL_TTL_SECONDS",
  );
  if (signedUrlTtlSeconds > 900) throw new Error("S3_SIGNED_URL_TTL_SECONDS must not exceed 900");
  return {
    endpoint: endpoint.toString(),
    region: required(env.S3_REGION, "S3_REGION"),
    bucket: required(env.S3_BUCKET, "S3_BUCKET"),
    accessKeyId: required(env.S3_ACCESS_KEY_ID, "S3_ACCESS_KEY_ID"),
    secretAccessKey: required(env.S3_SECRET_ACCESS_KEY, "S3_SECRET_ACCESS_KEY"),
    forcePathStyle: parseBoolean(env.S3_FORCE_PATH_STYLE, false, "S3_FORCE_PATH_STYLE"),
    signedUrlTtlSeconds,
  };
}
