# FoodBridge

**Connecting surplus food with the people who need it, before time runs out.**

FoodBridge is a hyperlocal food-rescue platform that connects restaurants, college canteens, banquet halls, grocery stores and community kitchens with verified NGOs, food banks and volunteers — and makes every rescue traceable, from listing to a code-verified handover.

Built by **Team Nexorithm** · Category: Food-Expiry Rescue & Local Surplus Exchange.

> FoodBridge coordinates food redistribution. It does **not** certify food safety. Participating organizations remain responsible for applicable food-safety requirements (in India, FSSAI).

---

## Features

| Area | What works |
|---|---|
| Auth & roles | Email/password signup & login (Supabase Auth), session persistence, protected routes, role-aware navigation. Roles: donor, receiver, volunteer, admin. Admin can **never** be self-assigned (enforced in the database). |
| Listings | Create / edit / cancel with full validation (Zod + DB constraints): pickup window must end before the safe-use deadline, no past deadlines, positive quantities, mandatory handling declaration, allergens, storage, packaging, coordinates & pickup radius. |
| Live expiry | Countdowns derived from persisted UTC timestamps (green → amber → red → expired). Overdue listings are treated as expired by every query and RPC, even before the status row is synchronised. |
| Smart matching | Deterministic, explainable algorithm (`src/lib/matching.ts`): hard filters (deadline, pickup window, verification, storage, capacity, radius, demo isolation) then a weighted score (distance via Haversine, urgency, quantity fit, storage fit, feasibility). Server re-checks every hard constraint. |
| Requests | Receivers request; donors accept/reject. Acceptance locks the listing row, creates the pickup and closes competing requests in one transaction; a partial unique index guarantees one accepted receiver per listing. |
| Handover verification | Donor generates a one-time 6-digit code (server-side, `gen_random_bytes`), stored **only as a bcrypt hash**; 30-minute expiry, 5 attempts, invalidated on regeneration, no reuse. Collector enters it → *Collected*; receiver confirms receipt → *Verified*. |
| Volunteers | Receivers assign volunteers; volunteers see only their assigned pickups, mark en-route/arrived and complete the code handover. |
| Notifications | Stored in Postgres, written by DB functions. Bell + unread count + list + mark read. Supabase Realtime with 30-second polling fallback. |
| Impact analytics | `get_impact_stats()` computes everything in SQL. Only verified handovers count as rescued; kg and litres are never mixed; CO₂e is a labelled estimate. Recharts dashboards. |
| Audit trail | Append-only `audit_events` written by triggers/RPCs; clients cannot insert, update or delete (privileges + trigger). Visible per listing and in the admin console. |
| Admin | Organization verification queue, listing moderation, pickup monitor, audit log. |
| Demo | Four one-click demo accounts with fictional Vijayawada / VIT-AP organizations, isolated from real data (`is_demo`). The demo admin can only see and moderate demo records. |

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Radix) · Lucide · React Router · React Hook Form · Zod · Recharts · date-fns · Sonner · Supabase (Postgres, Auth, RLS, Realtime) · Vitest · React Testing Library · PGlite (real Postgres in WASM for database tests).

---

## Quick start (local)

Prerequisites: Node 20+ and a free Supabase project (no credit card needed).

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run dev                     # http://localhost:5173
```

### 1. Create a Supabase project
1. Sign up at <https://supabase.com> (free tier) → **New project**.
2. **Project Settings → API**: copy the *Project URL* and the *anon / publishable* key into `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Copy the *service_role / secret* key into `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`. **This key is only used by the local seed script. Never prefix it with `VITE_` and never commit it.**

### 2. Database setup (choose one)

**Option A — SQL editor (no extra tools):** open `supabase/setup.sql`, paste it into **Supabase Dashboard → SQL Editor**, and run it once on a fresh project.

**Option B — migration runner:** add `DATABASE_URL` (Project Settings → Database → Connection string → *Session pooler* URI) to `.env.local`, then:

```bash
npm run db:migrate
```

Migrations live in `supabase/migrations/` (schema → security/RLS → workflow RPCs → demo seed function). `npm run db:bundle` regenerates `supabase/setup.sql` from them.

### 3. Auth settings
- **Authentication → URL Configuration**: set *Site URL* to your app URL (e.g. `http://localhost:5173`, later your Vercel URL) and add both to *Redirect URLs*.
- **Email confirmation:** Supabase's built-in email sender is heavily rate-limited on the free tier. For a hackathon, consider disabling **Authentication → Sign In / Providers → Email → Confirm email**. The app handles both modes (it shows a "check your email" screen when confirmation is required).

### 4. Seed the demo
```bash
npm run seed:demo
```
Creates/refreshes four demo accounts and resets all demo data (safe to re-run anytime, e.g. after judges have used it). Real records are never touched.

### 5. Make yourself a real admin (optional)
Sign up normally, then run in the SQL editor:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

---

## Demo accounts

All use password **`FoodBridge-Demo-2026`** (also available as one-click buttons on `/login`).

| Role | Email | Organization |
|---|---|---|
| Donor | `demo.donor@foodbridge.test` | Central Canteen (VIT-AP) |
| Receiver | `demo.receiver@foodbridge.test` | Community Food Collective (Undavalli) |
| Volunteer | `demo.volunteer@foodbridge.test` | — |
| Admin (demo-scoped) | `demo.admin@foodbridge.test` | Moderates demo records only |

All demo organizations and records are fictional and marked with a **Demo** badge. Demo users can only interact with demo records, so a public demo cannot affect real activity; `npm run seed:demo` restores it.

### End-to-end walkthrough (≈5 minutes)
1. **Donor** → *My Listings → New listing*: create a listing (try an invalid pickup window to see validation). Or open **Idli & Sambar Breakfast**, which already has two pending requests.
2. **Receiver** → *Matches*: see ranked listings with scores and explanations; expand *not eligible* to see hard filters (e.g. *Frozen Parathas* needs a freezer; *Wedding Buffet* exceeds capacity). Request a listing.
3. **Donor** → *Requests*: accept it (competing requests are auto-declined; a pickup is created).
4. **Receiver** → *Pickups*: assign **Demo Volunteer** (or collect yourselves).
5. **Donor** → *Pickups → Handover code*: generate the 6-digit code.
6. **Volunteer** → *Pickups → Enter handover code* (try a wrong code first to see the attempt counter) → status *Collected*.
7. **Receiver** → *Pickups → Confirm receipt* → *Verified*. Open **Impact** — verified meals increase; listed/accepted food never does.
8. **Admin** → *Admin console*: verify *Local Relief Network*, browse the audit log, moderate a listing.

Notifications appear in the bell at every step (realtime when available).

---

## Testing

```bash
npm run test        # unit + component + database tests (Vitest)
npm run test:db     # database tests only
npm run typecheck
npm run lint
npm run build
```

- **Database tests** (`tests/db/`) run the real migrations against **PGlite** (Postgres compiled to WASM) with a stub of Supabase's `auth` schema and API roles, then exercise RLS, column privileges and every workflow RPC *as different users*: unauthorized edits, self-approval, privilege escalation, expired listings, storage/capacity/radius rules, exclusive acceptance, code hashing, wrong/expired/reused codes, attempt lockout, audit immutability, verified-only impact metrics and demo isolation.
- **Unit tests** cover Haversine distance, eligibility filters, scoring, ranking and countdown logic.
- **Component tests** cover login validation, demo sign-in buttons, countdown rendering and route guards.

Limitations of the test setup: PGlite is single-connection, so concurrent acceptance is verified through the row-lock design plus the `food_requests_one_accepted` unique index (tested directly), not by two simultaneous sessions. Supabase Realtime and email delivery are not covered by automated tests.

---

## Security & secrets

| Variable | Used by | Browser-safe |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | Yes |
| `VITE_SUPABASE_ANON_KEY` | frontend (anon or `sb_publishable_` key) | Yes — RLS enforces permissions |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/seed-demo.mjs` only | **No** — never `VITE_`, never in Vercel |
| `DATABASE_URL` | `scripts/db.mjs` only | **No** — contains the DB password |

Safeguards: `.gitignore` excludes every `.env*` file except `.env.example`; the Vite build **fails** if a `VITE_` variable looks like a server secret or if `VITE_SUPABASE_ANON_KEY` holds a service-role/`sb_secret_` key, and the browser client refuses such a key at runtime; source maps are disabled; `npm run security:scan` scans source, config and `dist/` and reports locations only (never values). All tables use RLS; anonymous visitors can read only open listings and limited organization columns; the `private` schema must **not** be added to Supabase's *Exposed schemas*.

Offline demo mode (no Supabase configured) runs entirely in the browser on fictional data. It is selected at build time and cannot affect or bypass the live backend, whose authorization lives in the database.

## Deployment (free)

**Frontend → Vercel Hobby** (`vercel.json` includes SPA rewrites):
1. Push the repo to GitHub → <https://vercel.com/new> → import.
2. Add env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (never the service-role key).
3. Deploy, then add the Vercel URL to Supabase *Site URL* / *Redirect URLs*.

Alternatives: Netlify or Cloudflare Pages (both free; add an SPA fallback to `index.html`).

**Backend → Supabase free tier.** Note that free projects pause after a period of inactivity; open the dashboard to resume before a demo.

### Optional: scheduled expiry
Every query and RPC already treats overdue listings as expired, and signed-in clients call `sync_expiry()` on load and every 5 minutes to persist status changes and send expiry notifications. For server-side scheduling, enable the **pg_cron** extension (Database → Extensions) and run:
```sql
select cron.schedule('foodbridge-expiry', '*/5 * * * *', 'select public.sync_expiry()');
```

---

## Architecture notes

- **Authorization lives in the database.** Tables revoke Supabase's default grants; clients get `select` plus column-level `insert/update` only where safe. All state transitions go through `security definer` RPCs that check membership and lock rows (`listing → request/pickup` lock order).
- **State machine.** Listing: `available → reserved → collected → completed` (or `expired / cancelled / removed`). Request: `pending → accepted | rejected | cancelled`. Pickup: `scheduled → assigned → en_route → arrived → collected → verified` (or `cancelled / expired`).
- **Privacy.** Profiles are visible only to the user, their organization, their pickup counterparts and admins. Volunteers see only assigned pickups. Handover codes are unreadable through the API.
- **Distances** are straight-line (Haversine) estimates, clearly labelled — not road distance or travel time.
- **CO₂e** = verified kg × 2.5 kg CO₂e/kg (a commonly used average emission factor for avoided food waste). Always labelled as an estimate.

## Known limitations

- Food images are not supported in this release (no image upload UI); listings use category icons.
- One accepted receiver per listing (no partial fulfilment).
- Organization verification is manual (admin console).
- Expiry *notifications* depend on clients loading the app or optional pg_cron; deadline *enforcement* does not.
- Location entry uses presets, browser geolocation or manual coordinates; there is no map or geocoding.

## Project structure

```
src/
  pages/            route pages (public, app, admin)
  components/       layout, common UI, charts, shadcn/ui primitives
  context/          auth + notifications providers
  lib/              api (Supabase calls), matching, geo, time, types, constants
supabase/
  migrations/       SQL migrations (schema, RLS, RPCs, demo seed)
  setup.sql         bundled migrations for the SQL editor
scripts/            db bundle/migrate, demo seeding
tests/db/           PGlite database tests
```
