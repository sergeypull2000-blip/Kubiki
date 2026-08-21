import { betterAuth } from "better-auth";
import pg from "pg";
import { parseBackendConfig, parseBetterAuthConfig } from "./config.js";
import { createAuthEmailSender } from "./email.js";

const { Pool } = pg;

// This instance exists to make the pinned Better Auth schema reproducible in
// Stage 1. It is not wired into the current Supabase authentication flow.
const isSchemaGeneration = process.env.BETTER_AUTH_SCHEMA_GENERATION === "1";
const connectionString = isSchemaGeneration
  ? "postgresql://schema_generator:unused@127.0.0.1:5432/kubiki"
  : parseBackendConfig(process.env).databaseUrl;
const authConfig = isSchemaGeneration
  ? { secret: "stage-1-schema-generation-only-secret", baseUrl: "http://localhost:3000" }
  : parseBetterAuthConfig(process.env);

function createSchemaGenerationPool() {
  const client = {
    async query(query) {
      const sql = typeof query === "string" ? query : query.text;
      if (/show\s+search_path/i.test(sql)) {
        return { rows: [{ search_path: "auth" }] };
      }
      return { rows: [] };
    },
    release() {},
  };

  return {
    on() {},
    async connect() {
      return client;
    },
    async end() {},
  };
}

export const authPool =
  isSchemaGeneration
    ? createSchemaGenerationPool()
    : new Pool({
        connectionString,
        options: "-c search_path=auth",
        max: 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

export function createBetterAuth({ pool = authPool, config = authConfig, emailSender = createAuthEmailSender() } = {}) {
  return betterAuth({
    database: pool,
    secret: config.secret,
    baseURL: config.baseUrl,
    emailVerification: {
      sendVerificationEmail: emailSender.sendVerificationEmail,
      sendOnSignUp: true,
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: emailSender.sendPasswordResetEmail,
      revokeSessionsOnPasswordReset: true,
    },
    advanced: {
      database: {
        generateId: "uuid",
      },
    },
  });
}

export const auth = createBetterAuth();
