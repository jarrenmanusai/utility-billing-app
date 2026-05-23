# UtilityBill — Mobile App Design Specification

## Brand & Identity

**App Name:** UtilityBill
**Tagline:** Smart utility billing for landlords and tenants
**Target Platform:** Android (primary) + iOS (compatible)
**Orientation:** Portrait, one-handed mobile use
**Design language:** Apple HIG-aligned, iOS-native feel

### Design Philosophy
**Simple. Clean. White.** Minimal visual noise, generous whitespace, single accent color. The app should feel as straightforward as a calculator — no gradients, no shadows beyond a subtle 1px hairline, no decorative elements.

### Color Palette (Brand-specific, simple)
- **Primary (accent only):** `#0EA5A4` (Teal) — used sparingly on primary buttons and active states
- **Background:** `#FFFFFF` (pure white, always)
- **Surface (cards):** `#FFFFFF` with 1px border `#E5E7EB`
- **Foreground (text):** `#111827` (near-black)
- **Muted text:** `#6B7280`
- **Border / dividers:** `#E5E7EB`
- **Success:** `#22C55E`
- **Warning:** `#F59E0B`
- **Error:** `#EF4444`
- **Dark mode:** background `#0B0F19`, foreground `#F9FAFB` (still minimal, no embellishment)

---

## User Roles & Home Screens

| Role | Home Screen | Tab Bar |
|------|-------------|---------|
| Landlord | `/(landlord)/dashboard` | Bills, Tenants, Chat, More |
| Tenant | `/(tenant)/bills` | Bills, Chat, Notifications, Profile |
| Admin | `/(admin)/console` | Moderation, Releases, Stats, Settings |

---

## Screen List (10 core + sub-routes)

### Public / Auth
1. **Splash / Index (`/`)** — Routes user by role from saved session
2. **Login (`/login`)** — Email + password form
3. **Register (`/register`)** — Landlord-only sign-up (goes to pending state)
4. **Password Reset (`/reset`)** — Token-based reset (24h link from admin)
5. **Get App (`/get-app`)** — APK install helper for fresh devices

### Landlord (after auth)
6. **Landlord Dashboard (`/(landlord)/dashboard`)** — Stats cards, recent bills, quick actions
7. **Tenants (`/(landlord)/tenants`)** — List + Add/Edit/Reset/Delete
8. **Utilities (`/(landlord)/utilities`)** — Manage utility types (Electric, Water, Internet, etc.)
9. **Bill Create/Edit (`/(landlord)/bills/new`, `/(landlord)/bills/[id]/edit`)** — Smart billing form with OCR
10. **Bill Detail (`/(landlord)/bills/[id]`)** — Review payment proof, mark as paid
11. **Chat List (`/(landlord)/chat`)** — Conversations with tenants
12. **Chat Conversation (`/(landlord)/chat/[tenantId]`)** — Message thread
13. **Notifications (`/(landlord)/notifications`)** — In-app alerts
14. **Profile (`/(landlord)/profile`)** — View profile, change password

### Tenant (after auth)
15. **Tenant Bills (`/(tenant)/bills`)** — List of bills (status badges)
16. **Bill Receipt (`/(tenant)/bills/[id]`)** — Line items, meter photo, pay button
17. **Pay (`/(tenant)/bills/[id]/pay`)** — Upload payment proof
18. **Tenant Chat (`/(tenant)/chat`)** — Single conversation with landlord
19. **Tenant Notifications (`/(tenant)/notifications`)**
20. **Tenant Profile (`/(tenant)/profile`)**

### Admin (after auth)
21. **Admin Console (`/(admin)/console`)** — Overview
22. **Moderation (`/(admin)/moderation`)** — Pending landlords, approve/reject/freeze
23. **Trash (`/(admin)/trash`)** — Soft-deleted landlords, restore/permanent-delete
24. **Resets (`/(admin)/resets`)** — Issue password reset links
25. **Anti-Spam (`/(admin)/antispam`)** — Auth log, blocklist domains, caps
26. **Releases (`/(admin)/releases`)** — APK uploads, publish/delete
27. **Stats (`/(admin)/stats`)** — Platform totals

---

## Primary Content & Functionality

### Landlord Dashboard
- **Stats row**: Total tenants, Unpaid bills, This month's revenue (₱)
- **Recent activity feed**: latest bills with status badges
- **Quick action FAB**: "Create Bill" → bill form

### Bill Creation (Smart Billing — A1-A10)
- **Tenant dropdown** → triggers `auto-clear` of previousReadings (A2)
- **Add Line Item button** → picks utility → A1 pre-fills `previousReading` from history
- **Per-item fields**: Utility, Previous (auto, dimmed), Current (input), Rate (₱/unit), Consumption (computed badge), Amount (computed badge in ₱)
- **Meter photo attachment**: Camera or gallery → OCR button → LLM reads digits → inline chip with confidence (high/medium/low) (A8)
- **OCR result chip**: shows extracted reading; tap to apply; X to dismiss
- **Footer total**: Sum of line items in ₱ (A6, A7)
- **Action row**: Save Draft, Deploy to Tenant, Cancel

### Tenant Bill Receipt
- **Header card**: Total amount in large ₱ format, due date, status badge
- **Line items table**: Utility | Previous → Current = Consumption × Rate = Amount
- **Meter photo**: tap to expand
- **Pay button**: Opens payment proof upload (camera/gallery)

### Chat
- **Message bubbles** with text + attachment thumbnails
- **Composer**: Text input, attach photo, attach file, send
- **OCR handoff (A10)**: On tenant side, an "OCR + Send to Landlord" button on payment receipts

### Admin Moderation
- **Tabs**: Pending | Approved | Frozen | Trash
- **Landlord card**: name, email, registration date, action buttons (Approve, Reject, Freeze, Soft-delete)

---

## Key User Flows

### Flow 1: Landlord Onboarding
```
/register → enter email/password/name → submit
→ "Account pending admin approval" screen
→ (Admin approves) → next login succeeds → /landlord/dashboard
```

### Flow 2: Tenant Onboarding
```
Landlord opens /tenants → tap "+" → enter tenant info & set initial password
→ Landlord shares credentials manually with tenant
→ Tenant goes to /login → enters credentials → /tenant/bills
```

### Flow 3: Smart Bill Creation
```
/landlord/bills/new → pick tenant (A2 clears) → add line item
→ pick utility (A1 fills previous) → enter current + rate (A3, A5 live math)
→ attach meter photo → OCR (A8) → confirm reading
→ Save Draft OR Deploy → tenant gets notification
```

### Flow 4: Payment Flow
```
Tenant /tenant/bills → tap bill → /tenant/bills/[id] (receipt view)
→ tap "Pay" → /tenant/bills/[id]/pay → camera or gallery
→ upload proof → optional OCR (A10) → "Send to landlord via chat"
→ landlord sees proof in /bills/[id] → tap "Mark as Paid"
```

### Flow 5: Admin Approval
```
Admin /admin/moderation → Pending tab → review landlord card
→ Approve (or Reject/Freeze) → landlord can now sign in
```

---

## Cross-Cutting UX

1. **Theme toggle** — Settings screen has Light / Dark / System
2. **Offline indicator** — Sticky banner at top when network drops ("You're offline")
3. **Hardware back button** — Pop in-app history; at root, prompt "Exit app?"
4. **Self-update** — Banner on home screens when newer APK is available
5. **Haptics** — Light impact on button taps, success on bill deploy, error on failed actions
6. **Loading states** — Skeleton cards on lists, spinner overlays on saves
7. **Empty states** — Friendly illustrations + CTA for empty lists

---

## Data Models (high-level)

| Entity | Key Fields |
|--------|-----------|
| User | id, email, passwordHash, name, role (landlord/tenant/admin), status (pending/active/frozen/deleted), landlordId (for tenants), createdAt, deletedAt |
| Utility | id, landlordId, name, unit (kWh, m³, etc.), defaultRate |
| Bill | id, landlordId, tenantId, status (draft/deployed/paid), totalAmount, dueDate, meterPhotoUrl, deployedAt, paidAt |
| BillItem | id, billId, utilityId, previousReading, currentReading, rate, consumption, amount |
| Payment | id, billId, proofUrl, uploadedAt, verifiedAt |
| Message | id, conversationId, senderId, text, attachmentUrl, createdAt |
| Notification | id, userId, type, title, body, payload, readAt, createdAt |
| AuthLog | id, email, ip, success, attemptedAt |
| Blocklist | id, domain |
| ApkRelease | id, version, fileUrl, notes, publishedAt, isLive |
| ResetToken | id, userId, token, expiresAt, usedAt |

---

## Typography & Spacing

- **Font**: System default (San Francisco on iOS, Roboto on Android)
- **Hierarchy**: 32/28/22/17/15/13 px (Display/Title/Heading/Body/Caption/Footnote)
- **Spacing scale**: 4, 8, 12, 16, 20, 24, 32 (matches Tailwind defaults)
- **Border radius**: 12 (cards), 8 (buttons), 999 (pills/badges)

---

## Native Capabilities Required

- `expo-image-picker` — Camera + gallery for meter & payment photos
- `expo-secure-store` — JWT token storage
- `expo-notifications` — In-app + push notifications
- `expo-network` — Offline detection
- `expo-haptics` — Tap feedback
- `expo-file-system` — Local cache, file uploads
- `expo-linking` — Deep links for password reset

---

## Acceptance Criteria

A delivery is acceptable when:
- All 47 actions are reachable and functional
- Smart billing (A1–A10) works exactly as specified
- Custom auth (email/password) with role-based routing
- All 3 dashboards render correctly in light + dark mode
- Offline indicator appears on network drop
- Hardware back behavior matches spec
- APK build is producible via EAS
