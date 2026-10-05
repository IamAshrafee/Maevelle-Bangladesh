# Maevelle Business Management System
## My Account & Self-Service User Guide

---

## 1. What is My Account?

**My Account** is your personal self-service space in the Maevelle Admin Portal. Every authenticated team member, regardless of their role or access permissions, has access to My Account.

### Key Distinction: My Account vs. Team & Access

| Area | Who Uses It? | Purpose |
| :--- | :--- | :--- |
| **My Account** (`/account`) | **Every signed-in user** (You) | Manage your personal display name, profile avatar, sign-in email verification, password changes, your personal Two-Factor Authentication (2FA), and active login sessions across your devices. |
| **Team & Access** (`/team`) | **Authorized Administrators** only | Organization-wide administration: assigning member roles, configuring permission policies, inviting new employees, suspending/activating accounts, and enforcing mandatory 2FA policies. |

> **Important**: You do **not** need administrative privileges to manage your personal account. Even if you cannot access Team & Access, you can always open My Account to update your name, photo, password, and active devices.

---

## 2. Navigating to My Account

You can access My Account at any time through either of two ways:
1. **Sidebar Navigation**: Click **My Account** under the **Overview** section in the left sidebar.
2. **User Menu (Topbar)**: Click on your avatar / name in the upper-right corner of the topbar.

---

## 3. Profile & Identity Management

### Changing Your Display Name
1. Open **My Account** and stay on the **Profile & Identity** tab.
2. Under **Personal Identity**, find the **Display name** input field.
3. Type your preferred full name (e.g., `Md. Kabir Hasan`).
4. Click **Save changes**.
5. Your updated name will instantly reflect across the Admin Portal, topbar, and in Team & Access listings without needing an administrator's intervention.

### Managing Your Profile Avatar (Photo)
- **Supported Formats**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), and WebP (`.webp`).
- **Maximum File Size**: 2 MB.
- **Uploading a Photo**:
  1. Click the **Upload new photo** button.
  2. Select an image file from your computer or phone.
  3. Maevelle automatically crops, squares, and optimizes your photo into a secure WebP image.
  4. Your new avatar appears immediately in the topbar user badge.
- **Removing Your Photo**:
  1. Click **Remove photo**.
  2. The system securely cleans up the stored image file and reverts your avatar to your personal initials (e.g., `KH`).

### Information You Cannot Change Personally
Under the **Organization & Access Boundaries** card, you can view:
- **Organization Name** (e.g., `Maevelle Bangladesh`)
- **Assigned Role** (e.g., `Finance Manager`, `Support Specialist`, `Administrator`)
- **Account Status** (e.g., `ACTIVE`)
- **Member Since** date

These fields are strictly read-only in My Account. Because they govern access control and security compliance across the business, only authorized administrators in **Team & Access** can modify your role or membership status.

---

## 4. Email Address & Verification

Your email address serves as your primary sign-in identity and the destination for critical security alerts.

### Understanding Verification Status
- <span style="color: #16a34a; font-weight: bold;">VERIFIED</span>: You have confirmed ownership of this email address. Your account is in good standing.
- <span style="color: #d97706; font-weight: bold;">UNVERIFIED</span>: You have not yet clicked the verification link sent to your inbox.
  - To verify, click **Resend link**. Check your inbox for an email from Maevelle and click the verification link.
  - Verification links expire after 24 hours. Rate limiting applies to prevent spamming.

### Secure Email Change Process
Changing your sign-in email is a security-sensitive procedure. Maevelle ensures your account cannot be hijacked by an unauthorized person:

1. Under **Change sign-in email**, enter your **New email address**.
2. Enter your **Current password** to prove fresh authentication.
3. Click **Request email change**.
4. **What happens next?**
   - Maevelle sends a secure verification link to your **new email address**.
   - Your account enters a **Pending email change** state.
   - You can continue signing in with your **old email address** until the new address is verified.
   - Once you click the link in the new inbox, your sign-in email updates canonically, a security confirmation notice is sent to your old inbox, and any other active sessions are revoked.
5. **Cancelling a Request**: If you made a mistake or changed your mind, click **Cancel email change request** in My Account.

> **What if I lost access to my current email?**
> If you no longer have access to your old email address, contact your Maevelle System Administrator. An administrator in Team & Access can assist with an authorized organizational recovery.

---

## 5. Password Management

### Changing Your Password
1. Navigate to the **Security & Password** tab.
2. Under **Change Account Password**, enter:
   - **Current password**: Your existing sign-in password.
   - **New password**: Must be **at least 12 characters** in length. Use a combination of uppercase, lowercase, numbers, and symbols for maximum strength.
   - **Confirm new password**: Re-type the exact new password.
3. **Session Revocation**: By default, the checkbox *"Sign out of all other active sessions and devices upon password change"* is checked. We strongly recommend keeping this checked to terminate any stale or compromised logins on other devices.
4. Click **Update password**.
5. You will receive an immediate email notification confirming that your password was updated. If you did not perform this action, contact support immediately.

---

## 6. Two-Factor Authentication (2FA)

Two-Factor Authentication adds an essential layer of security by requiring a 6-digit code from an Authenticator App (Google Authenticator, Apple Keychain, 1Password, Microsoft Authenticator) whenever you sign in.

- **Status**: Displays whether 2FA is `ENABLED` or `DISABLED`.
- **Organization Policy**: If your organization enforces mandatory 2FA, a notice will state: *"Required by Maevelle organization policy"*. Under this policy, you cannot disable 2FA.
- **Managing 2FA**:
  - Click **Open 2FA Console →** (or visit `/account/security`).
  - Here you can scan a QR code to configure an authenticator app, regenerate backup recovery codes, or verify your TOTP codes.

---

## 7. Active Sessions & Devices

The **Active Sessions** tab lets you monitor all computers, phones, and browsers currently signed in to your account.

### What is a Session?
Whenever you sign in to Maevelle on a browser (like Chrome on your laptop or Safari on your phone), a secure session is created.

### Inspecting Your Sessions
- **This Device**: Marked with a highlighted badge (`This device`). This is the current browser window you are using right now.
- **Other Devices**: Shows the browser name, operating system (e.g., `Chrome on Windows`, `Safari on iPhone`), IP address, and sign-in date.

### Revoking Sessions
- **Sign Out an Individual Device**: Next to any other session, click **Sign out**. That device is immediately disconnected and will require signing in again.
- **Sign Out Other Devices**: Click **Sign out other devices** at the top to disconnect all other computers and phones while keeping your current browser active. Use this if you forgot to sign out of a public or shared computer.
- **Sign Out Everywhere**: Disconnects **all** devices including the one you are currently using. You will be redirected to the login page immediately.

---

## 8. Security Activity Timeline

The **Security Timeline** tab displays an audit history of recent security-related actions on your account:
- Profile display name updates
- Profile photo uploads and removals
- Password changes
- Email verification requests and completions
- Email change requests
- 2FA setup and recovery code regeneration
- Device session revocations

This timeline provides transparency and allows you to quickly detect any unauthorized activity.
