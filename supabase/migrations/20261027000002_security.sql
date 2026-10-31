-- =====================================================================
-- FoodBridge — helper functions, triggers, privileges and RLS
-- =====================================================================

-- ---------------------------------------------------------------------
-- Private helpers (not exposed through the API)
-- ---------------------------------------------------------------------
create or replace function private.haversine_km(lat1 double precision, lon1 double precision,
                                                lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lon1 is null or lat2 is null or lon2 is null then null
  else 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)))
  end
$$;

create or replace function private.try_float(v text)
returns double precision language plpgsql immutable as $$
begin
  return v::double precision;
exception when others then
  return null;
end $$;

create or replace function private.current_role_name()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Full (non-demo) administrator.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_demo)
$$;

-- Demo administrator: may only see / act on demo records.
create or replace function private.is_demo_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_demo)
$$;

create or replace function private.admin_can_see(p_is_demo boolean)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select private.is_admin() or (private.is_demo_admin() and coalesce(p_is_demo, false))
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.organization_members where organization_id = p_org and user_id = auth.uid())
$$;

create or replace function private.is_listing_donor(p_listing uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.food_listings l
    join public.organization_members m on m.organization_id = l.donor_org_id
    where l.id = p_listing and m.user_id = auth.uid())
$$;

-- Receiver org member with a request on the listing, or the assigned volunteer.
create or replace function private.is_listing_participant(p_listing uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
      select 1 from public.food_requests r
      join public.organization_members m on m.organization_id = r.receiver_org_id
      where r.listing_id = p_listing and m.user_id = auth.uid())
    or exists (
      select 1 from public.pickups p where p.listing_id = p_listing and p.volunteer_id = auth.uid())
$$;

create or replace function private.can_view_profile(p_target uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select
    p_target = auth.uid()
    -- same organization
    or exists (
      select 1 from public.organization_members a
      join public.organization_members b on a.organization_id = b.organization_id
      where a.user_id = auth.uid() and b.user_id = p_target)
    -- volunteer <-> donor/receiver members on a shared pickup
    or exists (
      select 1 from public.pickups p
      join public.organization_members m on m.organization_id in (p.donor_org_id, p.receiver_org_id)
      where (p.volunteer_id = p_target and m.user_id = auth.uid())
         or (p.volunteer_id = auth.uid() and m.user_id = p_target))
    -- donor <-> receiver members on a shared pickup
    or exists (
      select 1 from public.pickups p
      join public.organization_members m1 on m1.organization_id in (p.donor_org_id, p.receiver_org_id)
      join public.organization_members m2 on m2.organization_id in (p.donor_org_id, p.receiver_org_id)
      where m1.user_id = auth.uid() and m2.user_id = p_target)
$$;

create or replace function private.log_audit(p_action text, p_entity_type text, p_entity_id uuid,
                                             p_listing_id uuid, p_metadata jsonb, p_is_demo boolean)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_listing_id, coalesce(p_metadata, '{}'::jsonb),
          coalesce(p_is_demo, false))
$$;

create or replace function private.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link where p_user is not null
$$;

create or replace function private.notify_org(p_org uuid, p_type text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (user_id, type, title, body, link)
  select m.user_id, p_type, p_title, p_body, p_link
  from public.organization_members m where m.organization_id = p_org
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.haversine_km(double precision, double precision, double precision, double precision),
  private.is_admin(), private.is_demo_admin(), private.admin_can_see(boolean),
  private.is_org_member(uuid), private.is_listing_donor(uuid), private.is_listing_participant(uuid),
  private.can_view_profile(uuid), private.current_role_name()
to anon, authenticated, service_role;
-- Needed by the listing audit trigger, which runs as the calling client role.
-- (The private schema is not exposed through PostgREST.)
grant execute on function private.log_audit(text, text, uuid, uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger food_listings_touch before update on public.food_listings
  for each row execute function private.touch_updated_at();
create trigger food_requests_touch before update on public.food_requests
  for each row execute function private.touch_updated_at();
create trigger pickups_touch before update on public.pickups
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- New user -> profile (+ organization for donors/receivers)
-- Role is taken from signup metadata but can never be 'admin'.
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role text := coalesce(v_meta ->> 'role', 'volunteer');
  v_org_type text := coalesce(v_meta ->> 'org_type', 'other');
  v_org_id uuid;
begin
  if v_role not in ('donor', 'receiver', 'volunteer') then
    v_role := 'volunteer';
  end if;

  insert into public.profiles (id, full_name, email, role, phone)
  values (new.id, left(coalesce(v_meta ->> 'full_name', ''), 120), new.email, v_role,
          nullif(left(coalesce(v_meta ->> 'phone', ''), 30), ''));

  if v_role in ('donor', 'receiver') and coalesce(v_meta ->> 'skip_org', 'false') <> 'true' then
    if v_org_type not in ('restaurant', 'canteen', 'grocery', 'banquet_hall', 'community_kitchen',
                          'ngo', 'food_bank', 'community_org', 'other') then
      v_org_type := 'other';
    end if;

    insert into public.organizations (name, kind, org_type, address, city, latitude, longitude,
                                      has_refrigeration, has_freezer, capacity_meals, created_by)
    values (
      left(coalesce(nullif(trim(v_meta ->> 'org_name'), ''), 'Unnamed organization'), 120),
      v_role,
      v_org_type,
      left(v_meta ->> 'address', 300),
      left(v_meta ->> 'city', 80),
      case when private.try_float(v_meta ->> 'latitude') between -90 and 90
           then private.try_float(v_meta ->> 'latitude') end,
      case when private.try_float(v_meta ->> 'longitude') between -180 and 180
           then private.try_float(v_meta ->> 'longitude') end,
      coalesce((v_meta ->> 'has_refrigeration') = 'true', false),
      coalesce((v_meta ->> 'has_freezer') = 'true', false),
      greatest(0, least(100000, coalesce(private.try_float(v_meta ->> 'capacity_meals'), 0)::integer)),
      new.id)
    returning id into v_org_id;

    insert into public.organization_members (organization_id, user_id, member_role)
    values (v_org_id, new.id, 'owner');

    update public.profiles set organization_id = v_org_id where id = new.id;
  end if;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Defence in depth: end users can never change role / org / demo flag on their profile.
create or replace function private.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role
       or new.organization_id is distinct from old.organization_id
       or new.is_demo is distinct from old.is_demo
       or new.id is distinct from old.id) then
    raise exception 'You cannot change your role or organization.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------
-- Listing validation for direct (client) inserts/updates.
-- Security-definer RPCs run as the table owner and skip these checks.
-- ---------------------------------------------------------------------
create or replace function private.validate_listing()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_org public.organizations;
begin
  -- Only apply to writes coming straight from API clients (RPCs run as the owner).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select * into v_org from public.organizations where id = new.donor_org_id;
    new.status := 'available';
    new.created_by := auth.uid();
    new.is_demo := coalesce(v_org.is_demo, false);
    new.expiry_warned_at := null;
    new.moderation_note := null;
    if new.prepared_at is not null and new.prepared_at > now() + interval '5 minutes' then
      raise exception 'Preparation time cannot be in the future.';
    end if;
  end if;

  if new.safe_until <= now() then
    raise exception 'The safe-use deadline must be in the future.';
  end if;
  if new.pickup_end <= now() then
    raise exception 'The pickup window must end in the future.';
  end if;
  if new.pickup_end > new.safe_until then
    raise exception 'The pickup window cannot extend beyond the safe-use deadline.';
  end if;
  return new;
end $$;

create trigger food_listings_validate before insert or update on public.food_listings
  for each row execute function private.validate_listing();

create or replace function private.audit_listing_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_audit('listing_created', 'food_listing', new.id, new.id,
      jsonb_build_object('title', new.title, 'meals', new.estimated_meals), new.is_demo);
  elsif tg_op = 'UPDATE' then
    perform private.log_audit('listing_updated', 'food_listing', new.id, new.id,
      jsonb_build_object('title', new.title), new.is_demo);
  end if;
  return null;
end $$;

create trigger food_listings_audit after insert or update on public.food_listings
  for each row execute function private.audit_listing_change();

-- ---------------------------------------------------------------------
-- Append-only audit trail
-- ---------------------------------------------------------------------
create or replace function private.audit_append_only()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('foodbridge.allow_audit_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'Audit events are append-only.' using errcode = '42501';
end $$;

create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function private.audit_append_only();

-- ---------------------------------------------------------------------
-- Privileges. Supabase grants ALL to anon/authenticated by default;
-- we revoke and grant back only what clients may do directly.
-- Everything else goes through security-definer RPCs.
-- ---------------------------------------------------------------------
revoke all on public.organizations, public.profiles, public.organization_members, public.food_listings,
  public.food_requests, public.pickups, public.pickup_verifications, public.notifications,
  public.audit_events from anon, authenticated;

grant select on public.organizations, public.food_listings to anon, authenticated;
grant select on public.profiles, public.organization_members, public.food_requests, public.pickups,
  public.notifications, public.audit_events to authenticated;

grant update (name, org_type, address, city, latitude, longitude, has_refrigeration, has_freezer, capacity_meals)
  on public.organizations to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (donor_org_id, title, description, category, diet, quantity, quantity_unit, estimated_meals,
  prepared_at, safe_until, pickup_start, pickup_end, storage_requirement, packaging, allergens,
  pickup_address, latitude, longitude, max_radius_km, handling_confirmed)
  on public.food_listings to authenticated;
grant update (title, description, category, diet, quantity, quantity_unit, estimated_meals,
  prepared_at, safe_until, pickup_start, pickup_end, storage_requirement, packaging, allergens,
  pickup_address, latitude, longitude, max_radius_km, handling_confirmed)
  on public.food_listings to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.food_listings enable row level security;
alter table public.food_requests enable row level security;
alter table public.pickups enable row level security;
alter table public.pickup_verifications enable row level security; -- no policies: unreadable via API
alter table public.notifications enable row level security;
alter table public.audit_events enable row level security;

-- Organizations: public directory (no personal data is stored here).
create policy organizations_read on public.organizations for select to anon, authenticated using (true);
create policy organizations_owner_update on public.organizations for update to authenticated
  using (exists (select 1 from public.organization_members m
                 where m.organization_id = id and m.user_id = auth.uid() and m.member_role = 'owner'))
  with check (exists (select 1 from public.organization_members m
                 where m.organization_id = id and m.user_id = auth.uid() and m.member_role = 'owner'));

-- Profiles
create policy profiles_read on public.profiles for select to authenticated
  using (private.can_view_profile(id) or private.admin_can_see(is_demo));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Organization members
create policy org_members_read on public.organization_members for select to authenticated
  using (user_id = auth.uid() or private.is_org_member(organization_id) or private.is_admin());

-- Listings
create policy listings_public_read on public.food_listings for select to anon, authenticated
  using (status = 'available' and safe_until > now());
create policy listings_party_read on public.food_listings for select to authenticated
  using (private.is_org_member(donor_org_id) or private.is_listing_participant(id)
         or private.admin_can_see(is_demo));
create policy listings_donor_insert on public.food_listings for insert to authenticated
  with check (
    private.is_org_member(donor_org_id)
    and private.current_role_name() = 'donor'
    and exists (select 1 from public.organizations o where o.id = donor_org_id and o.kind = 'donor'));
create policy listings_donor_update on public.food_listings for update to authenticated
  using (private.is_org_member(donor_org_id) and status = 'available')
  with check (private.is_org_member(donor_org_id) and status = 'available');

-- Requests
create policy requests_read on public.food_requests for select to authenticated
  using (private.is_org_member(receiver_org_id) or private.is_listing_donor(listing_id)
         or private.admin_can_see(is_demo));

-- Pickups
create policy pickups_read on public.pickups for select to authenticated
  using (private.is_org_member(donor_org_id) or private.is_org_member(receiver_org_id)
         or volunteer_id = auth.uid() or private.admin_can_see(is_demo));

-- Notifications
create policy notifications_own_read on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Audit events
create policy audit_read on public.audit_events for select to authenticated
  using (actor_id = auth.uid()
         or private.admin_can_see(is_demo)
         or (listing_id is not null and (private.is_listing_donor(listing_id)
                                         or private.is_listing_participant(listing_id))));

-- Realtime for notifications (when the publication exists, i.e. on Supabase).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
