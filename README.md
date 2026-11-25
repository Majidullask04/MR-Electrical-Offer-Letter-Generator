# OfferLater — MR. ELECTRICAL WORKS

Internal employee offer-letter management platform for **MR. ELECTRICAL WORKS** (Turnkey Electrical Engineering & Contracting — Patancheru, Hyderabad, Telangana, India).

## Architecture

- **Frontend (`apps/web`)**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Radix UI / shadcn-style primitives, React Hook Form, Zod, TanStack Query.
- **Backend (`apps/api`)**: Python, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, WeasyPrint (A4 PDF rendering), Jinja2 `SandboxedEnvironment`, PyJWT + Argon2 (`pwdlib`), SlowAPI rate limiting.
- **Database**: PostgreSQL 17 (Docker locally on port `5433`, Neon PostgreSQL in production).
- **Storage & Email**: Private local filesystem storage (`STORAGE_DIR`, never exposed publicly) and a replaceable email provider (`console`, `smtp`, or `resend`).

## Key Modules

1. **Authentication & RBAC (`/login`)**: HttpOnly session cookies, double-submit CSRF cookie (`ol_csrf`), Argon2 password hashing, and three staff roles (`SUPER_ADMIN`, `HR_MANAGER`, `HIRING_MANAGER`).
2. **Dashboard (`/dashboard`)**: Lifecycle pipeline counts, pending approval queue, recent offers, 12-month trend chart, response rates, and position breakdown.
3. **Candidates (`/candidates`)**: Candidate registration, search, edit, active/inactive toggle, and role metadata.
4. **Offer Builder & Lifecycle (`/offers`, `/offers/new`, `/offers/[id]`, `/offers/[id]/edit`)**:
   - 5-step wizard: Candidate → Employment → Compensation (configurable earnings & deductions, no assumed statutory deductions) → Employment Terms → Review & Preview.
   - Strict lifecycle: `DRAFT → PENDING_APPROVAL → APPROVED → ISSUED / REISSUED → VIEWED → ACCEPTED / REJECTED` (plus `EXPIRED`, `WITHDRAWN`).
   - Immutable `OfferRevision` snapshots and server-rendered A4 PDFs stored privately.
5. **Approval Workflow (`/approvals`)**: Hiring Manager / Super Admin review, approve, or return-to-HR with required feedback.
6. **Templates & Content Blocks (`/templates`)**: Sandboxed HTML template editor, live preview, placeholder insertion, duplicate, default template selection, signatory overrides, and reusable `{{blocks.<key>}}` blocks.
7. **Reports (`/reports`)**: Date range, status, and position filters; acceptance/decline rates; time-to-accept; monthly and position breakdowns; formula-safe CSV export.
8. **Settings & Administration (`/settings`)**: Editable company profile & statutory fields (Udyam, GST, CIN), default employment clauses, staff user management, email outbox HTML inspector, background jobs (`expire`, `remind`), and filterable audit logs.
9. **Candidate Portal (`/offer/[token]`)**: No-login public portal backed by SHA-256 hashed high-entropy tokens, expiry enforcement, revocation on withdrawal/reissue, offer summary, compensation breakdown, joining instructions, sandboxed HTML letter preview, PDF download, and explicit click-through Accept / Reject confirmation (clearly distinguished from a legally certified electronic signature).

## Local Development

### 1. Start PostgreSQL

```bash
docker compose up -d db
```

### 2. Backend (`apps/api`)

```bash
cd apps/api
cp .env.example .env
# Install dependencies in .venv and run migrations + seed data:
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.seed
```

On macOS with Homebrew libraries (for WeasyPrint):

```bash
DYLD_LIBRARY_PATH=/opt/homebrew/lib ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 --reload
```

### 3. Frontend (`apps/web`)

```bash
cd apps/web
npm install
API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev
```

Open `http://localhost:3000`.

### Default Development Accounts (from `app/seed_data.py`)

Only use seeded credentials in local development; change or rotate all passwords in production:

- **Super Admin**: `admin@mrelectricalworks.in` / `OfferLater!2026`
- **HR Manager**: `hr@mrelectricalworks.in` / `HrManager!2026`
- **Hiring Manager**: `hiring@mrelectricalworks.in` / `HiringManager!2026`

## Testing & Quality Checks

### Backend tests (PostgreSQL test DB `offerlater_test` on port 5433)

```bash
DYLD_LIBRARY_PATH=/opt/homebrew/lib .venv/bin/python -m pytest apps/api/tests -v
```

### Frontend lint and production build

```bash
cd apps/web
npm run lint
npm run build
```

## Production Deployment

- **Database (Neon PostgreSQL)**: Provision a Neon database and set `DATABASE_URL` (`postgresql+psycopg://...`). Run `alembic upgrade head`.
- **Backend (Render)**:
  - Set `APP_ENV=production`, a strong random `SECRET_KEY`, `COOKIE_SECURE=true`, `FRONTEND_URL`, `CORS_ORIGINS`, `DATABASE_URL`, `STORAGE_DIR` (persistent disk), and `EMAIL_PROVIDER` (`smtp` or `resend` with credentials).
- **Frontend (Vercel)**:
  - Root directory: `apps/web`.
  - Set `API_PROXY_TARGET` (or `API_URL`) to the deployed Render backend origin so `/api/:path*` rewrites forward cookies on the same origin, or configure same-site domain cookies (`COOKIE_DOMAIN`).
