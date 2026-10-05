# Two-factor authentication deployment and configuration

## Runtime configuration

| Variable | Default | Validation | Purpose |
| --- | --- | --- | --- |
| `AUTH_TOTP_ISSUER` | `Maevelle` | 1–64 visible characters | Name shown in authenticator apps. Use a stable production brand. |
| `AUTH_TOTP_CHALLENGE_SECONDS` | `600` | 120–1800 | Lifetime of the pending password-to-2FA challenge. |
| `AUTH_TOTP_MAX_FAILED_ATTEMPTS` | `10` | 3–20 | Account-level failed second-factor attempts before lockout. |
| `AUTH_TOTP_LOCK_SECONDS` | `900` | 60–86400 | Temporary account lock duration. |

Existing root-of-trust values remain required: `BETTER_AUTH_SECRET` must be a strong, stable secret and
`AUTH_ENCRYPTION_KEY` must be a stable Base64-encoded 32-byte key. Changing either without a planned
credential/session rotation can invalidate protected state. Never store real values in Git or editable
Admin settings.

Example placeholders:

```dotenv
BETTER_AUTH_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
AUTH_ENCRYPTION_KEY=REPLACE_WITH_BASE64_32_BYTE_KEY
AUTH_TOTP_ISSUER=Maevelle
AUTH_TOTP_CHALLENGE_SECONDS=600
AUTH_TOTP_MAX_FAILED_ATTEMPTS=10
AUTH_TOTP_LOCK_SECONDS=900
```

Organization enforcement mode and grace hours are business-editable tenant settings in PostgreSQL,
not environment variables. Trusted-device bypass is intentionally disabled in code for V1.

## Database and application deployment

This repository is still using its mutable development migration baseline. The IAM baseline now creates
the Better Auth two-factor fields/table plus the Maevelle policy table. For a disposable local database,
rebuild the named volume as instructed by the repository before testing the clean path. Before any real
dataset must survive upgrades, freeze the baseline and convert this schema change into an immutable
forward migration.

Recommended production deployment order once immutable migrations are in use:

1. Back up PostgreSQL and verify restore readiness.
2. Provide stable secrets and validated TOTP settings to API and worker environments.
3. Apply the schema migration before starting the new API.
4. Deploy API, Admin, and worker from the same release.
5. Verify HTTPS, trusted origins, proxy-forwarded host/protocol, secure HttpOnly cookies, and time sync.
6. Leave organization policy Optional for initial validation.
7. Exercise enrollment, logout/login challenge, one recovery code, audit visibility, and notification
   processing with a controlled test administrator.
8. Roll out enforcement using the operations guide.

The API performs TOTP verification synchronously. Workers are only required for existing queued email
delivery and other asynchronous side effects. If email delivery is disabled or fails, in-app records and
audit/outbox evidence remain available; authentication decisions do not wait for the worker.

## Infrastructure requirements

- Serve production only over HTTPS. Configure `BETTER_AUTH_URL` and `AUTH_TRUSTED_ORIGINS` for the real
  public Admin/API topology; do not loosen CSRF/origin checks to solve proxy configuration errors.
- Keep host, container, and phone clocks synchronized. Monitor NTP drift; TOTP correctness depends on
  time and the acceptance window was not widened.
- Preserve encrypted PostgreSQL backups and restrict database access because encrypted credential
  records remain sensitive.
- Run the existing API rate limiter and Better Auth account lockout together. Do not disable either for
  convenience.
- Ensure the notification worker can process queued EMAIL rows and that provider/webhook configuration
  remains valid. Notifications contain descriptions only, never credentials.

## Rollback

Rolling application code back while users have enabled 2FA can strand protected accounts if the old
application does not understand `twoFactorRedirect`. Prefer forward repair. A safe rollback requires an
application version that still completes Better Auth 2FA challenges and understands the existing
schema. Do not drop `iam.auth_two_factor`, clear `two_factor_enabled`, or rotate root secrets as a casual
rollback.

If enforcement causes an operational incident, an authorized administrator with fresh MFA may return
the organization policy to Optional. That removes the Maevelle enrollment gate without weakening or
deleting individual authenticator enrollments. Record the reason and investigate before re-enforcement.

## Verification checklist

- Clean baseline migration builds `iam.auth_two_factor` and `iam.organization_two_factor_policies`.
- Startup rejects invalid issuer/challenge/attempt/lock values.
- Password-only sign-in for a protected user returns a challenge and cannot access `/admin/context`.
- TOTP and one unused recovery code each complete sign-in; the same recovery code fails next time.
- Enrollment data has `Cache-Control: no-store` and the QR is created locally.
- Policy deadline blocks a direct protected API request, not only the browser UI.
- Unauthorized reset is 403; self and Owner reset are denied; authorized reset revokes sessions.
- Audit/outbox/notification payload searches contain no setup secret, URI, OTP, password, or recovery
  code.
- Email delivery failures are visible operationally without changing the authentication result.

