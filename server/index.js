import { createBackendServer } from "./app.js";
import { pathToFileURL } from "node:url";
import { parseBackendConfig, parseObjectStorageConfig } from "./config.js";
import { closeDatabasePool, createDatabasePool } from "./db.js";
import { auth, authPool } from "./auth.js";
import { createBetterAuthHttpHandler } from "./betterAuthHttp.js";
import { createRequestAuthenticator } from "./requestAuth.js";
import { createServerDataRepository } from "./repositories/serverDataRepository.js";
import { createUsageRepository } from "./repositories/usageRepository.js";
import { createOwnerApiRepository } from "./repositories/ownerApiRepository.js";
import { createObjectStorage } from "./objectStorage.js";
import { recordSignUpLegalAcceptances, rollbackFailedSignUp } from "./repositories/legalAcceptanceRepository.js";
import { createRequestSecurity } from "./requestSecurity.js";

export async function startBackend({ env = process.env, logger = console } = {}) {
  const config = parseBackendConfig(env);
  const objectStorage = createObjectStorage(parseObjectStorageConfig(env));
  const requestSecurity = createRequestSecurity({ trustProxy: config.trustProxy });
  const pool = createDatabasePool(config.databaseUrl);
  pool.on("error", () => logger.error("Unexpected PostgreSQL pool error"));

  const authenticate = createRequestAuthenticator({ auth, pool, logger });
  const serverData = Object.assign(createServerDataRepository(pool), createUsageRepository(pool));
  const ownerApi = createOwnerApiRepository(pool);
  const authHandler = createBetterAuthHttpHandler(auth.handler, {
    recordSignUpAcceptances: (authUserId) => recordSignUpLegalAcceptances(pool, authUserId),
    rollbackSignUp: (authUserId) => rollbackFailedSignUp(pool, authUserId),
    sendSignUpVerificationEmail: ({ email, callbackURL, headers }) => auth.api.sendVerificationEmail({
      body: { email, callbackURL },
      headers,
    }),
  });
  const server = createBackendServer({ pool, authHandler, authenticate, serverData, ownerApi, objectStorage, requestSecurity, logger, ...config });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  logger.info(`Kubiki backend listening on ${config.host}:${config.port}`);

  let stopping;
  const stop = () => {
    if (stopping) return stopping;
    stopping = new Promise((resolve) => server.close(resolve)).finally(async () => {
      await Promise.all([closeDatabasePool(pool), closeDatabasePool(authPool)]);
    });
    return stopping;
  };

  const onSignal = () => {
    void stop().then(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  return { server, pool, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startBackend().catch(() => {
    console.error("Backend failed to start; check backend configuration");
    process.exitCode = 1;
  });
}
