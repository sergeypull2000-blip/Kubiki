import { fromNodeHeaders } from "better-auth/node";
import { createUserRepository } from "./repositories/userRepository.js";

export function createRequestAuthenticator({ auth, pool, logger = console }) {
  const users = createUserRepository(pool);
  return async function authenticate(request) {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      if (!session?.user?.id) return null;
      const user = await users.resolveByAuthUserId(session.user.id);
      return { authUser: session.user, session: session.session, user: { id: user.id } };
    } catch (error) {
      logger.error("Request authentication failed", { name: error?.name || "Error" });
      return null;
    }
  };
}
