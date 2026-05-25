# UtilityFlow Backend Service

A standalone backend API for smart utility billing — managing landlords, tenants, bills, payments, and messaging. This service is designed to be consumed by any client (web, mobile, or third-party integrations) via its tRPC API.

## Architecture

The backend is built on the following stack:

| Component | Technology |
| :--- | :--- |
| Runtime | Node.js 22+ |
| Framework | Express.js |
| API Layer | tRPC v11 |
| Database | MySQL 8.0+ |
| ORM | Drizzle ORM |
| Auth | JWT (HS256, 30-day tokens) |
| Validation | Zod |
| OCR | OpenAI-compatible LLM API |
| Storage | S3-compatible via presigned URLs |

## Features

The service implements the following domain capabilities:

**Authentication and Authorization** — Email/password registration for landlords with CAPTCHA (math challenge + honeypot + time-to-submit), JWT login for all roles, password reset via token, and role-based access control (landlord, tenant, admin).

**Landlord Operations** — Tenant CRUD, utility type management, bill creation with auto-calculated consumption and amounts, bill deployment with tenant notification, payment confirmation, meter image OCR, and dashboard statistics.

**Tenant Operations** — View deployed/paid bills, submit payment proof, chat with landlord, and manage notifications.

**Admin Operations** — Landlord approval/rejection, account freeze/unfreeze, soft and permanent deletion with full cascade, domain blocklist management, auth log review, platform statistics, and broadcast notifications.

**Philippine-Specific Validations** — Phone numbers are validated and normalized to E.164 format for PH mobile numbers. Email validation includes disposable domain blocking and TLD typo detection.

## Getting Started

### Prerequisites

Ensure you have the following installed:

- Node.js 22.x or later
- MySQL 8.0 or later
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd utility-billing-backend

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### Database Setup

```bash
# Run the initial migration
mysql -u root -p < drizzle/0000_init.sql

# Or use Drizzle Kit to push schema
pnpm db:push
```

### Seed Admin User

```bash
pnpm seed:admin --email admin@example.com --password your-secure-password --name "Admin"
```

### Run Development Server

```bash
pnpm dev
```

The server will start on port 3000 (or the port specified in `.env`).

### Build for Production

```bash
pnpm build
pnpm start
```

## API Endpoints

### REST Endpoints

| Method | Path | Description |
| :--- | :--- | :--- |
| GET | `/api/health` | Health check |
| GET | `/api/version` | Server version info |
| POST | `/api/upload` | File upload (requires auth) |

### tRPC API (`/api/trpc`)

All tRPC procedures are accessible at `/api/trpc/<router>.<procedure>`.

**Auth Router** (`auth.*`)

| Procedure | Type | Description |
| :--- | :--- | :--- |
| `auth.captcha` | query | Get CAPTCHA challenge |
| `auth.register` | mutation | Landlord registration |
| `auth.login` | mutation | Email/password login |
| `auth.requestPasswordReset` | mutation | Request password reset |
| `auth.resetPassword` | mutation | Reset password with token |
| `auth.me` | query | Get current user profile |

**Landlord Router** (`landlord.*`)

| Procedure | Type | Description |
| :--- | :--- | :--- |
| `landlord.listTenants` | query | List all tenants |
| `landlord.createTenant` | mutation | Create a new tenant |
| `landlord.updateTenant` | mutation | Update tenant details |
| `landlord.deleteTenant` | mutation | Soft-delete a tenant |
| `landlord.listUtilities` | query | List utility types |
| `landlord.createUtility` | mutation | Create utility type |
| `landlord.updateUtility` | mutation | Update utility type |
| `landlord.deleteUtility` | mutation | Delete utility type |
| `landlord.listBills` | query | List all bills |
| `landlord.getBill` | query | Get bill with items and payments |
| `landlord.getPreviousReading` | query | Get last reading for tenant/utility |
| `landlord.createBill` | mutation | Create bill with line items |
| `landlord.deployBill` | mutation | Deploy bill to tenant |
| `landlord.markBillPaid` | mutation | Mark bill as paid |
| `landlord.deleteBill` | mutation | Delete a draft/deployed bill |
| `landlord.ocrMeterImage` | mutation | Extract reading from meter image |
| `landlord.listConversations` | query | List chat conversations |
| `landlord.getMessages` | query | Get messages in conversation |
| `landlord.sendMessage` | mutation | Send message to tenant |
| `landlord.listNotifications` | query | List notifications |
| `landlord.markAllNotificationsRead` | mutation | Mark all as read |
| `landlord.markNotificationRead` | mutation | Mark one as read |
| `landlord.stats` | query | Dashboard statistics |

**Tenant Router** (`tenant.*`)

| Procedure | Type | Description |
| :--- | :--- | :--- |
| `tenant.listBills` | query | List deployed/paid bills |
| `tenant.getBill` | query | Get bill details |
| `tenant.submitPayment` | mutation | Submit payment proof |
| `tenant.getMessages` | query | Get chat messages |
| `tenant.sendMessage` | mutation | Send message to landlord |
| `tenant.listNotifications` | query | List notifications |
| `tenant.markAllNotificationsRead` | mutation | Mark all as read |
| `tenant.markNotificationRead` | mutation | Mark one as read |

**Admin Router** (`admin.*`)

| Procedure | Type | Description |
| :--- | :--- | :--- |
| `admin.listLandlords` | query | List landlords (filterable by status) |
| `admin.approveLandlord` | mutation | Approve pending landlord |
| `admin.rejectLandlord` | mutation | Reject and delete pending landlord |
| `admin.freezeLandlord` | mutation | Freeze a landlord |
| `admin.unfreezeLandlord` | mutation | Unfreeze a landlord |
| `admin.softDeleteLandlord` | mutation | Soft-delete landlord + tenants |
| `admin.permanentDeleteLandlord` | mutation | Permanent cascade delete |
| `admin.listTrashedLandlords` | query | List soft-deleted landlords |
| `admin.restoreLandlord` | mutation | Restore soft-deleted landlord |
| `admin.listAuthLogs` | query | View auth attempt logs |
| `admin.listBlocklist` | query | View blocked domains |
| `admin.addBlockedDomain` | mutation | Block an email domain |
| `admin.removeBlockedDomain` | mutation | Unblock a domain |
| `admin.getSettings` | query | Get platform settings |
| `admin.updateSettings` | mutation | Update settings |
| `admin.stats` | query | Platform-wide statistics |
| `admin.broadcastNotification` | mutation | Send notification to all users |

## Environment Variables

| Variable | Required | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | MySQL connection string |
| `JWT_SECRET` | Yes | Secret for JWT and CAPTCHA signing |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |
| `OPENAI_API_KEY` | No | For OCR meter reading extraction |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible endpoint |
| `STORAGE_API_URL` | No | S3-compatible storage API |
| `STORAGE_API_KEY` | No | Storage API key |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (production) |

## Project Structure

```
├── src/
│   ├── index.ts              # Express server entry point
│   ├── db/
│   │   ├── schema.ts         # Drizzle ORM schema definitions
│   │   └── index.ts          # Data access layer (queries)
│   ├── routers/
│   │   ├── index.ts          # Root tRPC router
│   │   ├── auth.ts           # Public auth endpoints
│   │   ├── landlord.ts       # Landlord-scoped endpoints
│   │   ├── tenant.ts         # Tenant-scoped endpoints
│   │   └── admin.ts          # Admin-scoped endpoints
│   ├── services/
│   │   ├── auth.ts           # JWT, bcrypt, token utilities
│   │   ├── env.ts            # Environment configuration
│   │   ├── llm.ts            # LLM/OCR integration
│   │   └── storage.ts        # File storage abstraction
│   ├── utils/
│   │   ├── captcha.ts        # Stateless CAPTCHA system
│   │   └── validation.ts     # Email & phone validators
│   └── middlewares/
│       └── trpc.ts           # tRPC context, middleware, procedures
├── drizzle/
│   └── 0000_init.sql         # Initial database migration
├── scripts/
│   └── seed-admin.ts         # Admin user seeding script
├── tests/                    # Test files
├── drizzle.config.ts         # Drizzle Kit configuration
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

## License

Private — All rights reserved.
