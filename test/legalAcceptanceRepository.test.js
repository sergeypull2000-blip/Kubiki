import test from "node:test";
import assert from "node:assert/strict";
import {
  recordSignUpLegalAcceptances,
  rollbackFailedSignUp,
} from "../server/repositories/legalAcceptanceRepository.js";

function createPool({ failOn } = {}) {
  const queries = [];
  const client = {
    async query(sql, params) {
      const normalized = sql.trim().replace(/\s+/g, " ");
      queries.push({ sql: normalized, params });
      if (normalized.startsWith("insert into public.users")) {
        return { rows: [{ id: "public-user-id" }] };
      }
      if (failOn && normalized.includes(`'${failOn}'`)) throw new Error("injected legal failure");
      if (normalized.startsWith('delete from auth."user"')) return { rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  return { pool: { async connect() { return client; } }, queries };
}

test("signup legal repository commits both mandatory acceptances atomically", async () => {
  const { pool, queries } = createPool();
  assert.equal(await recordSignUpLegalAcceptances(pool, "trusted-auth-id"), true);
  assert.deepEqual(queries.map(({ sql }) => sql), [
    "begin",
    'insert into public.users(auth_user_id) select $1 where exists(select 1 from auth."user" where id=$1) on conflict(auth_user_id) do nothing returning id',
    "insert into public.user_legal_acceptances(user_id,document_key,version) values($1,'beta_terms',$2) on conflict(user_id,document_key,version) do nothing",
    "insert into public.user_legal_acceptances(user_id,document_key,version) values($1,'personal_data_consent',$2) on conflict(user_id,document_key,version) do nothing",
    "commit",
  ]);
});

for (const failedDocument of ["beta_terms", "personal_data_consent"]) {
  test(`signup legal repository rolls back when ${failedDocument} insert fails`, async () => {
    const { pool, queries } = createPool({ failOn: failedDocument });
    await assert.rejects(recordSignUpLegalAcceptances(pool, "trusted-auth-id"), /injected legal failure/);
    assert.equal(queries.at(-1).sql, "rollback");
    assert.equal(queries.some(({ sql }) => sql === "commit"), false);
  });
}

test("compensating rollback deletes only the trusted server-side auth id", async () => {
  const { pool, queries } = createPool();
  assert.equal(await rollbackFailedSignUp(pool, "trusted-auth-id"), true);
  const deletion = queries.find(({ sql }) => sql.startsWith('delete from auth."user"'));
  assert.deepEqual(deletion.params, ["trusted-auth-id"]);
  assert.equal(deletion.sql, 'delete from auth."user" where id=$1');
});
