import pg from "pg";

const { Pool } = pg;

export const DEFAULT_POOL_OPTIONS = Object.freeze({
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export function createDatabasePool(databaseUrl, PoolClass = Pool) {
  return new PoolClass({
    connectionString: databaseUrl,
    ...DEFAULT_POOL_OPTIONS,
  });
}

export async function closeDatabasePool(pool) {
  await pool.end();
}
