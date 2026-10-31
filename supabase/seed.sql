-- =====================================================================
-- FoodBridge — demo seed (reset-and-seed, demo records only)
--
-- Safe to re-run. Deletes and recreates ONLY rows marked is_demo = true
-- (plus notifications of demo accounts). Real users and real activity are
-- never touched.
--
-- Prerequisites
--   1. All migrations applied (supabase/migrations or supabase/setup.sql).
--   2. Demo Auth users provisioned through Supabase Auth — NOT by inserting
--      into auth.users. Run `npm run seed:demo` once: it creates the four
--      login accounts plus the non-login staff/volunteer accounts with the
--      Admin API and then performs this same seed via RPC.
--      This file is the SQL-editor / `supabase db reset` equivalent.
--
-- What gets created (see docs/demo-knowledge-base.md for every record):
--   8 fictional organizations (4 donors, 4 receivers), 4 volunteers,
--   1 demo-scoped admin, ~40 listings across all categories and statuses,
--   requests in every status, pickups from "scheduled" to "verified",
--   used (hashed) verification records, notifications and audit history.
--   Impact analytics are computed live from these rows — nothing is
--   pre-aggregated.
--
-- Contains no passwords, handover codes or API keys.
-- =====================================================================

do $seed$
declare
  v_ids jsonb;
  v_missing text[];
  v_extras jsonb;
  v_result jsonb;
begin
  -- Look up provisioned demo accounts by their (fictional, .test) emails.
  select jsonb_object_agg(e.key, p.id)
  into v_ids
  from (values
    ('donor', 'demo.donor@foodbridge.test'),
    ('receiver', 'demo.receiver@foodbridge.test'),
    ('volunteer', 'demo.volunteer@foodbridge.test'),
    ('admin', 'demo.admin@foodbridge.test'),
    ('volunteer2', 'demo.volunteer2@foodbridge.test'),
    ('volunteer3', 'demo.volunteer3@foodbridge.test'),
    ('volunteer4', 'demo.volunteer4@foodbridge.test'),
    ('staff_d2', 'demo.staff.greenbowl@foodbridge.test'),
    ('staff_d3', 'demo.staff.freshbasket@foodbridge.test'),
    ('staff_d4', 'demo.staff.celebration@foodbridge.test'),
    ('staff_r2', 'demo.staff.helpinghands@foodbridge.test'),
    ('staff_r3', 'demo.staff.localrelief@foodbridge.test'),
    ('staff_r4', 'demo.staff.riverside@foodbridge.test')
  ) as e(key, email)
  join public.profiles p on lower(p.email) = e.email;

  v_ids := coalesce(v_ids, '{}'::jsonb);
  select array_agg(k) into v_missing
  from unnest(array['donor', 'receiver', 'volunteer', 'admin']) k
  where not v_ids ? k;

  if v_missing is not null then
    raise notice 'FoodBridge demo seed skipped: demo Auth users not provisioned (missing: %). Run `npm run seed:demo` (uses the Supabase Admin API) and re-run this file.', v_missing;
    return;
  end if;

  v_extras := jsonb_build_object(
    'volunteers', coalesce((select jsonb_agg(v_ids -> k) from unnest(array['volunteer2', 'volunteer3', 'volunteer4']) k where v_ids ? k), '[]'::jsonb),
    'org_staff', jsonb_strip_nulls(jsonb_build_object(
      '00000000-0000-4000-a000-000000000d02', v_ids -> 'staff_d2',
      '00000000-0000-4000-a000-000000000d03', v_ids -> 'staff_d3',
      '00000000-0000-4000-a000-000000000d04', v_ids -> 'staff_d4',
      '00000000-0000-4000-a000-000000000e02', v_ids -> 'staff_r2',
      '00000000-0000-4000-a000-000000000e03', v_ids -> 'staff_r3',
      '00000000-0000-4000-a000-000000000e04', v_ids -> 'staff_r4')));

  v_result := public.seed_demo_data(
    (v_ids ->> 'donor')::uuid, (v_ids ->> 'receiver')::uuid,
    (v_ids ->> 'volunteer')::uuid, (v_ids ->> 'admin')::uuid, v_extras);

  raise notice 'FoodBridge demo seed complete: %', v_result;
end
$seed$;

-- ---------------------------------------------------------------------
-- Consistency checks — abort loudly if the demo data is incoherent.
-- ---------------------------------------------------------------------
do $check$
declare
  v_bad integer;
begin
  -- Every collected/verified pickup has a used verification record and a collection audit event.
  select count(*) into v_bad from public.pickups p
  where p.is_demo and p.status in ('collected', 'verified')
    and (not exists (select 1 from public.pickup_verifications v where v.pickup_id = p.id and v.used_at is not null)
         or not exists (select 1 from public.audit_events a where a.entity_id = p.id and a.action = 'collection_recorded'));
  if v_bad > 0 then raise exception 'Demo seed check failed: % collected/verified pickup(s) lack verification or audit', v_bad; end if;

  -- Every verified pickup has a confirmation audit event and a completed listing.
  select count(*) into v_bad from public.pickups p join public.food_listings l on l.id = p.listing_id
  where p.is_demo and p.status = 'verified'
    and (l.status <> 'completed' or p.verified_by is null
         or not exists (select 1 from public.audit_events a where a.entity_id = p.id and a.action = 'verification_completed'));
  if v_bad > 0 then raise exception 'Demo seed check failed: % verified pickup(s) are inconsistent', v_bad; end if;

  -- Listing status agrees with its active pickup.
  select count(*) into v_bad from public.pickups p join public.food_listings l on l.id = p.listing_id
  where p.is_demo and not (
       (p.status in ('scheduled', 'assigned', 'en_route', 'arrived') and l.status = 'reserved')
    or (p.status = 'collected' and l.status = 'collected')
    or (p.status = 'verified' and l.status = 'completed')
    or (p.status in ('cancelled', 'expired') and l.status in ('expired', 'cancelled', 'removed', 'available')));
  if v_bad > 0 then raise exception 'Demo seed check failed: % listing/pickup status mismatch(es)', v_bad; end if;

  -- Decisions and confirmations come only from members of the organization concerned.
  select count(*) into v_bad from public.food_requests r join public.food_listings l on l.id = r.listing_id
  where r.is_demo and r.decided_by is not null and r.status in ('accepted', 'rejected')
    and not exists (select 1 from public.organization_members m where m.organization_id = l.donor_org_id and m.user_id = r.decided_by);
  if v_bad > 0 then raise exception 'Demo seed check failed: % request decision(s) by non-members', v_bad; end if;

  -- Open listings are never past their deadline.
  select count(*) into v_bad from public.food_listings
  where is_demo and status in ('available', 'reserved') and safe_until <= now();
  if v_bad > 0 then raise exception 'Demo seed check failed: % open listing(s) already expired', v_bad; end if;

  raise notice 'FoodBridge demo seed consistency checks passed.';
end
$check$;
