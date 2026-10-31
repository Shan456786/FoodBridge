-- =====================================================================
-- FoodBridge — demo data (fictional organizations around Vijayawada /
-- VIT-AP). Every demo record has is_demo = true and is isolated from
-- real activity by the workflow RPCs. Callable only with the
-- service-role key (scripts/seed-demo.mjs), never from the browser.
-- =====================================================================

-- Notify full admins when a new organization signs up and needs review.
create or replace function private.notify_admins_new_org()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, 'organization_pending', 'Organization awaiting review',
         format('%s (%s) signed up and is awaiting verification.', new.name, new.kind), '/admin'
  from public.profiles p
  where p.role = 'admin' and p.is_demo = new.is_demo;
  return null;
end $$;

create trigger organizations_notify_admins after insert on public.organizations
  for each row execute function private.notify_admins_new_org();

create or replace function private.seed_listing(
  p_org uuid, p_creator uuid, p_title text, p_desc text, p_category text, p_diet text,
  p_qty numeric, p_unit text, p_meals integer, p_storage text,
  p_prepared timestamptz, p_safe timestamptz, p_pstart timestamptz, p_pend timestamptz,
  p_status text, p_created timestamptz, p_allergens text[], p_packaging text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
  v_id uuid;
begin
  select * into v_org from public.organizations where id = p_org;
  insert into public.food_listings (donor_org_id, created_by, title, description, category, diet, quantity,
    quantity_unit, estimated_meals, prepared_at, safe_until, pickup_start, pickup_end, storage_requirement,
    packaging, allergens, pickup_address, latitude, longitude, max_radius_km, status, handling_confirmed,
    is_demo, created_at, updated_at)
  values (p_org, p_creator, p_title, p_desc, p_category, p_diet, p_qty, p_unit, p_meals, p_prepared, p_safe,
    p_pstart, p_pend, p_storage, p_packaging, coalesce(p_allergens, '{}'), v_org.address, v_org.latitude,
    v_org.longitude, 20, p_status, true, true, p_created, p_created)
  returning id into v_id;
  return v_id;
end $$;

create or replace function private.seed_pickup(
  p_listing uuid, p_receiver_org uuid, p_requester uuid, p_volunteer uuid, p_status text,
  p_accepted_at timestamptz, p_collected_at timestamptz, p_verified_at timestamptz, p_decider uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l public.food_listings;
  v_o public.organizations;
  v_req uuid;
  v_pickup uuid;
begin
  select * into v_l from public.food_listings where id = p_listing;
  select * into v_o from public.organizations where id = p_receiver_org;
  insert into public.food_requests (listing_id, receiver_org_id, requested_by, requested_quantity, message,
    status, distance_km, decided_by, decided_at, is_demo, created_at, updated_at)
  values (p_listing, p_receiver_org, p_requester, v_l.quantity, 'We can collect within the window.',
    'accepted', round(private.haversine_km(v_o.latitude, v_o.longitude, v_l.latitude, v_l.longitude)::numeric, 2),
    p_decider, p_accepted_at, true, p_accepted_at - interval '20 minutes', p_accepted_at)
  returning id into v_req;

  insert into public.pickups (listing_id, request_id, donor_org_id, receiver_org_id, volunteer_id, status,
    assigned_at, en_route_at, collected_at, collected_by, verified_at, verified_by, is_demo, created_at, updated_at)
  values (p_listing, v_req, v_l.donor_org_id, p_receiver_org, p_volunteer, p_status,
    case when p_volunteer is not null then p_accepted_at + interval '5 minutes' end,
    case when p_status in ('en_route', 'arrived', 'collected', 'verified') then p_accepted_at + interval '15 minutes' end,
    p_collected_at, case when p_collected_at is not null then coalesce(p_volunteer, p_requester) end,
    p_verified_at, case when p_verified_at is not null then p_requester end,
    true, p_accepted_at, coalesce(p_verified_at, p_collected_at, p_accepted_at))
  returning id into v_pickup;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values
    (v_l.created_by, 'listing_created', 'food_listing', v_l.id, v_l.id, jsonb_build_object('title', v_l.title), true, v_l.created_at),
    (p_requester, 'request_submitted', 'food_request', v_req, v_l.id, jsonb_build_object('receiver_org', v_o.name), true, p_accepted_at - interval '20 minutes'),
    (p_decider, 'request_accepted', 'food_request', v_req, v_l.id, jsonb_build_object('receiver_org', v_o.name), true, p_accepted_at);
  if p_collected_at is not null then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (coalesce(p_volunteer, p_requester), 'collection_recorded', 'pickup', v_pickup, v_l.id,
            jsonb_build_object('method', 'handover_code'), true, p_collected_at);
  end if;
  if p_verified_at is not null then
    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
    values (p_requester, 'verification_completed', 'pickup', v_pickup, v_l.id,
            jsonb_build_object('meals', v_l.estimated_meals), true, p_verified_at);
  end if;
  return v_pickup;
end $$;

create or replace function public.seed_demo_data(p_donor uuid, p_receiver uuid, p_volunteer uuid, p_admin uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n timestamptz := now();
  d1 constant uuid := '00000000-0000-4000-a000-000000000d01'; -- Campus Central Canteen (demo donor login)
  d2 constant uuid := '00000000-0000-4000-a000-000000000d02'; -- Green Bowl Kitchen
  d3 constant uuid := '00000000-0000-4000-a000-000000000d03'; -- Fresh Basket Grocery
  d4 constant uuid := '00000000-0000-4000-a000-000000000d04'; -- Celebration Banquets
  r1 constant uuid := '00000000-0000-4000-a000-000000000e01'; -- Community Food Collective (demo receiver login)
  r2 constant uuid := '00000000-0000-4000-a000-000000000e02'; -- Helping Hands Food Bank
  r3 constant uuid := '00000000-0000-4000-a000-000000000e03'; -- Local Relief Network (pending)
  v_donors uuid[] := array[d1, d2, d3, d4];
  v_id uuid;
  v_req uuid;
  v_pickup uuid;
  v_x jsonb;
  v_i integer;
  v_day timestamptz;
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
    raise exception 'All four demo user ids are required.';
  end if;

  -- 1. Wipe previous demo activity (audit purge is explicitly allowed for demo rows only).
  perform set_config('foodbridge.allow_audit_purge', 'on', true);
  delete from public.audit_events where is_demo;
  perform set_config('foodbridge.allow_audit_purge', 'off', true);
  delete from public.food_listings where is_demo;
  delete from public.notifications where user_id in (p_donor, p_receiver, p_volunteer, p_admin);

  -- 2. Organizations (fictional; approximate coordinates).
  insert into public.organizations (id, name, kind, org_type, address, city, latitude, longitude,
    has_refrigeration, has_freezer, capacity_meals, verification_status, is_demo)
  values
    (d1, 'Campus Central Canteen', 'donor', 'canteen', 'Central Block, VIT-AP Campus, Inavolu', 'Amaravati', 16.4963, 80.4994, true, false, 0, 'verified', true),
    (d2, 'Green Bowl Kitchen', 'donor', 'restaurant', 'Near Benz Circle, MG Road', 'Vijayawada', 16.4996, 80.6560, true, false, 0, 'verified', true),
    (d3, 'Fresh Basket Grocery', 'donor', 'grocery', 'Main Bazaar Road', 'Mangalagiri', 16.4307, 80.5525, true, true, 0, 'verified', true),
    (d4, 'Celebration Banquets', 'donor', 'banquet_hall', 'NH-16 Service Road', 'Tadepalli', 16.4800, 80.6000, true, false, 0, 'verified', true),
    (r1, 'Community Food Collective', 'receiver', 'ngo', 'Undavalli Centre Road', 'Tadepalli', 16.4850, 80.5900, true, false, 250, 'verified', true),
    (r2, 'Helping Hands Food Bank', 'receiver', 'food_bank', 'Governorpet', 'Vijayawada', 16.5131, 80.6297, true, true, 500, 'verified', true),
    (r3, 'Local Relief Network', 'receiver', 'community_org', 'Brodipet', 'Guntur', 16.3067, 80.4365, false, false, 80, 'pending', true)
  on conflict (id) do update set
    name = excluded.name, kind = excluded.kind, org_type = excluded.org_type, address = excluded.address,
    city = excluded.city, latitude = excluded.latitude, longitude = excluded.longitude,
    has_refrigeration = excluded.has_refrigeration, has_freezer = excluded.has_freezer,
    capacity_meals = excluded.capacity_meals, verification_status = excluded.verification_status,
    verification_note = null, is_demo = true;

  -- 3. Demo users.
  update public.profiles set role = 'donor', organization_id = d1, is_demo = true,
    full_name = 'Demo Donor (Canteen Manager)', phone = null where id = p_donor;
  update public.profiles set role = 'receiver', organization_id = r1, is_demo = true,
    full_name = 'Demo Receiver (NGO Coordinator)', phone = null where id = p_receiver;
  update public.profiles set role = 'volunteer', organization_id = null, is_demo = true,
    full_name = 'Demo Volunteer', phone = null where id = p_volunteer;
  update public.profiles set role = 'admin', organization_id = null, is_demo = true,
    full_name = 'Demo Administrator', phone = null where id = p_admin;

  delete from public.organization_members where user_id in (p_donor, p_receiver, p_volunteer, p_admin)
    or organization_id in (d1, d2, d3, d4, r1, r2, r3);
  insert into public.organization_members (organization_id, user_id, member_role)
  values (d1, p_donor, 'owner'), (r1, p_receiver, 'owner');

  -- 4. Open listings (relative to now).
  perform private.seed_listing(d1, p_donor, 'Veg Biryani & Raita',
    'Freshly cooked lunch surplus from the main counter. Kept covered in hot cases.',
    'cooked_meals', 'veg', 40, 'portions', 40, 'ambient', n - interval '1 hour', n + interval '3 hours',
    n - interval '10 minutes', n + interval '150 minutes', 'available', n - interval '25 minutes',
    array['dairy'], 'Steel containers (return requested)');
  perform private.seed_listing(d3, null, 'Assorted Bread & Buns',
    'Unsold bakery items from today''s batch, sealed in bags.',
    'bakery', 'veg', 12, 'kg', 60, 'ambient', n - interval '6 hours', n + interval '20 hours',
    n + interval '1 hour', n + interval '8 hours', 'available', n - interval '2 hours',
    array['gluten'], 'Sealed plastic bags');
  perform private.seed_listing(d4, null, 'Paneer Butter Masala with Rotis',
    'Banquet surplus from an evening event. Refrigerated immediately after service.',
    'cooked_meals', 'veg', 120, 'portions', 120, 'refrigerated', n - interval '2 hours', n + interval '5 hours',
    n, n + interval '4 hours', 'available', n - interval '40 minutes',
    array['dairy', 'gluten'], 'Food-grade trays with lids');
  perform private.seed_listing(d3, null, 'Fresh Vegetables Crate',
    'Tomatoes, onions, carrots and greens. Slight cosmetic blemishes only.',
    'vegetables', 'vegan', 25, 'kg', 50, 'ambient', null, n + interval '48 hours',
    n, n + interval '24 hours', 'available', n - interval '3 hours', '{}', 'Plastic crates');
  perform private.seed_listing(d3, null, 'Curd & Buttermilk Packs',
    'Sealed dairy packs, within manufacturer date, stored at 4°C.',
    'dairy', 'veg', 30, 'litres', 60, 'refrigerated', null, n + interval '10 hours',
    n, n + interval '8 hours', 'available', n - interval '90 minutes', array['dairy'], 'Sealed sachets');
  perform private.seed_listing(d2, null, 'Chicken Curry & Rice',
    'Dinner service surplus. Needs immediate pickup.',
    'cooked_meals', 'non_veg', 35, 'portions', 35, 'ambient', n - interval '90 minutes', n + interval '50 minutes',
    n - interval '30 minutes', n + interval '45 minutes', 'available', n - interval '50 minutes',
    '{}', 'Disposable containers');
  perform private.seed_listing(d3, null, 'Frozen Parathas',
    'Packaged frozen parathas, unopened cartons.',
    'packaged_food', 'veg', 80, 'packets', 80, 'frozen', null, n + interval '5 days',
    n, n + interval '48 hours', 'available', n - interval '5 hours', array['gluten'], 'Original cartons');
  perform private.seed_listing(d4, null, 'Wedding Buffet Surplus',
    'Large surplus from a wedding reception: rice, dal, mixed vegetable curry.',
    'cooked_meals', 'veg', 300, 'portions', 300, 'refrigerated', n - interval '3 hours', n + interval '6 hours',
    n, n + interval '5 hours', 'available', n - interval '30 minutes', '{}', 'Large insulated containers');

  -- 5. Listing with two pending requests (donor demo: accept / reject).
  v_id := private.seed_listing(d1, p_donor, 'Idli & Sambar Breakfast',
    'Breakfast surplus, kept in insulated containers.',
    'cooked_meals', 'veg', 50, 'portions', 50, 'ambient', n - interval '40 minutes', n + interval '4 hours',
    n, n + interval '3 hours', 'available', n - interval '35 minutes', '{}', 'Insulated containers');
  insert into public.food_requests (listing_id, receiver_org_id, requested_by, requested_quantity, message, status, distance_km, is_demo, created_at)
  values
    (v_id, r1, p_receiver, 50, 'We can send a volunteer within 30 minutes.', 'pending',
     round(private.haversine_km(16.4850, 80.5900, 16.4963, 80.4994)::numeric, 2), true, n - interval '20 minutes'),
    (v_id, r2, null, 50, 'Our van is in the area this morning.', 'pending',
     round(private.haversine_km(16.5131, 80.6297, 16.4963, 80.4994)::numeric, 2), true, n - interval '12 minutes');
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (p_donor, 'listing_created', 'food_listing', v_id, v_id, '{"title":"Idli & Sambar Breakfast"}', true, n - interval '35 minutes'),
         (p_receiver, 'request_submitted', 'food_listing', v_id, v_id, '{"receiver_org":"Community Food Collective"}', true, n - interval '20 minutes');

  -- 6. Reserved: volunteer assigned (donor generates code -> volunteer verifies -> receiver confirms).
  v_id := private.seed_listing(d1, p_donor, 'Vegetable Pulao',
    'Lunch surplus, portioned into 30 boxes.',
    'cooked_meals', 'veg', 30, 'portions', 30, 'ambient', n - interval '1 hour', n + interval '3 hours',
    n - interval '30 minutes', n + interval '2 hours', 'reserved', n - interval '70 minutes', '{}', 'Sealed boxes');
  perform private.seed_pickup(v_id, r1, p_receiver, p_volunteer, 'assigned', n - interval '45 minutes', null, null, p_donor);

  -- 7. Reserved: no volunteer yet (receiver can assign or collect directly).
  v_id := private.seed_listing(d1, p_donor, 'Fruit Salad Cups',
    'Cut fruit cups from the juice counter, chilled.',
    'fruits', 'vegan', 40, 'items', 40, 'refrigerated', n - interval '1 hour', n + interval '6 hours',
    n, n + interval '5 hours', 'reserved', n - interval '50 minutes', '{}', 'Lidded cups');
  perform private.seed_pickup(v_id, r1, p_receiver, null, 'scheduled', n - interval '30 minutes', null, null, p_donor);

  -- 8. Collected, awaiting receiver confirmation.
  v_id := private.seed_listing(d1, p_donor, 'Sandwich Trays',
    'Veg sandwiches from a cancelled department event.',
    'bakery', 'veg', 6, 'trays', 48, 'refrigerated', n - interval '3 hours', n + interval '4 hours',
    n - interval '2 hours', n + interval '3 hours', 'collected', n - interval '150 minutes', array['gluten', 'dairy'], 'Covered trays');
  perform private.seed_pickup(v_id, r1, p_receiver, p_volunteer, 'collected', n - interval '2 hours',
    n - interval '30 minutes', null, p_donor);

  -- 9. Verified rescue history over the last 30 days (drives the impact charts).
  for v_i in 1..18 loop
    v_x := v_templates -> ((v_i - 1) % 8);
    v_day := date_trunc('day', n) - make_interval(days => 29 - ((v_i * 5) % 29)) + interval '6 hours' + make_interval(mins => v_i * 13);
    v_id := private.seed_listing(v_donors[((v_i - 1) % 4) + 1],
      case when ((v_i - 1) % 4) = 0 then p_donor end,
      v_x ->> 0, 'Rescued surplus (demo history).', v_x ->> 1, v_x ->> 2, (v_x ->> 3)::numeric, v_x ->> 4,
      (v_x ->> 5)::integer, v_x ->> 6,
      v_day - interval '1 hour', v_day + interval '8 hours', v_day, v_day + interval '6 hours',
      'completed', v_day - interval '30 minutes', '{}', null);
    perform private.seed_pickup(v_id, case when v_i % 3 = 0 then r2 else r1 end,
      case when v_i % 3 = 0 then null else p_receiver end,
      case when v_i % 2 = 0 then p_volunteer end,
      'verified', v_day + interval '20 minutes', v_day + interval '2 hours', v_day + interval '3 hours', p_donor);
  end loop;

  -- 10. Expired and cancelled history.
  v_id := private.seed_listing(d2, null, 'Mixed Veg Curry', 'Not collected in time (demo).',
    'cooked_meals', 'veg', 25, 'portions', 25, 'ambient', n - interval '2 days 4 hours', n - interval '2 days',
    n - interval '2 days 3 hours', n - interval '2 days 1 hour', 'expired', n - interval '2 days 4 hours', '{}', null);
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (null, 'listing_expired', 'food_listing', v_id, v_id, '{"title":"Mixed Veg Curry"}', true, n - interval '2 days');
  v_id := private.seed_listing(d1, p_donor, 'Lemon Rice', 'Not collected in time (demo).',
    'cooked_meals', 'veg', 20, 'portions', 20, 'ambient', n - interval '5 days 4 hours', n - interval '5 days',
    n - interval '5 days 3 hours', n - interval '5 days 1 hour', 'expired', n - interval '5 days 4 hours', '{}', null);
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo, created_at)
  values (null, 'listing_expired', 'food_listing', v_id, v_id, '{"title":"Lemon Rice"}', true, n - interval '5 days');
  v_id := private.seed_listing(d4, null, 'Dessert Platters', 'Cancelled by donor (demo).',
    'other', 'veg', 10, 'trays', 60, 'refrigerated', n - interval '8 days 2 hours', n - interval '8 days',
    n - interval '8 days 1 hour', n - interval '8 days 30 minutes', 'cancelled', n - interval '8 days 2 hours',
    array['dairy', 'nuts'], null);

  -- 11. Notifications for demo users.
  insert into public.notifications (user_id, type, title, body, link, created_at) values
    (p_donor, 'request_new', 'New food request', 'Community Food Collective requested "Idli & Sambar Breakfast".', '/requests', n - interval '20 minutes'),
    (p_donor, 'request_new', 'New food request', 'Helping Hands Food Bank requested "Idli & Sambar Breakfast".', '/requests', n - interval '12 minutes'),
    (p_receiver, 'request_accepted', 'Request accepted', 'Your request for "Vegetable Pulao" was accepted.', '/pickups', n - interval '45 minutes'),
    (p_receiver, 'pickup_updated', 'Food collected', '"Sandwich Trays" was collected. Confirm receipt once it arrives.', '/pickups', n - interval '30 minutes'),
    (p_volunteer, 'pickup_assigned', 'New pickup assigned', 'You have been assigned to collect "Vegetable Pulao".', '/pickups', n - interval '40 minutes'),
    (p_admin, 'organization_pending', 'Organization awaiting review', 'Local Relief Network (receiver) is awaiting verification.', '/admin', n - interval '1 day');

  return jsonb_build_object(
    'listings', (select count(*) from public.food_listings where is_demo),
    'requests', (select count(*) from public.food_requests where is_demo),
    'pickups', (select count(*) from public.pickups where is_demo));
end $$;

revoke all on function public.seed_demo_data(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.seed_demo_data(uuid, uuid, uuid, uuid) to service_role;
