import { useEffect } from "react";
import KubikiApp from "./kubiki.jsx";
import { AuthScreen } from "./AuthScreen.jsx";
import { useGeistFont } from "./hooks.js";
import { kubikiAuthClient } from "./backend/betterAuthClient.js";
import { cleanupLegacySupabaseOwnerMarkers } from "./backend/legacyCleanup.js";
import { CSS } from "./styles.js";

function App() {
  useGeistFont();
  const { data: session, isPending, refetch } = kubikiAuthClient.useSession();
  const resetToken = new URLSearchParams(globalThis.location?.search || "").get("token");
  const recoveryMode = globalThis.location?.pathname === "/reset-password" && Boolean(resetToken);

  useEffect(() => {
    cleanupLegacySupabaseOwnerMarkers();
    const refresh = () => refetch();
    globalThis.addEventListener?.("kubiki:unauthorized", refresh);
    return () => globalThis.removeEventListener?.("kubiki:unauthorized", refresh);
  }, [refetch]);

  const handleSignOut = async () => {
    const result = await kubikiAuthClient.signOut();
    if (result.error) console.error("Sign out failed", result.error);
    await refetch();
  };

  const finishPasswordReset = () => {
    globalThis.history?.replaceState({}, "", "/");
    refetch();
  };

  let content;
  if (isPending) content = <div className="kb-auth-screen"><div className="kb-auth-loading">Проверяем сессию…</div></div>;
  else if (recoveryMode) content = <AuthScreen mode="reset" resetToken={resetToken} onPasswordUpdated={finishPasswordReset} />;
  else if (!session?.user) content = <AuthScreen mode="signin" onAuthenticated={refetch} />;
  else content = <KubikiApp key={session.user.id} userId={session.user.id} user={session.user} onSignOut={handleSignOut} />;

  return <><style>{CSS}</style>{content}</>;
}

export default App;
