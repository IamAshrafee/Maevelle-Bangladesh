# Two-factor authentication operations guide

This guide is for Maevelle Owners and authorized Team & Access administrators.

## Check a member's status

Open **Team & Access**, then the member. The directory and detail view distinguish **Enabled**,
**Required**, and **Not enabled**. Required means current organization policy applies to that member;
the displayed enrollment deadline reflects the policy grace window.

## Roll out 2FA safely

1. Deploy the optional feature and confirm Account security works for a test administrator.
2. Enroll the Owner and other highest-privilege accounts first. Save recovery codes offline.
3. In **Settings → Security**, choose **Critical capabilities**, set a practical grace period, provide
   the change reason, and confirm with the acting administrator's current authenticator code.
4. Watch Team & Access for required-but-not-enrolled members and confirm security notifications move
   through Email Operations.
5. After operational review, shorten future grace periods or choose **All members** if appropriate.

Setting zero grace can immediately block eligible active sessions from business APIs. Treat it as a
high-impact security change. Returning policy to Optional removes the enrollment gate but does not
disable anyone's existing authenticator.

## Reset a lost authenticator

1. Verify the staff member's identity through an approved internal process.
2. Open the member in Team & Access and choose **Reset two-factor authentication**.
3. Enter your own current authenticator code and a specific audit reason.
4. Confirm the destructive action.

The old authenticator and every old recovery code become invalid, and all target sessions are revoked.
No administrator can view or recover the old secret. The member signs in with their password and
enrolls again if policy requires it. Ordinary members cannot call the reset API, self-reset is denied,
and another member cannot reset the Owner.

## Suspicious repeated failures

- Do not repeatedly test codes on the user's behalf; this can extend operational disruption.
- Review IAM audit events, recent sessions, and relevant API/security logs by request ID. Submitted
  codes are intentionally absent.
- Confirm the account is temporarily locked and wait for the configured expiry.
- Ask the user to change their password if password compromise is possible.
- Revoke sessions or suspend the member using the existing Team & Access lifecycle control when the
  event may be hostile.
- Reset 2FA only after identity verification. A reset is not a substitute for investigating a stolen
  session or password.

## Employee departure

Use the existing suspend/remove workflow and revoke sessions. That removes authorization immediately;
2FA by itself does not disable an account. Preserve audit history. Resetting 2FA is unnecessary for a
properly removed member, but session revocation and membership lifecycle action are mandatory.

## Lost recovery codes

If the authenticator still works, the member can regenerate recovery codes in Account security after
password and current-TOTP confirmation. Old codes are invalidated. If neither factor is available, use
the verified administrative reset process.

## Owner and highest-privilege accounts

- Enroll these accounts before enforcing policy for others.
- Keep recovery codes in a controlled offline location with an access record.
- Do not share an Owner login or authenticator.
- The normal admin reset endpoint intentionally refuses Owner reset. Use a documented emergency-access
  procedure requiring business ownership verification, database backup, security review, session
  revocation, and immediate re-enrollment. There is no hidden master recovery code.

## Audit and notifications

The IAM audit timeline records enrollment started/completed, enabled/disabled state, recovery-code use,
recovery-code regeneration, administrative reset, and policy changes. Administrative events include
actor, organization, target, reason, time, and safe before/after state. Credentials never appear.

Security changes queue in-app and email notifications through the existing notification system. These
critical notices bypass ordinary preference settings. Use Email Operations to distinguish queued,
provider-accepted, delivered, failed, or unknown outcomes; a queued notification is not proof of inbox
delivery.

## Dangerous actions checklist

- **Policy with zero grace:** can immediately restrict protected operations.
- **Administrative reset:** destroys the target's old authenticator/recovery state and revokes sessions.
- **Disable own 2FA:** revokes all sessions and is rejected when policy requires 2FA.
- **Member removal/suspension:** affects authorization independently of 2FA; use the lifecycle workflow,
  not a 2FA reset, when access should end.

## Step-by-step user workflows (Maevelle staff)

### 1. Enable two-factor authentication for your account

1. Click your user avatar or navigate to **Account Security** (`/account/security`).
2. Locate the **Authenticator App** card and click **Set up authenticator**.
3. **Confirm your identity:** Enter your current account password and click **Continue**.
4. **Scan QR code:** Open your preferred authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.) and scan the on-screen QR code.
   - *On the same mobile phone?* Click **Enter setup key manually** and copy the 32-character secret key directly into your authenticator app.
5. **Verify code:** Enter the 6-digit code shown in your authenticator app into the OTP input.
   - *Having trouble?* Ensure your phone's date and time are set to automatic, then enter the newest code shown.
6. **Save recovery codes:**
   - Click **Copy codes** or **Download codes (.txt)** to store your recovery codes in a secure password manager or offline file.
   - Check the acknowledgement box: `"I have safely stored these recovery codes"`.
   - Click **Finish setup**. Your status immediately updates to **Enabled**.

### 2. Sign in with two-factor authentication

1. Navigate to `/login` and submit your email and password.
2. Maevelle transitions automatically to `/two-factor`.
3. Enter the 6-digit verification code from your authenticator app.
4. Click **Verify & Continue**. You will be securely redirected to the Admin Portal dashboard or your requested destination.

### 3. Sign in using a recovery code (lost authenticator)

1. On the `/two-factor` challenge screen, click **Use a recovery code**.
2. Enter one of your unused recovery codes (e.g. `ABCD-EFGH`).
3. Click **Verify Recovery Code**.
4. Once verified, this code is permanently consumed. You can immediately access your account and generate a new set of recovery codes or reconfigure your authenticator app under **Account Security**.

### 4. Reset a staff member's authenticator (Team Administrators)

1. Navigate to **Team & Access** (`/team`).
2. In the directory table, review the member's 2FA status (`Enabled`, `Required`, or `Not enabled`).
3. Click on the member to open their **Team Member Details** console (`/team/[id]`).
4. In the **Security & Two-Factor Authentication** panel, click **Reset two-factor authentication**.
5. Read the destructive confirmation warning.
6. Enter an **Audit Reason** (e.g., `"Verified phone replacement via HR in-person confirmation"`).
7. Enter your **own current 6-digit verification code** to confirm authorization.
8. Click **Confirm Reset**. The member's enrollment is wiped, their sessions revoked, and their status updates immediately.

### 5. Require 2FA across the organization

1. Navigate to **Settings → Security** (`/settings/security`).
2. In the **Two-Factor Authentication Policy** card, choose your enforcement tier:
   - **Optional:** Staff may opt in voluntarily.
   - **Critical & Restricted Capabilities:** Enforced for Owners and operators with critical financial, inventory, or security permissions.
   - **All Admin Portal Members:** Mandatory for all operators.
3. Choose an appropriate **Grace Period** preset (`24 hours`, `72 hours`, `7 days`, or `14 days`) so active staff can enroll without immediate operational lockout.
4. Enter an **Audit Reason** and your **own 6-digit verification code**.
5. Click **Save Policy Changes**. Eligible team members will see a clear warning banner with their setup deadline.


