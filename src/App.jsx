import { useEffect, useRef, useState } from "react";
import KubikiApp from "./kubiki.jsx";
import { AuthScreen } from "./AuthScreen.jsx";
import { useGeistFont } from "./hooks.js";
import { kubikiAuthClient } from "./backend/betterAuthClient.js";
import { cleanupLegacySupabaseOwnerMarkers } from "./backend/legacyCleanup.js";
import { CSS } from "./styles.js";
import { LegalPage, isLegalRoute } from "./legalDocuments.jsx";
import { AiDisclosureProvider } from "./components/AiDisclosureProvider.jsx";
import { resolveAppSessionView } from "./appSessionView.js";
import { consumeVerificationCallbackError } from "./verificationCallback.js";

function App() {
  useGeistFont();
  const pathname = globalThis.location?.pathname || "/";
  const { data: session, isPending, refetch } = kubikiAuthClient.useSession();
  const sessionHasResolved = useRef(false);
  const [resetCompleted, setResetCompleted] = useState(false);
  const [verificationError] = useState(() => consumeVerificationCallbackError());
  const resetToken = new URLSearchParams(globalThis.location?.search || "").get("token");
  const recoveryMode = globalThis.location?.pathname === "/reset-password" && Boolean(resetToken);

  useEffect(() => {
    cleanupLegacySupabaseOwnerMarkers();
    const refresh = () => refetch();
    globalThis.addEventListener?.("kubiki:unauthorized", refresh);
    return () => globalThis.removeEventListener?.("kubiki:unauthorized", refresh);
  }, [refetch]);

  useEffect(() => {
    if (!isPending) sessionHasResolved.current = true;
  }, [isPending]);

  const handleSignOut = async () => {
    const result = await kubikiAuthClient.signOut();
    if (result.error) console.error("Sign out failed", result.error);
    await refetch();
  };

  const finishPasswordReset = () => {
    globalThis.history?.replaceState({}, "", "/");
    setResetCompleted(true);
    refetch();
  };

  const sessionView = resolveAppSessionView({
    isPending,
    hasResolved: sessionHasResolved.current,
    recoveryMode,
    resetCompleted,
    hasUser: Boolean(session?.user),
  });

  let content;
  if (sessionView.view === "loading") content = <div className="kb-auth-screen"><div className="kb-auth-loading">Проверяем сессию…</div></div>;
  else if (sessionView.view === "reset") content = <AuthScreen mode="reset" resetToken={resetToken} onPasswordUpdated={finishPasswordReset} />;
  else if (sessionView.view === "auth") content = <AuthScreen mode={pathname === "/signup" ? "signup" : "signin"} verificationError={verificationError} onAuthenticated={refetch} />;
  else content = <AiDisclosureProvider userId={session.user.id}><KubikiApp key={session.user.id} userId={session.user.id} user={session.user} onSignOut={handleSignOut} /></AiDisclosureProvider>;

  if (isLegalRoute(pathname)) return <><style>{CSS}</style><LegalPage pathname={pathname} /></>;
  return <><style>{CSS}</style>{content}</>;
}

export default App;
