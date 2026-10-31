-- =====================================================================
-- FoodBridge — transactional workflow RPCs (the rescue state machine)
--
-- Listing:  available -> reserved -> collected -> completed
--           available|reserved -> expired | cancelled | removed
-- Request:  pending -> accepted | rejected | cancelled ; accepted -> cancelled
-- Pickup:   scheduled -> assigned -> en_route -> arrived -> collected -> verified
--           (any pre-collection state) -> cancelled | expired
--
-- Lock order everywhere: listing row first, then request / pickup rows.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Expiry synchronisation (idempotent). Called opportunistically by
-- clients and optionally by pg_cron. All other RPCs also check
-- deadlines directly, so correctness does not depend on this running.
-- ---------------------------------------------------------------------
create or replace function public.sync_expiry()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing record;
  v_count integer := 0;
begin
  -- Expire listings past their safe-use deadline that were never collected.
  for v_listing in
    select * from public.food_listings
    where status in ('available', 'reserved') and safe_until <= now()
    for update skip locked
  loop
    update public.food_listings set status = 'expired' where id = v_listing.id;

    update public.pickups set status = 'expired', cancelled_at = now()
    where listing_id = v_listing.id and status in ('scheduled', 'assigned', 'en_route', 'arrived');

    update public.food_requests
    set status = 'cancelled', decision_note = 'Listing expired before collection', decided_at = now()
    where listing_id = v_listing.id and status = 'pending';

    perform private.notify_org(v_listing.donor_org_id, 'listing_expired', 'Listing expired',
      format('"%s" passed its safe-use deadline without being collected.', v_listing.title),
      '/listings/' || v_listing.id);

    perform private.notify_org(r.receiver_org_id, 'listing_expired', 'Listing expired',
      format('"%s" expired before collection.', v_listing.title), '/listings/' || v_listing.id)
    from public.food_requests r
    where r.listing_id = v_listing.id and r.status in ('accepted');

    insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo)
    values (null, 'listing_expired', 'food_listing', v_listing.id, v_listing.id,
            jsonb_build_object('title', v_listing.title, 'previous_status', v_listing.status), v_listing.is_demo);
    v_count := v_count + 1;
  end loop;

  -- Warn donors once when an unclaimed listing is within 60 minutes of its deadline.
  for v_listing in
    select * from public.food_listings
    where status = 'available' and expiry_warned_at is null
      and safe_until > now() and safe_until <= now() + interval '60 minutes'
    for update skip locked
  loop
    update public.food_listings set expiry_warned_at = now() where id = v_listing.id;
    perform private.notify_org(v_listing.donor_org_id, 'listing_expiring', 'Listing approaching expiry',
      format('"%s" reaches its safe-use deadline in under an hour and has not been reserved.', v_listing.title),
      '/listings/' || v_listing.id);
  end loop;

  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Receiver requests a listing
-- ---------------------------------------------------------------------
create or replace function public.request_listing(p_listing_id uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_org public.organizations;
  v_listing public.food_listings;
  v_distance double precision;
  v_request_id uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in to request food.' using errcode = '28000';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_profile.role is distinct from 'receiver' then
    raise exception 'Only receiver organizations can request food.' using errcode = '42501';
  end if;

  select * into v_org from public.organizations where id = v_profile.organization_id;
  if v_org.id is null or not private.is_org_member(v_org.id) then
    raise exception 'Your account is not linked to a receiver organization.' using errcode = '42501';
  end if;
  if v_org.verification_status <> 'verified' then
    raise exception 'Your organization must be verified by an administrator before requesting food.'
      using errcode = '42501';
  end if;

  select * into v_listing from public.food_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'Listing not found.';
  end if;
  if v_listing.is_demo <> v_org.is_demo then
    raise exception 'Demo organizations can only interact with demo listings (and vice versa).';
  end if;
  if v_listing.safe_until <= now() then
    raise exception 'This listing has passed its safe-use deadline and can no longer be requested.';
  end if;
  if v_listing.status <> 'available' then
    raise exception 'This listing is no longer available for requests.';
  end if;
  if v_listing.pickup_end <= now() then
    raise exception 'The pickup window for this listing has closed.';
  end if;

  if v_listing.storage_requirement = 'refrigerated' and not (v_org.has_refrigeration or v_org.has_freezer) then
    raise exception 'This food requires refrigerated storage, which your organization has not declared.';
  end if;
  if v_listing.storage_requirement = 'frozen' and not v_org.has_freezer then
    raise exception 'This food requires frozen storage, which your organization has not declared.';
  end if;
  if v_org.capacity_meals < v_listing.estimated_meals then
    raise exception 'This listing (% meals) exceeds your declared handling capacity (% meals).',
      v_listing.estimated_meals, v_org.capacity_meals;
  end if;

  v_distance := private.haversine_km(v_org.latitude, v_org.longitude, v_listing.latitude, v_listing.longitude);
  if v_distance is not null and v_distance > v_listing.max_radius_km then
    raise exception 'Your organization is % km away, outside the donor''s % km pickup radius.',
      round(v_distance::numeric, 1), v_listing.max_radius_km;
  end if;

  begin
    insert into public.food_requests (listing_id, receiver_org_id, requested_by, requested_quantity,
                                      message, distance_km, is_demo)
    values (v_listing.id, v_org.id, v_uid, v_listing.quantity, nullif(left(trim(p_message), 500), ''),
            round(v_distance::numeric, 2), v_listing.is_demo)
    returning id into v_request_id;
  exception when unique_violation then
    raise exception 'Your organization already has an open request for this listing.';
  end;

  perform private.notify_org(v_listing.donor_org_id, 'request_new', 'New food request',
    format('%s requested "%s".', v_org.name, v_listing.title), '/requests');
  perform private.log_audit('request_submitted', 'food_request', v_request_id, v_listing.id,
    jsonb_build_object('receiver_org', v_org.name, 'distance_km', round(v_distance::numeric, 2)), v_listing.is_demo);

  return v_request_id;
end $$;

-- ---------------------------------------------------------------------
-- Donor accepts / rejects a request (atomic; prevents double booking)
-- ---------------------------------------------------------------------
create or replace function public.respond_to_request(p_request_id uuid, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_listing_id uuid;
  v_listing public.food_listings;
  v_req public.food_requests;
  v_org public.organizations;
  v_other record;
  v_pickup_id uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;

  select listing_id into v_listing_id from public.food_requests where id = p_request_id;
  if v_listing_id is null then
    raise exception 'Request not found.';
  end if;

  -- Lock the listing first: concurrent accepts on the same listing serialise here.
  select * into v_listing from public.food_listings where id = v_listing_id for update;
  if not private.is_org_member(v_listing.donor_org_id) then
    raise exception 'Only the donor organization can respond to this request.' using errcode = '42501';
  end if;

  select * into v_req from public.food_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'This request has already been %.', v_req.status;
  end if;

  select * into v_org from public.organizations where id = v_req.receiver_org_id;

  if not p_accept then
    update public.food_requests
    set status = 'rejected', decision_note = nullif(left(trim(p_note), 500), ''), decided_by = v_uid, decided_at = now()
    where id = v_req.id;
    perform private.notify_org(v_req.receiver_org_id, 'request_rejected', 'Request declined',
      format('Your request for "%s" was declined.', v_listing.title), '/requests');
    perform private.log_audit('request_rejected', 'food_request', v_req.id, v_listing.id,
      jsonb_build_object('receiver_org', v_org.name), v_listing.is_demo);
    return jsonb_build_object('request_id', v_req.id, 'status', 'rejected');
  end if;

  if v_listing.safe_until <= now() or v_listing.pickup_end <= now() then
    raise exception 'This listing has expired or its pickup window has closed; it cannot be accepted.';
  end if;
  if v_listing.status <> 'available' then
    raise exception 'This listing is already reserved or closed.';
  end if;
  if v_org.verification_status <> 'verified' then
    raise exception 'The receiving organization is no longer verified.';
  end if;

  update public.food_requests
  set status = 'accepted', decision_note = nullif(left(trim(p_note), 500), ''), decided_by = v_uid, decided_at = now()
  where id = v_req.id;

  update public.food_listings set status = 'reserved' where id = v_listing.id;

  insert into public.pickups (listing_id, request_id, donor_org_id, receiver_org_id, is_demo)
  values (v_listing.id, v_req.id, v_listing.donor_org_id, v_req.receiver_org_id, v_listing.is_demo)
  returning id into v_pickup_id;

  -- Close out competing requests; they never consumed inventory.
  for v_other in
    select r.id, r.receiver_org_id from public.food_requests r
    where r.listing_id = v_listing.id and r.status = 'pending' and r.id <> v_req.id
    for update
  loop
    update public.food_requests
    set status = 'rejected', decision_note = 'Another organization was selected for this listing.',
        decided_by = v_uid, decided_at = now()
    where id = v_other.id;
    perform private.notify_org(v_other.receiver_org_id, 'request_rejected', 'Request not selected',
      format('"%s" was reserved by another organization.', v_listing.title), '/requests');
    perform private.log_audit('request_rejected', 'food_request', v_other.id, v_listing.id,
      jsonb_build_object('reason', 'another_request_accepted'), v_listing.is_demo);
  end loop;

  perform private.notify_org(v_req.receiver_org_id, 'request_accepted', 'Request accepted',
    format('Your request for "%s" was accepted. Arrange pickup before %s UTC.', v_listing.title,
           to_char(v_listing.pickup_end at time zone 'UTC', 'DD Mon HH24:MI')), '/pickups');
  perform private.log_audit('request_accepted', 'food_request', v_req.id, v_listing.id,
    jsonb_build_object('receiver_org', v_org.name, 'pickup_id', v_pickup_id), v_listing.is_demo);

  return jsonb_build_object('request_id', v_req.id, 'status', 'accepted', 'pickup_id', v_pickup_id);
end $$;

-- ---------------------------------------------------------------------
-- Receiver cancels their own request (pending, or accepted before collection)
-- ---------------------------------------------------------------------
create or replace function public.cancel_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing_id uuid;
  v_listing public.food_listings;
  v_req public.food_requests;
  v_pickup public.pickups;
begin
  select listing_id into v_listing_id from public.food_requests where id = p_request_id;
  if v_listing_id is null then
    raise exception 'Request not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_listing_id for update;
  select * into v_req from public.food_requests where id = p_request_id for update;

  if not private.is_org_member(v_req.receiver_org_id) then
    raise exception 'Only the requesting organization can cancel this request.' using errcode = '42501';
  end if;
  if v_req.status not in ('pending', 'accepted') then
    raise exception 'This request is already %.', v_req.status;
  end if;

  if v_req.status = 'accepted' then
    select * into v_pickup from public.pickups where request_id = v_req.id for update;
    if v_pickup.status not in ('scheduled', 'assigned', 'en_route', 'arrived') then
      raise exception 'This pickup has already been collected and cannot be cancelled.';
    end if;
    update public.pickups set status = 'cancelled', cancelled_at = now() where id = v_pickup.id;
    update public.pickup_verifications set invalidated_at = now()
      where pickup_id = v_pickup.id and used_at is null and invalidated_at is null;
    update public.food_listings
    set status = case when safe_until > now() and pickup_end > now() then 'available' else 'expired' end
    where id = v_listing.id;
    perform private.notify_user(v_pickup.volunteer_id, 'pickup_updated', 'Pickup cancelled',
      format('The pickup for "%s" was cancelled by the receiver.', v_listing.title), '/pickups');
  end if;

  update public.food_requests set status = 'cancelled', decided_at = now() where id = v_req.id;

  perform private.notify_org(v_listing.donor_org_id, 'request_cancelled', 'Request withdrawn',
    format('A receiver withdrew its request for "%s".', v_listing.title), '/listings/' || v_listing.id);
  perform private.log_audit('request_cancelled', 'food_request', v_req.id, v_listing.id,
    jsonb_build_object('previous_status', v_req.status), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Donor cancels a listing (before collection)
-- ---------------------------------------------------------------------
create or replace function public.cancel_listing(p_listing_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing public.food_listings;
  v_req record;
begin
  select * into v_listing from public.food_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'Listing not found.';
  end if;
  if not private.is_org_member(v_listing.donor_org_id) then
    raise exception 'Only the donor organization can cancel this listing.' using errcode = '42501';
  end if;
  if v_listing.status not in ('available', 'reserved') then
    raise exception 'A % listing cannot be cancelled.', v_listing.status;
  end if;

  update public.food_listings set status = 'cancelled' where id = v_listing.id;

  for v_req in
    select id, receiver_org_id from public.food_requests
    where listing_id = v_listing.id and status in ('pending', 'accepted') for update
  loop
    update public.food_requests set status = 'cancelled', decision_note = 'Listing cancelled by donor',
      decided_at = now() where id = v_req.id;
    perform private.notify_org(v_req.receiver_org_id, 'listing_cancelled', 'Listing cancelled',
      format('"%s" was cancelled by the donor.', v_listing.title), '/requests');
  end loop;

  perform private.notify_user(p.volunteer_id, 'pickup_updated', 'Pickup cancelled',
    format('The pickup for "%s" was cancelled by the donor.', v_listing.title), '/pickups')
  from public.pickups p where p.listing_id = v_listing.id and p.status in ('scheduled', 'assigned', 'en_route', 'arrived');

  update public.pickup_verifications v set invalidated_at = now()
  from public.pickups p
  where v.pickup_id = p.id and p.listing_id = v_listing.id and v.used_at is null and v.invalidated_at is null;

  update public.pickups set status = 'cancelled', cancelled_at = now()
  where listing_id = v_listing.id and status in ('scheduled', 'assigned', 'en_route', 'arrived');

  perform private.log_audit('listing_cancelled', 'food_listing', v_listing.id, v_listing.id,
    jsonb_build_object('reason', nullif(left(trim(p_reason), 300), '')), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Volunteer directory for receivers arranging collection
-- ---------------------------------------------------------------------
create or replace function public.list_volunteers()
returns table (id uuid, full_name text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where profiles.id = auth.uid();
  if coalesce(v_profile.role, '') not in ('receiver', 'admin') then
    raise exception 'Only receiver organizations can view volunteers.' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name from public.profiles p
    where p.role = 'volunteer' and p.is_demo = v_profile.is_demo
    order by p.full_name;
end $$;

-- ---------------------------------------------------------------------
-- Receiver assigns (or unassigns) a volunteer to a pickup
-- ---------------------------------------------------------------------
create or replace function public.assign_volunteer(p_pickup_id uuid, p_volunteer_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pickup public.pickups;
  v_listing public.food_listings;
  v_volunteer public.profiles;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if v_pickup.id is null then
    raise exception 'Pickup not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_pickup.listing_id for update;
  select * into v_pickup from public.pickups where id = p_pickup_id for update;

  if not private.is_org_member(v_pickup.receiver_org_id) then
    raise exception 'Only the receiving organization can assign volunteers.' using errcode = '42501';
  end if;
  if v_pickup.status not in ('scheduled', 'assigned') then
    raise exception 'Volunteers can only be changed before the pickup is under way.';
  end if;

  if p_volunteer_id is null then
    update public.pickups set volunteer_id = null, status = 'scheduled', assigned_at = null where id = v_pickup.id;
    perform private.notify_user(v_pickup.volunteer_id, 'pickup_updated', 'Pickup unassigned',
      format('You were removed from the pickup for "%s".', v_listing.title), '/pickups');
  else
    select * into v_volunteer from public.profiles where id = p_volunteer_id;
    if v_volunteer.id is null or v_volunteer.role <> 'volunteer' then
      raise exception 'Selected user is not a volunteer.';
    end if;
    if v_volunteer.is_demo <> v_pickup.is_demo then
      raise exception 'Demo pickups can only be assigned to demo volunteers (and vice versa).';
    end if;
    update public.pickups set volunteer_id = v_volunteer.id, status = 'assigned', assigned_at = now()
    where id = v_pickup.id;
    perform private.notify_user(v_volunteer.id, 'pickup_assigned', 'New pickup assigned',
      format('You have been assigned to collect "%s".', v_listing.title), '/pickups');
    perform private.notify_org(v_pickup.donor_org_id, 'pickup_updated', 'Volunteer assigned',
      format('%s will collect "%s".', coalesce(nullif(v_volunteer.full_name, ''), 'A volunteer'), v_listing.title),
      '/pickups');
  end if;

  perform private.log_audit('pickup_assigned', 'pickup', v_pickup.id, v_listing.id,
    jsonb_build_object('volunteer_id', p_volunteer_id), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Collector reports progress (en_route / arrived)
-- ---------------------------------------------------------------------
create or replace function public.update_pickup_progress(p_pickup_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pickup public.pickups;
  v_listing public.food_listings;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if v_pickup.id is null then
    raise exception 'Pickup not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_pickup.listing_id for update;
  select * into v_pickup from public.pickups where id = p_pickup_id for update;

  -- coalesce: volunteer_id may be NULL, and NULL logic must never grant access.
  if not coalesce(v_pickup.volunteer_id = auth.uid()
          or (v_pickup.volunteer_id is null and private.is_org_member(v_pickup.receiver_org_id)), false) then
    raise exception 'Only the assigned collector can update this pickup.' using errcode = '42501';
  end if;
  if v_listing.safe_until <= now() then
    raise exception 'This listing has passed its safe-use deadline.';
  end if;

  if p_status = 'en_route' and v_pickup.status in ('scheduled', 'assigned') then
    update public.pickups set status = 'en_route', en_route_at = now() where id = v_pickup.id;
  elsif p_status = 'arrived' and v_pickup.status in ('scheduled', 'assigned', 'en_route') then
    update public.pickups set status = 'arrived', arrived_at = now() where id = v_pickup.id;
  else
    raise exception 'Cannot move a % pickup to %.', v_pickup.status, p_status;
  end if;

  perform private.notify_org(v_pickup.donor_org_id, 'pickup_updated', 'Pickup update',
    format('Collector for "%s" is %s.', v_listing.title, replace(p_status, '_', ' ')), '/pickups');
  if v_pickup.volunteer_id is not null then
    perform private.notify_org(v_pickup.receiver_org_id, 'pickup_updated', 'Pickup update',
      format('Volunteer for "%s" is %s.', v_listing.title, replace(p_status, '_', ' ')), '/pickups');
  end if;
  perform private.log_audit('pickup_status_updated', 'pickup', v_pickup.id, v_listing.id,
    jsonb_build_object('status', p_status), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Donor generates a one-time handover code. Only a bcrypt hash is stored;
-- the plaintext is returned once to the donor. Generating a new code
-- invalidates any previous unused code.
-- ---------------------------------------------------------------------
create or replace function public.generate_handover_code(p_pickup_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pickup public.pickups;
  v_listing public.food_listings;
  v_code text;
  v_expires timestamptz;
  v_recent integer;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if v_pickup.id is null then
    raise exception 'Pickup not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_pickup.listing_id for update;
  select * into v_pickup from public.pickups where id = p_pickup_id for update;

  if not private.is_org_member(v_pickup.donor_org_id) then
    raise exception 'Only the donor organization can generate a handover code.' using errcode = '42501';
  end if;
  if v_pickup.status not in ('scheduled', 'assigned', 'en_route', 'arrived') then
    raise exception 'A handover code cannot be generated for a % pickup.', v_pickup.status;
  end if;
  if v_listing.safe_until <= now() then
    raise exception 'This listing has passed its safe-use deadline.';
  end if;

  select count(*) into v_recent from public.pickup_verifications
  where pickup_id = v_pickup.id and created_at > now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'Too many codes generated for this pickup. Please wait before generating another.';
  end if;

  update public.pickup_verifications set invalidated_at = now()
  where pickup_id = v_pickup.id and used_at is null and invalidated_at is null;

  v_code := lpad((((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000))::text, 6, '0');
  v_expires := least(now() + interval '30 minutes', v_listing.safe_until);

  insert into public.pickup_verifications (pickup_id, code_hash, expires_at, created_by)
  values (v_pickup.id, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_expires, auth.uid());

  perform private.log_audit('handover_code_generated', 'pickup', v_pickup.id, v_listing.id,
    jsonb_build_object('expires_at', v_expires), v_listing.is_demo);

  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

-- ---------------------------------------------------------------------
-- Collector (assigned volunteer or receiver member) enters the code at
-- the physical handover. Failed attempts are counted and persisted, so
-- this returns a result object instead of raising for wrong codes.
-- ---------------------------------------------------------------------
create or replace function public.verify_handover_code(p_pickup_id uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_pickup public.pickups;
  v_listing public.food_listings;
  v_ver public.pickup_verifications;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if v_pickup.id is null then
    raise exception 'Pickup not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_pickup.listing_id for update;
  select * into v_pickup from public.pickups where id = p_pickup_id for update;

  if not (coalesce(v_pickup.volunteer_id = v_uid, false) or private.is_org_member(v_pickup.receiver_org_id)) then
    raise exception 'Only the assigned volunteer or the receiving organization can verify this handover.'
      using errcode = '42501';
  end if;
  if v_pickup.status in ('collected', 'verified') then
    return jsonb_build_object('ok', false, 'reason', 'already_completed',
      'message', 'This handover has already been verified. Codes cannot be reused.');
  end if;
  if v_pickup.status not in ('scheduled', 'assigned', 'en_route', 'arrived') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_state',
      'message', format('This pickup is %s.', v_pickup.status));
  end if;
  if v_listing.safe_until <= now() then
    return jsonb_build_object('ok', false, 'reason', 'listing_expired',
      'message', 'This listing has passed its safe-use deadline.');
  end if;
  if p_code is null or p_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'reason', 'format', 'message', 'Enter the 6-digit code.');
  end if;

  select * into v_ver from public.pickup_verifications
  where pickup_id = v_pickup.id and used_at is null and invalidated_at is null
  order by created_at desc limit 1
  for update;

  if v_ver.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_active_code',
      'message', 'No active code. Ask the donor to generate a handover code.');
  end if;
  if v_ver.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired',
      'message', 'This code has expired. Ask the donor to generate a new one.');
  end if;
  if v_ver.attempts >= v_ver.max_attempts then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'message', 'Too many incorrect attempts. Ask the donor to generate a new code.');
  end if;

  if extensions.crypt(p_code, v_ver.code_hash) <> v_ver.code_hash then
    update public.pickup_verifications set attempts = attempts + 1 where id = v_ver.id;
    perform private.log_audit('handover_verification_failed', 'pickup', v_pickup.id, v_listing.id,
      jsonb_build_object('attempt', v_ver.attempts + 1), v_listing.is_demo);
    return jsonb_build_object('ok', false, 'reason', 'mismatch',
      'message', 'Incorrect code.', 'attempts_remaining', v_ver.max_attempts - v_ver.attempts - 1);
  end if;

  update public.pickup_verifications set used_at = now(), used_by = v_uid where id = v_ver.id;
  update public.pickups set status = 'collected', collected_at = now(), collected_by = v_uid where id = v_pickup.id;
  update public.food_listings set status = 'collected' where id = v_listing.id;

  perform private.notify_org(v_pickup.donor_org_id, 'pickup_updated', 'Handover verified',
    format('"%s" was collected. The handover code was verified.', v_listing.title), '/pickups');
  perform private.notify_org(v_pickup.receiver_org_id, 'pickup_updated', 'Food collected',
    format('"%s" was collected. Confirm receipt once it arrives.', v_listing.title), '/pickups');
  perform private.log_audit('collection_recorded', 'pickup', v_pickup.id, v_listing.id,
    jsonb_build_object('method', 'handover_code'), v_listing.is_demo);

  return jsonb_build_object('ok', true, 'status', 'collected', 'message', 'Handover verified. Food marked as collected.');
end $$;

-- ---------------------------------------------------------------------
-- Receiver confirms receipt -> verified rescue (counts in impact metrics)
-- ---------------------------------------------------------------------
create or replace function public.confirm_receipt(p_pickup_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_pickup public.pickups;
  v_listing public.food_listings;
begin
  select * into v_pickup from public.pickups where id = p_pickup_id;
  if v_pickup.id is null then
    raise exception 'Pickup not found.';
  end if;
  select * into v_listing from public.food_listings where id = v_pickup.listing_id for update;
  select * into v_pickup from public.pickups where id = p_pickup_id for update;

  if not private.is_org_member(v_pickup.receiver_org_id) then
    raise exception 'Only the receiving organization can confirm receipt.' using errcode = '42501';
  end if;
  if v_pickup.status <> 'collected' then
    raise exception 'Receipt can only be confirmed after a verified handover (pickup is %).', v_pickup.status;
  end if;

  update public.pickups set status = 'verified', verified_at = now(), verified_by = auth.uid() where id = v_pickup.id;
  update public.food_listings set status = 'completed' where id = v_listing.id;

  perform private.notify_org(v_pickup.donor_org_id, 'pickup_verified', 'Rescue verified',
    format('"%s" was received and verified. %s meals rescued.', v_listing.title, v_listing.estimated_meals), '/impact');
  perform private.notify_user(v_pickup.volunteer_id, 'pickup_verified', 'Rescue verified',
    format('Delivery of "%s" was confirmed. Thank you!', v_listing.title), '/pickups');
  perform private.log_audit('verification_completed', 'pickup', v_pickup.id, v_listing.id,
    jsonb_build_object('meals', v_listing.estimated_meals), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Admin moderation
-- ---------------------------------------------------------------------
create or replace function public.admin_set_org_verification(p_org_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
begin
  select * into v_org from public.organizations where id = p_org_id for update;
  if v_org.id is null then
    raise exception 'Organization not found.';
  end if;
  if not private.admin_can_see(v_org.is_demo) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'verified', 'rejected') then
    raise exception 'Invalid verification status.';
  end if;

  update public.organizations set verification_status = p_status,
    verification_note = nullif(left(trim(p_note), 500), '') where id = v_org.id;

  perform private.notify_org(v_org.id, 'organization_verification',
    case p_status when 'verified' then 'Organization verified' when 'rejected' then 'Verification declined'
                  else 'Verification reset' end,
    case p_status when 'verified' then format('%s is now verified on FoodBridge.', v_org.name)
                  else format('%s verification status: %s.', v_org.name, p_status) end,
    '/profile');
  perform private.log_audit('organization_' || p_status, 'organization', v_org.id, null,
    jsonb_build_object('name', v_org.name, 'note', p_note), v_org.is_demo);
end $$;

create or replace function public.admin_remove_listing(p_listing_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_listing public.food_listings;
  v_req record;
begin
  select * into v_listing from public.food_listings where id = p_listing_id for update;
  if v_listing.id is null then
    raise exception 'Listing not found.';
  end if;
  if not private.admin_can_see(v_listing.is_demo) then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;
  if v_listing.status not in ('available', 'reserved') then
    raise exception 'Only open listings can be removed (this one is %).', v_listing.status;
  end if;

  update public.food_listings set status = 'removed', moderation_note = nullif(left(trim(p_note), 500), '')
  where id = v_listing.id;

  for v_req in
    select id, receiver_org_id from public.food_requests
    where listing_id = v_listing.id and status in ('pending', 'accepted') for update
  loop
    update public.food_requests set status = 'cancelled', decision_note = 'Listing removed by moderator',
      decided_at = now() where id = v_req.id;
    perform private.notify_org(v_req.receiver_org_id, 'listing_cancelled', 'Listing removed',
      format('"%s" was removed by a moderator.', v_listing.title), '/requests');
  end loop;
  update public.pickup_verifications v set invalidated_at = now()
  from public.pickups p
  where v.pickup_id = p.id and p.listing_id = v_listing.id and v.used_at is null and v.invalidated_at is null;
  update public.pickups set status = 'cancelled', cancelled_at = now()
  where listing_id = v_listing.id and status in ('scheduled', 'assigned', 'en_route', 'arrived');

  perform private.notify_org(v_listing.donor_org_id, 'listing_removed', 'Listing removed by moderator',
    format('"%s" was removed. Note: %s', v_listing.title, coalesce(nullif(trim(p_note), ''), 'none')),
    '/listings/' || v_listing.id);
  perform private.log_audit('listing_removed', 'food_listing', v_listing.id, v_listing.id,
    jsonb_build_object('note', p_note), v_listing.is_demo);
end $$;

-- ---------------------------------------------------------------------
-- Impact analytics. Only verified handovers count as rescued food.
-- p_scope: 'mine' (caller's organization / volunteer work) or 'platform'.
-- ---------------------------------------------------------------------
create or replace function public.get_impact_stats(p_scope text default 'mine')
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_profile public.profiles;
  v_result jsonb;
  v_co2_factor constant numeric := 2.5; -- kg CO2e per kg of food (estimate; see README)
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'Please sign in.' using errcode = '28000';
  end if;

  with scoped as (
    select l.*
    from public.food_listings l
    where case
      when p_scope = 'platform' or v_profile.role = 'admin' then true
      when v_profile.role = 'donor' then l.donor_org_id = v_profile.organization_id
      when v_profile.role = 'receiver' then exists (
        select 1 from public.pickups p where p.listing_id = l.id and p.receiver_org_id = v_profile.organization_id)
      when v_profile.role = 'volunteer' then exists (
        select 1 from public.pickups p where p.listing_id = l.id and p.volunteer_id = v_profile.id)
      else false end
  ),
  verified as (
    -- one verified pickup per listing by construction (one accepted request per listing)
    select s.*, p.verified_at
    from scoped s
    join public.pickups p on p.listing_id = s.id and p.status = 'verified'
    where s.status = 'completed'
  ),
  totals as (
    select
      count(*) as total_listings,
      coalesce(sum(estimated_meals), 0) as listed_meals,
      coalesce(sum(estimated_meals) filter (where status in ('collected', 'completed')), 0) as collected_meals,
      count(*) filter (where status = 'expired' or (status in ('available', 'reserved') and safe_until <= now())) as expired_listings,
      count(*) filter (where status = 'cancelled') as cancelled_listings,
      count(*) filter (where status = 'available' and safe_until > now()) as active_listings,
      count(*) filter (where status in ('reserved', 'collected') and safe_until > now() or status = 'collected') as in_progress,
      count(*) filter (where status in ('completed', 'expired', 'cancelled', 'removed')
                       or (status in ('available', 'reserved') and safe_until <= now())) as closed_listings,
      count(*) filter (where is_demo) as demo_listings
    from scoped
  ),
  vtotals as (
    select count(*) as successful_pickups,
           coalesce(sum(estimated_meals), 0) as verified_meals,
           coalesce(sum(quantity) filter (where quantity_unit = 'kg'), 0) as verified_kg,
           coalesce(sum(quantity) filter (where quantity_unit = 'litres'), 0) as verified_litres
    from verified
  )
  select jsonb_build_object(
    'scope', case when p_scope = 'platform' or v_profile.role = 'admin' then 'platform' else 'mine' end,
    'total_listings', t.total_listings,
    'listed_meals', t.listed_meals,
    'collected_meals', t.collected_meals,
    'verified_meals', v.verified_meals,
    'verified_kg', v.verified_kg,
    'verified_litres', v.verified_litres,
    'co2e_kg_estimate', round(v.verified_kg * v_co2_factor, 1),
    'co2e_factor', v_co2_factor,
    'expired_listings', t.expired_listings,
    'cancelled_listings', t.cancelled_listings,
    'active_listings', t.active_listings,
    'in_progress', t.in_progress,
    'successful_pickups', v.successful_pickups,
    'completion_rate', case when t.closed_listings = 0 then null
                            else round(v.successful_pickups::numeric / t.closed_listings * 100, 1) end,
    'demo_listings', t.demo_listings,
    'timeseries', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'verified_meals', d.verified_meals, 'listed_meals', d.listed_meals)
                       order by d.day)
      from (
        select g.day::date as day,
          coalesce((select sum(estimated_meals) from verified where verified_at::date = g.day::date), 0) as verified_meals,
          coalesce((select sum(estimated_meals) from scoped where created_at::date = g.day::date), 0) as listed_meals
        from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') g(day)
      ) d), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', c.category, 'verified_meals', c.verified_meals, 'listings', c.listings)
                       order by c.verified_meals desc)
      from (
        select s.category, count(*) as listings,
               coalesce(sum(s.estimated_meals) filter (where s.status = 'completed'), 0) as verified_meals
        from scoped s group by s.category
      ) c), '[]'::jsonb),
    'status_distribution', coalesce((
      select jsonb_agg(jsonb_build_object('status', x.status, 'count', x.n))
      from (
        select case when status in ('available', 'reserved') and safe_until <= now() then 'expired' else status end as status,
               count(*) as n
        from scoped group by 1
      ) x), '[]'::jsonb),
    'top_donors', coalesce((
      select jsonb_agg(jsonb_build_object('name', o.name, 'listings', d.listings, 'verified_meals', d.verified_meals)
                       order by d.verified_meals desc, d.listings desc)
      from (
        select s.donor_org_id, count(*) as listings,
               coalesce(sum(s.estimated_meals) filter (where s.status = 'completed'), 0) as verified_meals
        from scoped s group by s.donor_org_id order by 3 desc, 2 desc limit 6
      ) d join public.organizations o on o.id = d.donor_org_id), '[]'::jsonb)
  ) into v_result
  from totals t, vtotals v;

  return v_result;
end $$;

-- ---------------------------------------------------------------------
-- Function privileges: callable by signed-in users only.
-- ---------------------------------------------------------------------
revoke all on function
  public.sync_expiry(), public.request_listing(uuid, text), public.respond_to_request(uuid, boolean, text),
  public.cancel_request(uuid), public.cancel_listing(uuid, text), public.list_volunteers(),
  public.assign_volunteer(uuid, uuid), public.update_pickup_progress(uuid, text),
  public.generate_handover_code(uuid), public.verify_handover_code(uuid, text), public.confirm_receipt(uuid),
  public.admin_set_org_verification(uuid, text, text), public.admin_remove_listing(uuid, text),
  public.get_impact_stats(text)
from public, anon;

grant execute on function
  public.sync_expiry(), public.request_listing(uuid, text), public.respond_to_request(uuid, boolean, text),
  public.cancel_request(uuid), public.cancel_listing(uuid, text), public.list_volunteers(),
  public.assign_volunteer(uuid, uuid), public.update_pickup_progress(uuid, text),
  public.generate_handover_code(uuid), public.verify_handover_code(uuid, text), public.confirm_receipt(uuid),
  public.admin_set_org_verification(uuid, text, text), public.admin_remove_listing(uuid, text),
  public.get_impact_stats(text)
to authenticated, service_role;
