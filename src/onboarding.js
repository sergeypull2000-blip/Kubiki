export const ONBOARDING_SEEN_PREFIX = "kubiki:onboarding_seen:v1:";

export const onboardingSeenKey = (userId) => `${ONBOARDING_SEEN_PREFIX}${userId}`;

export function hasSeenOnboarding(userId, storage = localStorage) {
  try { return storage.getItem(onboardingSeenKey(userId)) === "true"; } catch { return false; }
}

export function markOnboardingSeen(userId, storage = localStorage) {
  try { storage.setItem(onboardingSeenKey(userId), "true"); } catch { /* private/blocked storage */ }
}

export function isGenuinelyNewUser(user, now = Date.now(), windowMs = 15 * 60 * 1000) {
  const created = Date.parse(user?.created_at || user?.createdAt || "");
  return Number.isFinite(created) && now - created >= 0 && now - created <= windowMs;
}
