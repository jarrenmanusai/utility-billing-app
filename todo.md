# UtilityBill — Project TODO

## Foundation
- [x] App branding: custom logo + app name in app.config.ts
- [x] Theme tokens (teal primary, PHP amber accent) in theme.config.js
- [x] Database schema (users, utilities, bills, billItems, payments, messages, notifications, authLogs, blocklist, apkReleases, resetTokens)
- [x] Custom email/password auth (JWT + bcrypt)
- [x] Role-based middleware (landlord/tenant/admin)
- [x] Auth context + secure token storage (AsyncStorage)
- [x] Role-based navigation (route groups)
- [x] Theme toggle (light/dark/system)
- [x] Offline indicator banner
- [ ] Hardware back button handler with confirm-exit at root (deferred — handled by OS default)

## Public / Auth Screens
- [x] Splash / index router by role
- [x] Login screen
- [x] Register screen (landlord sign-up → pending)
- [x] Password reset screen (token-based)
- [x] Get-App helper screen

## Landlord (22 actions)
- [x] L1-3: Register, Sign in, Sign out
- [x] L4-5: View own profile, Change password
- [x] L6: Add a tenant
- [x] L7: View tenant list
- [x] L8: Edit tenant info
- [x] L9: Reset tenant password
- [x] L10: Delete tenant
- [x] L11: Add utility type
- [x] L12: List utilities
- [x] L13: Edit utility
- [x] L14: Delete utility
- [x] L15: Create draft bill
- [x] L16: Add bill items per utility
- [x] L17: Attach reference photo of meter
- [x] L18: OCR meter photo (LLM auto-fills readings) — A8
- [x] L19: Save bill as draft
- [x] L20: Deploy bill to tenant
- [x] L21: Edit/delete bill
- [x] L22: Review payment proof, mark bill paid
- [x] L23: Open conversation with a tenant
- [x] L24: Send text + photo/file messages
- [x] L25: View notifications, mark all as read

## Tenant (10 actions)
- [x] T1-2: Sign in / Sign out
- [x] T3: Change password via reset link
- [x] T4: View list of bills
- [x] T5: Open a single bill receipt with line items + reference photo
- [x] T6: Upload payment proof (camera or gallery)
- [x] T7: Read messages from landlord
- [x] T8: Send text + photo/file messages
- [x] T9: View in-app notifications on new bill deployed
- [x] T10: Receive prompt on new APK version (release record exposed; native prompt depends on production APK)

## Admin (15 actions)
- [x] A1: Sign in (owner only, via OWNER_OPEN_ID)
- [x] A2: Review pending landlords
- [x] A3: Approve landlord
- [x] A4: Reject landlord
- [x] A5: Freeze landlord
- [x] A6: Unfreeze landlord
- [x] A7: Soft-delete landlord
- [x] A8: View deleted landlords
- [x] A9: Restore within 30 days / permanent delete
- [x] A10: Direct password reset
- [x] A11: Issue 24h reset link
- [x] A12: View last 50 auth attempts
- [x] A13: Add/remove blocklist domains, adjust caps
- [x] A14: Upload new APK (URL-based)
- [x] A15: View all releases / publish / delete
- [x] A16: View platform stats

## Smart Billing (A1-A10)
- [x] A1: Auto-detect previous reading from tenant's last bill
- [x] A2: Auto-clear previous on tenant change
- [x] A3: Live consumption math (current − previous, clamped)
- [x] A4: First-bill mode (treat previous as 0)
- [x] A5: Live amount math (consumption × rate)
- [x] A6: Live total math (sum of items)
- [x] A7: PHP currency formatting (₱1,234.56)
- [x] A8: OCR meter photo via vision LLM
- [x] A9: OCR fail-soft toast
- [x] A10: Tenant OCR → chat handoff (via chat photo upload)

## Build & Publish
- [x] EAS build configuration for Android (app.config.ts ready)
- [ ] Production APK/AAB build (run by user via Publish button)
- [x] Google Play publishing guide (PUBLISHING.md)

## User-Requested Adjustments (May 23, 2026)
- [x] Keep UI simple, minimal, not too complex
- [x] Use white background as default (light mode primary, no heavy gradients)
- [x] App icon: simple design with white background

## Tests
- [x] auth.logout cookie clearing
- [x] PHP currency formatter (A7)
- [x] Smart billing math (A3, A5, A6)

## User Feedback — Round 2 (May 23, 2026)
- [x] Register screen: show "Account created — pending admin approval" confirmation
- [x] Landlord tenant-create flow: show "Tenant account created" success confirmation with credentials summary
- [x] Admin console: fix text truncation on the Landlords moderation tab
- [x] Admin Overview stat cards: tapping a card (Landlords, Tenants, Bills, Revenue) navigates to the matching tab
- [x] Bump app version to 1.0.1 in app.config.ts

## User Feedback — Round 3 (Admin console)
- [x] Add web-safe confirmation dialog before destructive actions (delete, freeze, soft-delete, delete-forever)
- [x] Show visual feedback (loading state, success/error toast) on every admin button action
- [x] Cascade: when a landlord is soft-deleted, also soft-delete or detach their tenants (no orphan tenants)
- [x] Fix "Delete forever" action in Trash tab (cascades wipe tenants, bills, items, payments, convs, messages, notifications, tokens)
- [x] Bump app version to 1.0.2
- [x] Add vitest cascade-delete coverage (12 tests pass)

## User Feedback — Round 4 (Bill creation)
- [x] Bill new screen: utility picker per line item (now shows all utilities as chips with name + unit)
- [x] Bill new screen: tenant selector — vertical, always-visible list with checkmark
- [x] Bill new screen: replaced silent Alert.alert with toast + confirm dialog so save/deploy work on web
- [x] Tenant detail: "Create bill for this tenant" Quick Action that deep-links to bill form
- [x] Tenants list: inline "Bill" shortcut on each row
- [x] Bump app version to 1.0.3

## User Feedback — Round 5 (Bill creation UX)
- [x] Replace tenant picker with a real dropdown (modal-based, works on web + native)
- [x] Replace per-item utility picker with a dropdown menu (label + default rate shown)
- [x] When there are no utility types, Add Item button toasts + redirects to Utilities; empty state inside the items list also shows a Go to Utilities button
- [x] Bump app version to 1.0.4

## User Feedback — Round 8 (Versioning + About)
- [x] Renumber version from 1.0.12 → 1.1.2 (cap minor at 1.0.9 then roll to 1.1.0)
- [x] Create About App screen showing app version, build, credits to John Warren Perez
- [x] Link About from each role's Profile tab (Landlord, Tenant, Admin)
- [x] Expose version centrally via Constants.expoConfig.version (reads from app.config.ts)

## User Feedback — Round 9 (Branding + Version)
- [x] Rename product from UtilityBill to UtilityFlow across all screens
- [x] Single source-of-truth version constant (constants/app-version.ts) read by About + headers
- [x] Bump version to 1.1.3 and keep app.config.ts in sync (guarded by vitest)
- [x] About screen reads APP_VERSION dynamically so display is always accurate after deploy

## User Feedback — Round 10 (Smart due-date input)
- [x] Replace plain due-date text field with a native date picker (expo-compatible) as primary input
- [x] Add smart text-parse fallback: MM/DD = current year, MM/DD/YY = 2000s, ISO honoured, past-date rolls to next year
- [x] Live preview under the field showing "Due: May 30, 2026 (Saturday)"
- [x] Inline error toast if parsing fails
- [x] Vitest covering all the parsing edge cases
- [x] Bump app version

## User Feedback — Round 11 (Date autofill + format consistency)
- [x] Autofill suggestion chips when landlord types vague input (e.g. month-only, day-only, partial month)
- [x] All UI date displays use long "May 23, 2026" format — never MM/DD/YYYY or ISO
- [x] formatDate / formatDateTime helpers updated to long format for app-wide consistency
- [x] Web fallback for native picker uses HTML5 input type="date" since native picker is no-op on web
- [x] Vitest covers formatLongDate + suggestDates edge cases (month-only, day-only, partial, year-roll, invalid days, past-skip)
- [x] Bump version to 1.1.4

## User Feedback — Round 12 (Calendar button click fix)
- [x] Calendar button next to Due Date opens the picker reliably (web uses overlapping native HTML5 date input; iOS/Android use modal/inline picker)
- [x] Bump version to 1.1.5
