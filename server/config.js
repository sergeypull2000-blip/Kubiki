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
