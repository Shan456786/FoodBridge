-- =====================================================================
-- FoodBridge — demo seed v2
--
-- Replaces the v1 demo seed function with a fuller, internally consistent
-- dataset (see docs/demo-knowledge-base.md):
--   * 4 donor + 4 receiver organizations, 4 volunteers, 1 demo admin
--   * stable, deterministic ids (md5 of a scenario key) for every listing,
--     request and pickup, so URLs and docs stay valid across re-seeds
--   * every collected / verified pickup has a used pickup_verifications row
--     (bcrypt hash of a random throwaway value — no plaintext code exists)
--     and the matching audit history
--   * decisions and confirmations are attributed only to members of the
--     organization concerned (never to an unrelated demo user)
--
-- Reset scope: only rows with is_demo = true (and notifications of demo
-- profiles) are deleted. Real data is never touched.
-- Callable only with the service-role key or from the SQL editor.
-- =====================================================================

drop function if exists public.seed_demo_data(uuid, uuid, uuid, uuid);
drop function if exists private.seed_pickup(uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz, uuid);
drop function if exists private.seed_listing(uuid, uuid, text, text, text, text, numeric, text, integer, text,
  timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, text[], text);

-- Deterministic uuid for a demo scenario key.
create or replace function private.demo_id(p_key text)
returns uuid language sql immutable as $$
  select md5('foodbridge-demo:' || p_key)::uuid
$$;

create or replace function private.demo_listing(
  p_key text, p_org uuid, p_creator uuid, p_title text, p_desc text, p_category text, p_diet text,
  p_qty numeric, p_unit text, p_meals integer, p_storage text,
  p_prepared timestamptz, p_safe timestamptz, p_pstart timestamptz, p_pend timestamptz,
  p_status text, p_created timestamptz, p_allergens text[], p_packaging text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_id uuid := private.demo_id('listing:' || p_key);
begin
  select * into v_org from public.organizations where id = p_org;
  insert into public.food_listings (id, donor_org_id, created_by, title, description, category, diet, quantity,
    quantity_unit, estimated_meals, prepared_at, safe_until, pickup_start, pickup_end, storage_requirement,
    packaging, allergens, pickup_address, latitude, longitude, max_radius_km, status, handling_confirmed,
    is_demo, created_at, updated_at)
  values (v_id, p_org, p_creator, p_title, p_desc, p_category, p_diet, p_qty, p_unit, p_meals, p_prepared, p_safe,
    p_pstart, p_pend, p_storage, p_packaging, coalesce(p_allergens, '{}'), v_org.address, v_org.latitude,
    v_org.longitude, 20, p_status, true, true, p_created, p_created);
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (p_creator, 'listing_created', 'food_listing', v_id, v_id,
          jsonb_build_object('title', p_title, 'meals', p_meals), true, p_created);
  return v_id;
end $$;

-- A request that was submitted and (optionally) decided, without a pickup.
create or replace function private.demo_request(
  p_key text, p_listing uuid, p_receiver_org uuid, p_requester uuid, p_status text, p_message text,
  p_created timestamptz, p_decider uuid, p_decided timestamptz, p_note text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l public.food_listings;
  v_o public.organizations;
  v_id uuid := private.demo_id('request:' || p_key);
begin
  select * into v_l from public.food_listings where id = p_listing;
  select * into v_o from public.organizations where id = p_receiver_org;
  insert into public.food_requests (id, listing_id, receiver_org_id, requested_by, requested_quantity, message, status,
    distance_km, decision_note, decided_by, decided_at, is_demo, created_at, updated_at)
  values (v_id, p_listing, p_receiver_org, p_requester, v_l.quantity, p_message, p_status,
    round(private.haversine_km(v_o.latitude, v_o.longitude, v_l.latitude, v_l.longitude)::numeric, 2),
    p_note, p_decider, p_decided, true, p_created, coalesce(p_decided, p_created));
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (p_requester, 'request_submitted', 'food_request', v_id, p_listing,
          jsonb_build_object('receiver_org', v_o.name), true, p_created);
  if p_status in ('rejected', 'cancelled') then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (case when p_status = 'cancelled' then p_requester else p_decider end,
            case when p_status = 'cancelled' then 'request_cancelled' else 'request_rejected' end,
            'food_request', v_id, p_listing,
            jsonb_build_object('receiver_org', v_o.name, 'reason', p_note), true, coalesce(p_decided, p_created));
  end if;
  return v_id;
end $$;

-- An accepted request plus its pickup, carried forward to p_status with a
-- consistent trail of timestamps, verification record and audit events.
create or replace function private.demo_pickup(
  p_key text, p_listing uuid, p_receiver_org uuid, p_requester uuid, p_decider uuid, p_volunteer uuid,
  p_status text, p_accepted timestamptz, p_collected timestamptz, p_verified timestamptz)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l public.food_listings;
  v_o public.organizations;
  v_req uuid := private.demo_id('request:' || p_key);
  v_pickup uuid := private.demo_id('pickup:' || p_key);
  v_collector uuid := coalesce(p_volunteer, p_requester);
  v_moving boolean := p_status in ('en_route', 'arrived', 'collected', 'verified');
begin
  if p_status = 'assigned' and p_volunteer is null then
    raise exception 'demo_pickup %: assigned pickups need a volunteer', p_key;
  end if;
  if p_status in ('collected', 'verified') and p_collected is null then
    raise exception 'demo_pickup %: collected pickups need a collection time', p_key;
  end if;
  if p_status = 'verified' and p_verified is null then
    raise exception 'demo_pickup %: verified pickups need a verification time', p_key;
  end if;

  select * into v_l from public.food_listings where id = p_listing;
  select * into v_o from public.organizations where id = p_receiver_org;

  insert into public.food_requests (id, listing_id, receiver_org_id, requested_by, requested_quantity, message, status,
    distance_km, decided_by, decided_at, is_demo, created_at, updated_at)
  values (v_req, p_listing, p_receiver_org, p_requester, v_l.quantity, 'We can collect within the window.', 'accepted',
    round(private.haversine_km(v_o.latitude, v_o.longitude, v_l.latitude, v_l.longitude)::numeric, 2),
    p_decider, p_accepted, true, p_accepted - interval '20 minutes', p_accepted);

  insert into public.pickups (id, listing_id, request_id, donor_org_id, receiver_org_id, volunteer_id, status,
    assigned_at, en_route_at, arrived_at, collected_at, collected_by, verified_at, verified_by, cancelled_at,
    is_demo, created_at, updated_at)
  values (v_pickup, p_listing, v_req, v_l.donor_org_id, p_receiver_org, p_volunteer, p_status,
    case when p_volunteer is not null then p_accepted + interval '5 minutes' end,
    case when v_moving then p_accepted + interval '15 minutes' end,
    case when p_status in ('arrived', 'collected', 'verified') then coalesce(p_collected - interval '10 minutes', p_accepted + interval '40 minutes') end,
    p_collected, case when p_collected is not null then v_collector end,
    p_verified, case when p_verified is not null then p_requester end,
    case when p_status in ('cancelled', 'expired') then v_l.safe_until end,
    true, p_accepted, coalesce(p_verified, p_collected, p_accepted));

  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values
    (p_requester, 'request_submitted', 'food_request', v_req, p_listing, jsonb_build_object('receiver_org', v_o.name), true, p_accepted - interval '20 minutes'),
    (p_decider, 'request_accepted', 'food_request', v_req, p_listing, jsonb_build_object('receiver_org', v_o.name, 'pickup_id', v_pickup), true, p_accepted);
  if p_volunteer is not null then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (p_requester, 'pickup_assigned', 'pickup', v_pickup, p_listing, jsonb_build_object('volunteer_id', p_volunteer), true, p_accepted + interval '5 minutes');
  end if;
  if v_moving then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (v_collector, 'pickup_status_updated', 'pickup', v_pickup, p_listing, '{"status":"en_route"}', true, p_accepted + interval '15 minutes');
  end if;

  if p_collected is not null then
    -- Used one-time code. The hashed value is random and immediately discarded:
    -- no plaintext code exists anywhere, and the row can never be used again.
    insert into public.pickup_verifications (id, pickup_id, code_hash, expires_at, attempts, used_at, used_by,
      created_by, created_at)
    values (private.demo_id('verification:' || p_key), v_pickup,
      extensions.crypt(encode(extensions.gen_random_bytes(16), 'hex'), extensions.gen_salt('bf', 6)),
      p_collected + interval '20 minutes', 0, p_collected, v_collector, v_l.created_by, p_collected - interval '10 minutes');
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values
      (v_l.created_by, 'handover_code_generated', 'pickup', v_pickup, p_listing,
       jsonb_build_object('expires_at', p_collected + interval '20 minutes'), true, p_collected - interval '10 minutes'),
      (v_collector, 'collection_recorded', 'pickup', v_pickup, p_listing, '{"method":"handover_code"}', true, p_collected);
  end if;
  if p_verified is not null then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (p_requester, 'verification_completed', 'pickup', v_pickup, p_listing,
            jsonb_build_object('meals', v_l.estimated_meals), true, p_verified);
  end if;
  return v_pickup;
end $$;

-- ---------------------------------------------------------------------
-- p_extras (optional) maps the non-login demo accounts created by
-- scripts/seed-demo.mjs:
--   { "volunteers": [uuid, ...],                -- extra volunteers
--     "org_staff":  { "<org uuid>": uuid, ... } -- one staff member per org }
-- Missing entries are tolerated: the affected history is attributed to the
-- login accounts' organizations only, never to an unrelated user.
-- ---------------------------------------------------------------------
create or replace function public.seed_demo_data(p_donor uuid, p_receiver uuid, p_volunteer uuid, p_admin uuid,
                                                 p_extras jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n timestamptz := now();
  d1 constant uuid := '00000000-0000-4000-a000-000000000d01'; -- Campus Central Canteen   (login: demo donor)
  d2 constant uuid := '00000000-0000-4000-a000-000000000d02'; -- Green Bowl Kitchen
  d3 constant uuid := '00000000-0000-4000-a000-000000000d03'; -- Fresh Basket Grocery
  d4 constant uuid := '00000000-0000-4000-a000-000000000d04'; -- Celebration Banquets
  r1 constant uuid := '00000000-0000-4000-a000-000000000e01'; -- Community Food Collective (login: demo receiver)
  r2 constant uuid := '00000000-0000-4000-a000-000000000e02'; -- Helping Hands Food Bank
  r3 constant uuid := '00000000-0000-4000-a000-000000000e03'; -- Local Relief Network      (pending verification)
  r4 constant uuid := '00000000-0000-4000-a000-000000000e04'; -- Riverside Community Shelter (ambient storage only)
  v_staff jsonb := coalesce(p_extras -> 'org_staff', '{}'::jsonb);
  v_vols uuid[];
  s_d2 uuid; s_d3 uuid; s_d4 uuid; s_r2 uuid; s_r3 uuid; s_r4 uuid;
  v_all uuid[];
  v_id uuid;
  v_i integer;
  v_x jsonb;
  v_day timestamptz;
  v_donor uuid; v_donor_staff uuid; v_recv uuid; v_recv_staff uuid; v_vol uuid;
  v_templates jsonb := '[
    ["Veg Meals Thali Surplus", "cooked_meals", "veg", 45, "portions", 45, "ambient"],
    ["Bread Loaves & Buns", "bakery", "veg", 10, "kg", 40, "ambient"],
    ["Banana & Papaya Mix", "fruits", "vegan", 18, "kg", 36, "ambient"],
    ["Seasonal Vegetables", "vegetables", "vegan", 30, "kg", 60, "ambient"],
    ["Curd Packs", "dairy", "veg", 20, "litres", 40, "refrigerated"],
    ["Egg Fried Rice", "cooked_meals", "non_veg", 35, "portions", 35, "ambient"],
    ["Biscuit & Snack Packets", "packaged_food", "veg", 90, "packets", 45, "ambient"],
    ["Buffet Veg Curries & Rice", "cooked_meals", "veg", 120, "portions", 120, "refrigerated"]
  ]';
begin
  if p_donor is null or p_receiver is null or p_volunteer is null or p_admin is null then
    raise exception 'All four demo login user ids are required.';
  end if;

  s_d2 := nullif(v_staff ->> d2::text, '')::uuid;
  s_d3 := nullif(v_staff ->> d3::text, '')::uuid;
  s_d4 := nullif(v_staff ->> d4::text, '')::uuid;
  s_r2 := nullif(v_staff ->> r2::text, '')::uuid;
  s_r3 := nullif(v_staff ->> r3::text, '')::uuid;
  s_r4 := nullif(v_staff ->> r4::text, '')::uuid;
  v_vols := array[p_volunteer] || coalesce(
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_extras -> 'volunteers', '[]'::jsonb)) x), '{}');
  v_all := array_remove(array[p_donor, p_receiver, p_admin, s_d2, s_d3, s_d4, s_r2, s_r3, s_r4] || v_vols, null);

  -- 1. Reset previous demo activity only.
  perform set_config('foodbridge.allow_audit_purge', 'on', true);
  delete from public.audit_events where is_demo;
  perform set_config('foodbridge.allow_audit_purge', 'off', true);
  delete from public.food_listings where is_demo; -- cascades to requests, pickups, verifications

  -- 2. Fictional organizations (approximate coordinates, Vijayawada–VIT-AP region).
  insert into public.organizations (id, name, kind, org_type, address, city, latitude, longitude,
    has_refrigeration, has_freezer, capacity_meals, verification_status, verification_note, is_demo)
  values
    (d1, 'Campus Central Canteen', 'donor', 'canteen', 'Central Block, VIT-AP Campus, Inavolu', 'Amaravati', 16.4963, 80.4994, true, false, 0, 'verified', null, true),
    (d2, 'Green Bowl Kitchen', 'donor', 'restaurant', 'Near Benz Circle, MG Road', 'Vijayawada', 16.4996, 80.6560, true, false, 0, 'verified', null, true),
    (d3, 'Fresh Basket Grocery', 'donor', 'grocery', 'Main Bazaar Road', 'Mangalagiri', 16.4307, 80.5525, true, true, 0, 'verified', null, true),
    (d4, 'Celebration Banquets', 'donor', 'banquet_hall', 'NH-16 Service Road', 'Tadepalli', 16.4800, 80.6000, true, false, 0, 'verified', null, true),
    (r1, 'Community Food Collective', 'receiver', 'ngo', 'Undavalli Centre Road', 'Tadepalli', 16.4850, 80.5900, true, false, 250, 'verified', null, true),
    (r2, 'Helping Hands Food Bank', 'receiver', 'food_bank', 'Governorpet', 'Vijayawada', 16.5131, 80.6297, true, true, 500, 'verified', null, true),
    (r3, 'Local Relief Network', 'receiver', 'community_org', 'Brodipet', 'Guntur', 16.3067, 80.4365, false, false, 80, 'pending', null, true),
    (r4, 'Riverside Community Shelter', 'receiver', 'community_org', 'Bhavanipuram', 'Vijayawada', 16.5300, 80.5930, false, false, 60, 'verified', null, true)
  on conflict (id) do update set
    name = excluded.name, kind = excluded.kind, org_type = excluded.org_type, address = excluded.address,
    city = excluded.city, latitude = excluded.latitude, longitude = excluded.longitude,
    has_refrigeration = excluded.has_refrigeration, has_freezer = excluded.has_freezer,
    capacity_meals = excluded.capacity_meals, verification_status = excluded.verification_status,
    verification_note = excluded.verification_note, is_demo = true;

  -- 3. Demo profiles. Roles are set explicitly here; the admin role is granted to
  --    exactly one account (p_admin) and, because is_demo = true, it is limited
  --    by private.admin_can_see() to demo records.
  update public.profiles set role = 'donor', organization_id = d1, is_demo = true, phone = null,
    full_name = 'Demo Donor — Canteen Manager' where id = p_donor;
  update public.profiles set role = 'receiver', organization_id = r1, is_demo = true, phone = null,
    full_name = 'Demo Receiver — NGO Coordinator' where id = p_receiver;
  update public.profiles set role = 'admin', organization_id = null, is_demo = true, phone = null,
    full_name = 'Demo Administrator' where id = p_admin;
  update public.profiles p set role = 'volunteer', organization_id = null, is_demo = true, phone = null,
    full_name = case v.ord when 1 then 'Demo Volunteer — Kiran' when 2 then 'Demo Volunteer — Arjun'
                           when 3 then 'Demo Volunteer — Meera' else 'Demo Volunteer — Sai' end
  from unnest(v_vols) with ordinality as v(id, ord) where p.id = v.id;
  update public.profiles p set role = s.role, organization_id = s.org, is_demo = true, phone = null, full_name = s.name
  from (values (s_d2, 'donor', d2, 'Demo Staff — Green Bowl Kitchen'),
               (s_d3, 'donor', d3, 'Demo Staff — Fresh Basket Grocery'),
               (s_d4, 'donor', d4, 'Demo Staff — Celebration Banquets'),
               (s_r2, 'receiver', r2, 'Demo Staff — Helping Hands Food Bank'),
               (s_r3, 'receiver', r3, 'Demo Staff — Local Relief Network'),
               (s_r4, 'receiver', r4, 'Demo Staff — Riverside Community Shelter')) as s(uid, role, org, name)
  where p.id = s.uid;

  delete from public.organization_members
  where user_id = any(v_all) or organization_id in (d1, d2, d3, d4, r1, r2, r3, r4);
  insert into public.organization_members (organization_id, user_id, member_role)
  select org, uid, 'owner' from (values (d1, p_donor), (r1, p_receiver), (d2, s_d2), (d3, s_d3), (d4, s_d4),
                                        (r2, s_r2), (r3, s_r3), (r4, s_r4)) as m(org, uid)
  where uid is not null;

  -- Notifications are reset after the org upsert so first-run "awaiting review"
  -- notifications from the insert trigger don't linger.
  delete from public.notifications where user_id = any(v_all);

  -- 4. Open listings (scenarios 2–4).
  perform private.demo_listing('biryani', d1, p_donor, 'Veg Biryani & Raita',
    'Lunch surplus from the main counter, kept covered in hot cases since service.',
    'cooked_meals', 'veg', 40, 'portions', 40, 'ambient', n - interval '1 hour', n + interval '3 hours',
    n - interval '10 minutes', n + interval '150 minutes', 'available', n - interval '25 minutes',
    array['dairy'], 'Steel containers (return requested)');
  perform private.demo_listing('bread', d3, s_d3, 'Assorted Bread & Buns',
    'Unsold bakery items from today''s batch, sealed in bags.',
    'bakery', 'veg', 12, 'kg', 60, 'ambient', n - interval '6 hours', n + interval '20 hours',
    n + interval '1 hour', n + interval '8 hours', 'available', n - interval '2 hours',
    array['gluten'], 'Sealed plastic bags');
  perform private.demo_listing('paneer', d4, s_d4, 'Paneer Butter Masala with Rotis',
    'Evening event surplus, refrigerated immediately after service.',
    'cooked_meals', 'veg', 120, 'portions', 120, 'refrigerated', n - interval '2 hours', n + interval '5 hours',
    n, n + interval '4 hours', 'available', n - interval '40 minutes',
    array['dairy', 'gluten'], 'Food-grade trays with lids');
  perform private.demo_listing('vegetables', d3, s_d3, 'Fresh Vegetables Crate',
    'Tomatoes, onions, carrots and greens with minor cosmetic blemishes.',
    'vegetables', 'vegan', 25, 'kg', 50, 'ambient', null, n + interval '48 hours',
    n, n + interval '24 hours', 'available', n - interval '3 hours', '{}', 'Plastic crates');
  perform private.demo_listing('fruit-basket', d3, s_d3, 'Seasonal Fruit Basket',
    'Bananas, guavas and oranges, ripe — best distributed today or tomorrow.',
    'fruits', 'vegan', 15, 'kg', 30, 'ambient', null, n + interval '30 hours',
    n, n + interval '20 hours', 'available', n - interval '80 minutes', '{}', 'Cardboard boxes');
  perform private.demo_listing('curd', d3, s_d3, 'Curd & Buttermilk Packs',
    'Sealed dairy packs within the manufacturer''s date, kept in the store chiller.',
    'dairy', 'veg', 30, 'litres', 60, 'refrigerated', null, n + interval '10 hours',
    n, n + interval '8 hours', 'available', n - interval '90 minutes', array['dairy'], 'Sealed sachets');
  perform private.demo_listing('chicken-curry', d2, s_d2, 'Chicken Curry & Rice',
    'Dinner service surplus. Needs immediate pickup.',
    'cooked_meals', 'non_veg', 35, 'portions', 35, 'ambient', n - interval '90 minutes', n + interval '50 minutes',
    n - interval '30 minutes', n + interval '45 minutes', 'available', n - interval '50 minutes',
    '{}', 'Disposable containers');
  perform private.demo_listing('parathas', d3, s_d3, 'Frozen Parathas',
    'Unopened cartons of packaged frozen parathas.',
    'packaged_food', 'veg', 80, 'packets', 80, 'frozen', null, n + interval '5 days',
    n, n + interval '48 hours', 'available', n - interval '5 hours', array['gluten'], 'Original cartons');
  perform private.demo_listing('wedding-buffet', d4, s_d4, 'Wedding Buffet Surplus',
    'Rice, dal and mixed vegetable curry from a reception; chilled after service.',
    'cooked_meals', 'veg', 300, 'portions', 300, 'refrigerated', n - interval '3 hours', n + interval '6 hours',
    n, n + interval '5 hours', 'available', n - interval '30 minutes', '{}', 'Large insulated containers');

  -- 5. Requests in each non-pickup status.
  --    (Scenario 1) Idli: two pending requests -> donor accepts one.
  v_id := private.demo_listing('idli', d1, p_donor, 'Idli & Sambar Breakfast',
    'Breakfast surplus, kept in insulated containers.',
    'cooked_meals', 'veg', 50, 'portions', 50, 'ambient', n - interval '40 minutes', n + interval '4 hours',
    n, n + interval '3 hours', 'available', n - interval '35 minutes', '{}', 'Insulated containers');
  perform private.demo_request('idli-r1', v_id, r1, p_receiver, 'pending', 'We can send a volunteer within 30 minutes.',
    n - interval '20 minutes', null, null, null);
  perform private.demo_request('idli-r2', v_id, r2, s_r2, 'pending', 'Our van is in the area this morning.',
    n - interval '12 minutes', null, null, null);

  --    (Scenario 5) Fried rice: one request declined by the donor, one withdrawn by the receiver.
  v_id := private.demo_listing('fried-rice', d2, s_d2, 'Veg Fried Rice',
    'Kitchen surplus from the lunch buffet.',
    'cooked_meals', 'veg', 30, 'portions', 30, 'ambient', n - interval '1 hour', n + interval '4 hours',
    n, n + interval '3 hours', 'available', n - interval '70 minutes', array['soy'], 'Foil containers');
  perform private.demo_request('fried-rice-r4', v_id, r4, s_r4, 'rejected', 'We can pick up at 6 pm.',
    n - interval '60 minutes', s_d2, n - interval '45 minutes', 'Pickup time is after our closing; please request earlier.');
  perform private.demo_request('fried-rice-r1', v_id, r1, p_receiver, 'cancelled', 'Can collect in an hour.',
    n - interval '55 minutes', null, n - interval '40 minutes', 'Withdrawn by receiver');

  -- 6. Pickups in progress.
  --    (Scenario 6) Pulao: volunteer assigned -> code -> collected -> confirmed.
  v_id := private.demo_listing('pulao', d1, p_donor, 'Vegetable Pulao',
    'Lunch surplus, portioned into 30 sealed boxes.',
    'cooked_meals', 'veg', 30, 'portions', 30, 'ambient', n - interval '1 hour', n + interval '3 hours',
    n - interval '30 minutes', n + interval '2 hours', 'reserved', n - interval '70 minutes', '{}', 'Sealed boxes');
  perform private.demo_pickup('pulao', v_id, r1, p_receiver, p_donor, p_volunteer, 'assigned',
    n - interval '45 minutes', null, null);

  v_id := private.demo_listing('fruit-cups', d1, p_donor, 'Fruit Salad Cups',
    'Cut fruit cups from the juice counter, chilled.',
    'fruits', 'vegan', 40, 'items', 40, 'refrigerated', n - interval '1 hour', n + interval '6 hours',
    n, n + interval '5 hours', 'reserved', n - interval '50 minutes', '{}', 'Lidded cups');
  perform private.demo_pickup('fruit-cups', v_id, r1, p_receiver, p_donor, null, 'scheduled',
    n - interval '30 minutes', null, null);

  if s_r2 is not null and s_d2 is not null and array_length(v_vols, 1) >= 2 then
    v_id := private.demo_listing('tomato-rice', d2, s_d2, 'Tomato Rice Boxes',
      'Packed lunch boxes from a cancelled office order.',
      'cooked_meals', 'veg', 25, 'portions', 25, 'ambient', n - interval '90 minutes', n + interval '3 hours',
      n - interval '30 minutes', n + interval '2 hours', 'reserved', n - interval '80 minutes', '{}', 'Sealed boxes');
    perform private.demo_pickup('tomato-rice', v_id, r2, s_r2, s_d2, v_vols[2], 'en_route',
      n - interval '50 minutes', null, null);
  end if;

  --    Collected, awaiting receipt confirmation (Scenario 6, final step).
  v_id := private.demo_listing('sandwiches', d1, p_donor, 'Sandwich Trays',
    'Veg sandwiches from a cancelled department event.',
    'bakery', 'veg', 6, 'trays', 48, 'refrigerated', n - interval '3 hours', n + interval '4 hours',
    n - interval '2 hours', n + interval '3 hours', 'collected', n - interval '150 minutes', array['gluten', 'dairy'], 'Covered trays');
  perform private.demo_pickup('sandwiches', v_id, r1, p_receiver, p_donor, p_volunteer, 'collected',
    n - interval '2 hours', n - interval '30 minutes', null);

  -- 7. Verified rescue history over the last 30 days (drives impact charts).
  for v_i in 1..18 loop
    v_x := v_templates -> ((v_i - 1) % 8);
    v_day := date_trunc('day', n) - make_interval(days => 29 - ((v_i * 5) % 29)) + interval '6 hours' + make_interval(mins => v_i * 13);
    v_donor := (array[d1, d2, d3, d4])[((v_i - 1) % 4) + 1];
    v_donor_staff := case v_donor when d1 then p_donor when d2 then s_d2 when d3 then s_d3 else s_d4 end;
    if v_donor_staff is null then -- no staff account for that donor: attribute to the demo donor's org instead
      v_donor := d1; v_donor_staff := p_donor;
    end if;
    v_recv := case when v_i % 3 = 0 and s_r2 is not null then r2 else r1 end;
    v_recv_staff := case v_recv when r2 then s_r2 else p_receiver end;
    v_vol := case when v_i % 2 = 0 then v_vols[((v_i / 2 - 1) % array_length(v_vols, 1)) + 1] end;
    v_id := private.demo_listing('history-' || v_i, v_donor, v_donor_staff,
      v_x ->> 0, 'Rescued surplus (demo history).', v_x ->> 1, v_x ->> 2, (v_x ->> 3)::numeric, v_x ->> 4,
      (v_x ->> 5)::integer, v_x ->> 6,
      v_day - interval '1 hour', v_day + interval '8 hours', v_day, v_day + interval '6 hours',
      'completed', v_day - interval '30 minutes', '{}', null);
    perform private.demo_pickup('history-' || v_i, v_id, v_recv, v_recv_staff, v_donor_staff, v_vol, 'verified',
      v_day + interval '20 minutes', v_day + interval '2 hours', v_day + interval '3 hours');
  end loop;

  -- 8. Terminal non-rescue outcomes (Scenario 3: expired).
  v_id := private.demo_listing('expired-curry', d2, s_d2, 'Mixed Veg Curry', 'Not requested before its deadline (demo).',
    'cooked_meals', 'veg', 25, 'portions', 25, 'ambient', n - interval '2 days 4 hours', n - interval '2 days',
    n - interval '2 days 3 hours', n - interval '2 days 1 hour', 'expired', n - interval '2 days 4 hours', '{}', null);
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (null, 'listing_expired', 'food_listing', v_id, v_id, '{"title":"Mixed Veg Curry","previous_status":"available"}', true, n - interval '2 days');

  -- Accepted but not collected in time: listing and pickup expire, request stays accepted (as sync_expiry does).
  v_id := private.demo_listing('expired-khichdi', d1, p_donor, 'Dal Khichdi', 'Accepted but not collected before the deadline (demo).',
    'cooked_meals', 'veg', 20, 'portions', 20, 'ambient', n - interval '5 days 4 hours', n - interval '5 days',
    n - interval '5 days 3 hours', n - interval '5 days 1 hour', 'expired', n - interval '5 days 4 hours', '{}', null);
  perform private.demo_pickup('expired-khichdi', v_id, r1, p_receiver, p_donor, null, 'expired',
    n - interval '5 days 2 hours', null, null);
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (null, 'listing_expired', 'food_listing', v_id, v_id, '{"title":"Dal Khichdi","previous_status":"reserved"}', true, n - interval '5 days');

  v_id := private.demo_listing('cancelled-desserts', d4, s_d4, 'Dessert Platters', 'Cancelled by the donor (demo).',
    'other', 'veg', 10, 'trays', 60, 'refrigerated', n - interval '8 days 2 hours', n - interval '8 days',
    n - interval '8 days 1 hour', n - interval '8 days 30 minutes', 'cancelled', n - interval '8 days 2 hours',
    array['dairy', 'nuts'], null);
  perform private.demo_request('cancelled-desserts-r2', v_id, r2, s_r2, 'cancelled', 'We have freezer space.',
    n - interval '8 days 100 minutes', null, n - interval '8 days 90 minutes', 'Listing cancelled by donor');
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (s_d4, 'listing_cancelled', 'food_listing', v_id, v_id, '{"reason":"Event extended; food served on site"}', true, n - interval '8 days 90 minutes');

  v_id := private.demo_listing('removed-sweets', d2, s_d2, 'Assorted Sweets Box', 'Removed by moderator (demo).',
    'other', 'veg', 5, 'kg', 25, 'ambient', n - interval '3 days 3 hours', n - interval '3 days',
    n - interval '3 days 2 hours', n - interval '3 days 1 hour', 'removed', n - interval '3 days 3 hours', '{}', null);
  update public.food_listings set moderation_note = 'Allergen information missing for nut-based sweets. Please relist with allergens declared.'
  where id = v_id;
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (p_admin, 'listing_removed', 'food_listing', v_id, v_id, '{"note":"Allergen information missing"}', true, n - interval '3 days 150 minutes');

  -- 9. Notifications consistent with the records above.
  insert into public.notifications (user_id, type, title, body, link, created_at)
  select uid, type, title, body, link, at from (values
    (p_donor, 'request_new', 'New food request', 'Community Food Collective requested "Idli & Sambar Breakfast".', '/requests', n - interval '20 minutes'),
    (p_donor, 'request_new', 'New food request', 'Helping Hands Food Bank requested "Idli & Sambar Breakfast".', '/requests', n - interval '12 minutes'),
    (p_donor, 'pickup_updated', 'Handover verified', '"Sandwich Trays" was collected. The handover code was verified.', '/pickups', n - interval '30 minutes'),
    (p_receiver, 'request_accepted', 'Request accepted', 'Your request for "Vegetable Pulao" was accepted.', '/pickups', n - interval '45 minutes'),
    (p_receiver, 'request_accepted', 'Request accepted', 'Your request for "Fruit Salad Cups" was accepted.', '/pickups', n - interval '30 minutes'),
    (p_receiver, 'pickup_updated', 'Food collected', '"Sandwich Trays" was collected. Confirm receipt once it arrives.', '/pickups', n - interval '30 minutes'),
    (p_volunteer, 'pickup_assigned', 'New pickup assigned', 'You have been assigned to collect "Vegetable Pulao".', '/pickups', n - interval '40 minutes'),
    (p_admin, 'organization_pending', 'Organization awaiting review', 'Local Relief Network (receiver) is awaiting verification.', '/admin', n - interval '1 day'),
    (s_r4, 'request_rejected', 'Request declined', 'Your request for "Veg Fried Rice" was declined.', '/requests', n - interval '45 minutes'),
    (s_d2, 'listing_removed', 'Listing removed by moderator', '"Assorted Sweets Box" was removed. Note: Allergen information missing.', '/listings/' || private.demo_id('listing:removed-sweets'), n - interval '3 days 150 minutes')
  ) as t(uid, type, title, body, link, at)
  where uid is not null;

  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations where is_demo),
    'listings', (select count(*) from public.food_listings where is_demo),
    'requests', (select count(*) from public.food_requests where is_demo),
    'pickups', (select count(*) from public.pickups where is_demo),
    'verifications', (select count(*) from public.pickup_verifications v join public.pickups p on p.id = v.pickup_id where p.is_demo),
    'volunteers', array_length(v_vols, 1));
end $$;

revoke all on function public.seed_demo_data(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.seed_demo_data(uuid, uuid, uuid, uuid, jsonb) to service_role;
revoke all on function private.demo_id(text), private.demo_listing(text, uuid, uuid, text, text, text, text, numeric, text,
  integer, text, timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, text[], text),
  private.demo_request(text, uuid, uuid, uuid, text, text, timestamptz, uuid, timestamptz, text),
  private.demo_pickup(text, uuid, uuid, uuid, uuid, uuid, text, timestamptz, timestamptz, timestamptz) from public;
