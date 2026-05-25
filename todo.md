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

## User Feedback — Round 13 (Calendar button full-area click)
- [x] Entire calendar button (including padding) now opens the date picker, not just the icon
- [x] Refactored button: visual layer (icon + border) is pointer-events:none; HTML5 input fills 100% on web; Pressable absolute-fill on native
- [x] Bump version to 1.1.6

## User Feedback — Round 14 (Receipt-style bill view)
- [x] Build shared BillReceipt component (header, line items, totals, status, due date, payment proof)
- [x] Receipt is openable by both landlord and tenant from their respective bill rows
- [x] Visual: monospaced/receipt-feel layout — landlord name on top, tenant below, period, line-by-line items with consumption/rate/amount, divider, total, paid/unpaid badge, due date, optional notes, payment proof image
- [x] Server detail endpoints now return both landlord & tenant info plus enriched utility for line items
- [x] Bump version to 1.2.0

## User Feedback — Round 15 (Past-date guardrails for Due Date)
- [x] Reject any explicitly-typed past date (e.g. "01/01/2020", "6/15/01", "2025-12-31") with a specific "That date is in the past" error
- [x] Smarter 2-digit year normalization: "26" → 2026 stays current-century, but values that would land >5 years in the past trip the past-rejection rule
- [x] All inferred-year fallbacks (MM/DD, "May 30") roll forward strictly after today
- [x] Native iOS/Android picker uses `minimumDate={today}` so the user can't even scroll to past dates
- [x] Web HTML5 `<input type="date">` uses `min={today}` so browsers grey out past days
- [x] Defense-in-depth: `handleWebInputChange` re-checks the value against today and silently rejects
- [x] All `suggestDates` outputs guaranteed to be today-or-later
- [x] Vitest expanded to 26 date-parse tests (44 total)
- [x] Bump version to 1.2.1

## User Feedback — Round 16 (Tappable Home overview cards)
- [x] Tenants stat card → switches to Tenants tab
- [x] Unpaid stat card → Bills tab pre-filtered to "Unpaid" (deployed status)
- [x] This-month revenue card → Bills tab pre-filtered to "Paid"
- [x] Bills tab gains filter chips: All / Unpaid / Paid / Draft (synced with Home navigation)
- [x] Bottom-bar tap on "Bills" resets the filter to "All"
- [x] Stat cards show chevron + press feedback (scale 0.98, opacity 0.7) so they read as interactive
- [x] Empty-state copy adapts to active filter (e.g. "No unpaid bills")
- [x] Bump version to 1.2.2

## User Feedback — Round 17 (Filter chip redesign)
- [x] Fix vertical-stretch bug — chips now have fixed `height: 36` and the row container has fixed `height: 52`
- [x] Compact pill design with icon + label + count badge inline
- [x] Inline counts: All (n) / Unpaid (n) / Paid (n) / Draft (n) — auto-hidden when zero
- [x] Inactive state: subtle outlined pill on `surface` background; active state: filled tint with white text + translucent count chip
- [x] Each chip shows a relevant icon — grid (All), clock (Unpaid), check-circle (Paid), pencil (Draft) — for at-a-glance scanning
- [x] Light press feedback (opacity 0.75) without scale transforms that could distort the row
- [x] Bump version to 1.2.3

## User Feedback — Round 18 (Premium emojis + attachment fix in chat)
- [x] Build EmojiPicker component with categorised premium emoji set + recents + search
- [x] Fix attachment button so it actually opens device photo library (web hidden input + native picker without falsely-denied permission pre-check)
- [x] Camera permission asks with friendly fallback alert
- [x] Reuse existing /api/upload + storage proxy path
- [x] Wired into landlord chat (via shared ChatView)
- [x] Wired into tenant chat (via shared ChatView)
- [x] Caret-aware emoji insertion + persisted recents (AsyncStorage)
- [x] Bump version to 1.3.0

## User Feedback — Round 19 (Chat notifications)
- [x] Server: every chat send (landlord→tenant, tenant→landlord) now writes a `chat_message` notification row for the recipient with title, 80-char body preview (📎 fallback for attachment-only), and `{conversationId}` payload
- [x] Bell badge auto-refreshes via 8-second polling so unread counts update without manual refresh
- [x] Dedicated unread-chat count badge on the Chat tab icon (landlord & tenant)
- [x] Foreground in-app toast banner when a new chat notification arrives and recipient is on a different tab
- [x] First-load seeding so historical alerts don't all toast on app open
- [x] Bump version to 1.3.3

## User Feedback — Round 20 (Upload "Missing file" 400 fix)
- [x] Rewrite `parseMultipart` in server/_core/index.ts — robust per-part walker via `indexOf(dashBoundary)` instead of fragile incremental cursor
- [x] Boundary regex now strips quotes (some clients send `boundary="----xxx"`)
- [x] Tolerate quoted *and* unquoted `name=` and `filename=` parameters
- [x] Empty-body and zero-part diagnostic logs added so future failures are debuggable
- [x] Bump version to 1.3.4

## User Feedback — Round 21 (Notification deep-links + per-row mark-read)
- [x] Server: added owner-scoped `notifications.markOneRead({ id })` mutation for both landlord and tenant routers, plus `db.markNotificationRead(userId, id)` helper
- [x] Built shared `NotificationRow` component that decodes the JSON `payload` and routes by type — chat_message → `/landlord/chat/[id]` or `/tenant?tab=chat`, bill_deployed/payment_verified → `/tenant/bills/[id]`, payment_uploaded → `/landlord/bills/[id]`
- [x] Added a dedicated checkmark button on each unread row that marks just that one alert read (independent of the bulk action)
- [x] Tapping a row auto-marks-read AND deep-links in one motion
- [x] Removed the always-on auto-mark-read effect on the landlord screen so unread state is now meaningful
- [x] Optimistic update so the blue dot disappears instantly
- [x] Helper hint: "Tap any alert to open it, or use the checkmark to clear."
- [x] Bump version to 1.3.5

## User Feedback — Round 22 (Deleted-bill stuck loading + tenant receipt download)
- [x] Tenant bill detail no longer hangs on "Loading…" when the bill was deleted — distinguishes `q.isError` with NOT_FOUND code and shows a clear "Bill no longer available" empty state with a "Back to alerts" button
- [x] Disabled retries on NOT_FOUND so the spinner doesn't sit through 3 needless re-fetches
- [x] Same not-found handling mirrored on landlord bill detail
- [x] Added `lib/receipt-export.ts` that builds inline-styled HTML and uses **expo-print** + **expo-sharing** for native PDF + share-sheet, and `Print.printAsync({ html })` on web (→ "Save as PDF" / printer dialog)
- [x] Tenant bill detail gains "Download / share receipt" button
- [x] Landlord bill detail also gains the same button (symmetric capability)
- [x] Bump version to 1.3.6

## User Feedback — Round 23 (Admin APK deploy + in-app update prompts)
- [x] Server: extend `admin.releases.publish` to fan out an `app_update` notification to every active landlord and tenant on publish
- [x] Server: add `admin.releases.deploy` convenience that uploads-then-publishes-then-notifies in one mutation
- [x] Server: helper `listActiveLandlordAndTenantIds` for the fan-out target list (excludes admins, pending, frozen, deleted)
- [x] Server: bump `/api/upload` size limit from 25 MB to 100 MB so APKs fit
- [x] Client: new `lib/upload-file.ts` for generic file pick + upload (uses `expo-document-picker` on native, hidden `<input type=file>` on web)
- [x] Admin Releases tab redesigned as "App updates": dashed dropzone for APK pick, auto-fill of APK URL after upload, version + notes fields, single Deploy button with confirm + success toast announcing notified user count
- [x] `NotificationRow` deep-links `app_update` notifications to `/get-app` and uses the download icon
- [x] Persistent `UpdateBanner` mounted globally in `app/_layout.tsx`: polls `public.liveRelease` every 60s, shows pill-shaped CTA when server version > installed `APP_VERSION`, opens APK URL via `Linking.openURL` on Android, falls back to `/get-app` elsewhere, supports per-version dismissal via AsyncStorage, and stays out of `/login`/`/register`/`/reset`/`/get-app` to avoid double UI
- [x] `/get-app` shows current installed version, "UPDATE" pill when newer, "You already have the latest" reassurance when not, and a non-Android-only hint
- [x] New vitest `tests/update-banner.test.ts` guards the semver compare logic that decides when to show the banner
- [x] Bump version to 1.4.0 (significant feature)
- [x] 48/48 tests pass, typecheck clean

## User Feedback — Round 24 (Chat photo lightbox)
- [x] Tapping a chat photo (landlord or tenant) now opens a full-screen lightbox modal
- [x] Lightbox uses Image.getSize + resizeMode="contain" so the entire image is visible regardless of aspect ratio (no cropping)
- [x] Tap anywhere on backdrop or the close button to dismiss; Android hardware back also dismisses
- [x] Added a small expand glyph overlay on chat thumbnails so the action is discoverable
- [x] Mapped `arrow.up.left.and.arrow.down.right` → MaterialIcons `open-in-full`
- [x] Bump version to 1.4.1
