import { LEGAL_DOCUMENT_VERSIONS } from "../../src/legalConfig.js";

export async function recordSignUpLegalAcceptances(pool, authUserId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(`insert into public.users(auth_user_id)
      select $1 where exists(select 1 from auth."user" where id=$1)
      on conflict(auth_user_id) do nothing returning id`, [authUserId]);
    if (rows[0]) {
      await client.query(`insert into public.user_legal_acceptances(user_id,document_key,version)
        values($1,'beta_terms',$2)
        on conflict(user_id,document_key,version) do nothing`, [rows[0].id, LEGAL_DOCUMENT_VERSIONS.beta_terms]);
      await client.query(`insert into public.user_legal_acceptances(user_id,document_key,version)
        values($1,'personal_data_consent',$2)
        on conflict(user_id,document_key,version) do nothing`, [rows[0].id, LEGAL_DOCUMENT_VERSIONS.personal_data_consent]);
    }
    await client.query("commit");
    return Boolean(rows[0]);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

export async function rollbackFailedSignUp(pool, authUserId) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rowCount } = await client.query(`delete from auth."user"
      where id=$1`, [authUserId]);
    await client.query("commit");
    return rowCount === 1;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}
