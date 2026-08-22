import { createAuthClient } from "better-auth/react";
import { resolveKubikiApiBaseUrl } from "./apiTransport.js";

export function createKubikiAuthClient({ baseUrl = resolveKubikiApiBaseUrl() } = {}) {
  const origin = baseUrl || globalThis.location?.origin || "http://localhost";
  return createAuthClient({ baseURL: `${origin}/api/auth`, fetchOptions: { credentials: "include" } });
}

// Prepared for Stage 6 consumers. It is deliberately not imported by App/AuthScreen yet.
export const kubikiAuthClient = createKubikiAuthClient();

export function createSessionGateway(client = kubikiAuthClient) {
  return {
    getSession: () => client.getSession(),
    useSession: () => client.useSession(),
    signIn: (email, password) => client.signIn.email({ email, password }),
    signUp: (email, password, name = email) => client.signUp.email({ email, password, name, acceptedBetaTerms: true, acceptedPersonalDataConsent: true }),
    sendVerificationEmail: (email) => client.sendVerificationEmail({ email, callbackURL: `${globalThis.location?.origin || ""}/` }),
    signOut: () => client.signOut(),
    requestPasswordReset: (email, redirectTo) => client.requestPasswordReset({ email, redirectTo }),
    resetPassword: (newPassword, token) => client.resetPassword({ newPassword, token }),
  };
}
