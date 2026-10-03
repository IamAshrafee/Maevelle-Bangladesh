# SMS Environment Configuration

## Generic deployment settings

| Variable | Safe default | Meaning |
| --- | --- | --- |
| `SMS_ENABLED` | `false` | Emergency/global worker send switch |
| `SMS_PROVIDER` | `none` | Registered adapter; currently `none` or development-only `mock` |
| `SMS_ENVIRONMENT` | `NODE_ENV` | `development`, `test`, or `production` safety posture |
| `SMS_TEST_MODE` | true outside production | Allows protected test tooling |
| `SMS_RECIPIENT_OVERRIDE` | empty | Non-production redirect; must also be allow-listed |
| `SMS_ALLOWED_TEST_RECIPIENTS` | empty | Comma-separated E.164 Bangladesh test numbers |
| `SMS_SENDER_TYPE` | `PROVIDER_DEFAULT` | `MASKING`, `NON_MASKING`, or `PROVIDER_DEFAULT` |
| `SMS_SENDER_ID` | empty | Preferred sender; not proof of provider approval |
| `SMS_MAX_PER_TICK` | `20` | Bounded worker throughput per tick |

Production rejects test mode/recipient override and rejects SMS enablement until a real provider adapter replaces the current `none`/`mock` registry choices.

## Configuration boundaries

- **Database business settings:** per-event enabled, automatic, and manual policies; suppressions; audited operator actions.
- **Deployment/secret settings:** provider selection, credentials, callback secret, environment safety, throughput limit.
- **External provider setup:** account verification, recharge/contract, sender approval, callback registration, IP allow-listing.

Future provider variables belong to its adapter, for example API key/username/password/webhook secret. They must be deployment secrets or encrypted integration secrets, never ordinary runtime-setting rows and never frontend data.
