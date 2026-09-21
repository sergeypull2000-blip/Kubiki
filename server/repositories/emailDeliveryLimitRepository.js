function serializedBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    throw new TypeError("Email delivery limit buckets are required");
  }
  const rows = buckets.map(({ scope, subjectHash, windowSeconds, max }) => {
    if (!scope || !Buffer.isBuffer(subjectHash) || subjectHash.length !== 32) {
      throw new TypeError("Invalid email delivery limit bucket");
    }
    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0 || !Number.isInteger(max) || max <= 0) {
      throw new TypeError("Invalid email delivery limit policy");
    }
    return {
      bucket_scope: scope,
      subject_hash_hex: subjectHash.toString("hex"),
      window_seconds: windowSeconds,
      max_count: max,
    };
  }).sort((left, right) => (
    left.bucket_scope.localeCompare(right.bucket_scope)
    || left.subject_hash_hex.localeCompare(right.subject_hash_hex)
    || left.window_seconds - right.window_seconds
  ));
  const keys = new Set(rows.map((row) => `${row.bucket_scope}:${row.subject_hash_hex}:${row.window_seconds}`));
  if (keys.size !== rows.length) throw new TypeError("Duplicate email delivery limit bucket");
  return JSON.stringify(rows);
}

const REQUESTED_BUCKETS = `select bucket_scope, subject_hash_hex, window_seconds, max_count
  from jsonb_to_recordset($1::jsonb) as requested(
    bucket_scope text,
    subject_hash_hex text,
    window_seconds integer,
    max_count integer
  )`;

export function createEmailDeliveryLimitRepository(pool) {
  if (!pool?.connect || !pool?.query) throw new TypeError("PostgreSQL pool is required");

  return {
    async assertReady() {
      await pool.query("select 1 from auth.email_delivery_rate_limits limit 0");
    },

    async consume(buckets) {
      const serialized = serializedBuckets(buckets);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local lock_timeout = '1s'");
        await client.query("set local statement_timeout = '2s'");
        await client.query(`with requested as (${REQUESTED_BUCKETS})
          insert into auth.email_delivery_rate_limits(
            bucket_scope, subject_hash, window_seconds, count, window_started_at, expires_at
          )
          select bucket_scope, decode(subject_hash_hex, 'hex'), window_seconds, 0,
            transaction_timestamp(),
            transaction_timestamp() + make_interval(secs => window_seconds)
          from requested
          on conflict (bucket_scope, subject_hash, window_seconds) do nothing`, [serialized]);

        const check = await client.query(`with requested as (${REQUESTED_BUCKETS}),
          locked as materialized (
            select limits.bucket_scope, limits.subject_hash, limits.window_seconds,
              limits.count, limits.expires_at, requested.max_count
            from auth.email_delivery_rate_limits as limits
            join requested
              on requested.bucket_scope = limits.bucket_scope
             and decode(requested.subject_hash_hex, 'hex') = limits.subject_hash
             and requested.window_seconds = limits.window_seconds
            order by limits.bucket_scope, limits.subject_hash, limits.window_seconds
            for update of limits
          )
          select count(*)::integer as "rowCount",
            coalesce(bool_and(
              expires_at <= transaction_timestamp() or count < max_count
            ), false) as allowed
          from locked`, [serialized]);
        const decision = check.rows[0];
        if (decision?.rowCount !== buckets.length) {
          throw new Error("Email delivery limiter could not lock every bucket");
        }
        if (!decision.allowed) {
          await client.query("rollback");
          return false;
        }

        const updated = await client.query(`with requested as (${REQUESTED_BUCKETS})
          update auth.email_delivery_rate_limits as limits
          set count = case
                when limits.expires_at <= transaction_timestamp() then 1
                else limits.count + 1
              end,
              window_started_at = case
                when limits.expires_at <= transaction_timestamp() then transaction_timestamp()
                else limits.window_started_at
              end,
              expires_at = case
                when limits.expires_at <= transaction_timestamp()
                  then transaction_timestamp() + make_interval(secs => limits.window_seconds)
                else limits.expires_at
              end
          from requested
          where requested.bucket_scope = limits.bucket_scope
            and decode(requested.subject_hash_hex, 'hex') = limits.subject_hash
            and requested.window_seconds = limits.window_seconds`, [serialized]);
        if (updated.rowCount !== buckets.length) {
          throw new Error("Email delivery limiter could not consume every bucket");
        }
        await client.query("commit");
        return true;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async pruneExpired(limit = 500) {
      if (!Number.isInteger(limit) || limit <= 0) throw new TypeError("Cleanup limit must be positive");
      const result = await pool.query(`with expired as (
          select bucket_scope, subject_hash, window_seconds
          from auth.email_delivery_rate_limits
          where expires_at <= transaction_timestamp()
          order by bucket_scope, subject_hash, window_seconds
          limit $1
          for update skip locked
        )
        delete from auth.email_delivery_rate_limits as limits
        using expired
        where limits.bucket_scope = expired.bucket_scope
          and limits.subject_hash = expired.subject_hash
          and limits.window_seconds = expired.window_seconds`, [limit]);
      return result.rowCount;
    },
  };
}
