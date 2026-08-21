import { createBackendServer } from "./app.js";
import { pathToFileURL } from "node:url";
import { parseBackendConfig } from "./config.js";
import { closeDatabasePool, createDatabasePool } from "./db.js";

export async function startBackend({ env = process.env, logger = console } = {}) {
  const config = parseBackendConfig(env);
  const pool = createDatabasePool(config.databaseUrl);
  pool.on("error", () => logger.error("Unexpected PostgreSQL pool error"));

  const server = createBackendServer({ pool, ...config });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  logger.info(`Kubiki backend listening on ${config.host}:${config.port}`);

  let stopping;
  const stop = () => {
    if (stopping) return stopping;
    stopping = new Promise((resolve) => server.close(resolve)).finally(() =>
      closeDatabasePool(pool),
    );
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
