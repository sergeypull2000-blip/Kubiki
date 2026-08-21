import { createBackendServer } from "./app.js";
import { pathToFileURL } from "node:url";
import { parseBackendConfig, parseObjectStorageConfig } from "./config.js";
import { closeDatabasePool, createDatabasePool } from "./db.js";
import { toNodeHandler } from "better-auth/node";
import { auth, authPool } from "./auth.js";
import { createRequestAuthenticator } from "./requestAuth.js";
import { createServerDataRepository } from "./repositories/serverDataRepository.js";
import { createUsageRepository } from "./repositories/usageRepository.js";
import { createOwnerApiRepository } from "./repositories/ownerApiRepository.js";
import { createObjectStorage } from "./objectStorage.js";

export async function startBackend({ env = process.env, logger = console } = {}) {
  const config = parseBackendConfig(env);
  const objectStorage = createObjectStorage(parseObjectStorageConfig(env));
  const pool = createDatabasePool(config.databaseUrl);
  pool.on("error", () => logger.error("Unexpected PostgreSQL pool error"));

  const authenticate = createRequestAuthenticator({ auth, pool, logger });
  const serverData = Object.assign(createServerDataRepository(pool), createUsageRepository(pool));
  const ownerApi = createOwnerApiRepository(pool);
  const server = createBackendServer({ pool, authHandler: toNodeHandler(auth), authenticate, serverData, ownerApi, objectStorage, logger, ...config });
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
