export async function saveAiDisclosureConsents({ repository, userId, versions, improvementConsent }) {
  await repository.accept(userId, "ai_disclosure", versions.ai_disclosure);

  if (!improvementConsent) return { improvementConsentSaved: false };

  try {
    await repository.accept(userId, "ai_improvement_consent", versions.ai_improvement_consent);
    return { improvementConsentSaved: true };
  } catch {
    return { improvementConsentSaved: false };
  }
}
