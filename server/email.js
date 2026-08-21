export function createAuthEmailSender({ deliver } = {}) {
  const unavailable = async () => {
    throw new Error("Authentication email delivery is not configured");
  };
  const send = deliver || unavailable;
  return {
    sendVerificationEmail: ({ user, url }) => send({ kind: "verify_email", to: user.email, url }),
    sendPasswordResetEmail: ({ user, url }) => send({ kind: "reset_password", to: user.email, url }),
  };
}
