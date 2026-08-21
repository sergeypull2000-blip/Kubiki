export function createUserRepository(pool) {
  return {
    async resolveByAuthUserId(authUserId) {
      const { rows } = await pool.query(
        `insert into public.users (auth_user_id) values ($1)
         on conflict (auth_user_id) do update set auth_user_id = excluded.auth_user_id
         returning id, auth_user_id, created_at`,
        [authUserId],
      );
      return rows[0];
    },
  };
}
