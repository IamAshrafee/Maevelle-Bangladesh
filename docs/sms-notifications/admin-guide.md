# SMS Admin Guide

Open **Admin → SMS operations** (`/sms`). The current interface is intentionally functional and will receive a dedicated UX pass later.

- **Overview** shows whether SMS is enabled, the selected provider, sender posture, and queue outcomes.
- **Activity** lists logical SMS records. Select one to inspect the rendered snapshot, encoding, segments, provider ID, attempts, and timeline.
- **Templates** lists code-backed templates and previews fixture output without sending.
- **Policies** independently controls enabled, automatic, and manual behavior for each SMS event. Every change requires an audit reason.
- **Test send** requires an authentic order snapshot and an environment allow-listed test recipient. It never mutates order state.
- **Suppressions** blocks or clears a normalized Bangladesh phone with an audit reason.
- **Diagnostics** shows provider selection/configuration, capabilities, sender, worker backlog, recipient override, and callback activity.

Order detail includes an **SMS notifications** card. It uses the phone captured on the order, not a customer's later-edited profile phone. It explains missing/invalid phones, provider-not-configured, disabled policy, suppression, queued, accepted, delivered, and failed states. Manual send appears only when server eligibility permits it.

**Retry** continues the same logical SMS after a confirmed technical failure. **Resend** creates a new intentional, linked, audited SMS. An unknown provider outcome cannot be manually retried until reconciled because the provider may already have accepted it.
