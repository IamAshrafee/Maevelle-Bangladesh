export type PrivacyDecision = 'GRANTED' | 'DENIED' | 'UNKNOWN';
export type PrivacyPurpose = 'ANALYTICS' | 'ADVERTISING';
export interface PrivacyPurposeDto {
  decision: PrivacyDecision;
  effectiveDecision: PrivacyDecision;
  revision: string;
  browserRevision: string;
  policyVersion: string | null;
  changedAt: string | null;
  expiresAt: string | null;
}
export interface PrivacyPreferencesDto {
  schemaVersion: 1;
  context: string;
  scope: 'SESSION' | 'ACCOUNT';
  policyVersion: string;
  purposes: Record<PrivacyPurpose, PrivacyPurposeDto>;
  observationToken: string | null;
  observationNotBefore: string | null;
  externalDispatchEnabled: false;
}
export interface SavePrivacyPreferencesDto {
  policyVersion: string;
  choices: Record<
    PrivacyPurpose,
    {
      decision: 'GRANTED' | 'DENIED';
      expectedRevision: string;
      expectedBrowserRevision: string;
    }
  >;
}
