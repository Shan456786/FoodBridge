-- =====================================================================
-- FoodBridge — core schema, constraints, indexes
-- All timestamps are timestamptz (stored in UTC).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in a schema that PostgREST does not expose.
create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('donor', 'receiver')),
  org_type text not null default 'other' check (org_type in (
    'restaurant', 'canteen', 'grocery', 'banquet_hall', 'community_kitchen',
    'ngo', 'food_bank', 'community_org', 'other')),
  address text check (char_length(address) <= 300),
  city text check (char_length(city) <= 80),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  has_refrigeration boolean not null default false,
  has_freezer boolean not null default false,
  capacity_meals integer not null default 0 check (capacity_meals between 0 and 100000),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  verification_note text check (char_length(verification_note) <= 500),
  is_demo boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_kind_idx on public.organizations (kind, verification_status);

-- ---------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text,
  phone text check (char_length(phone) <= 30),
  role text not null default 'volunteer' check (role in ('donor', 'receiver', 'volunteer', 'admin')),
  organization_id uuid references public.organizations (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);
create index profiles_role_idx on public.profiles (role);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------
-- Food listings
-- ---------------------------------------------------------------------
create table public.food_listings (
  id uuid primary key default gen_random_uuid(),
  donor_org_id uuid not null references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 1000),
  category text not null check (category in (
    'cooked_meals', 'bakery', 'fruits', 'vegetables', 'packaged_food', 'dairy', 'other')),
  diet text not null check (diet in ('veg', 'non_veg', 'vegan')),
  quantity numeric(10, 2) not null check (quantity > 0 and quantity <= 100000),
  quantity_unit text not null check (quantity_unit in ('kg', 'portions', 'packets', 'trays', 'litres', 'items')),
  estimated_meals integer not null check (estimated_meals between 1 and 100000),
  prepared_at timestamptz,
  safe_until timestamptz not null,
  pickup_start timestamptz not null,
  pickup_end timestamptz not null,
  storage_requirement text not null check (storage_requirement in ('ambient', 'refrigerated', 'frozen')),
  packaging text check (char_length(packaging) <= 200),
  allergens text[] not null default '{}',
  pickup_address text not null check (char_length(pickup_address) between 3 and 300),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  max_radius_km numeric(6, 2) not null default 15 check (max_radius_km > 0 and max_radius_km <= 100),
  status text not null default 'available' check (status in (
    'available', 'reserved', 'collected', 'completed', 'expired', 'cancelled', 'removed')),
  handling_confirmed boolean not null check (handling_confirmed),
  moderation_note text check (char_length(moderation_note) <= 500),
  expiry_warned_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_window_order check (pickup_start < pickup_end),
  constraint pickup_within_safe_deadline check (pickup_end <= safe_until),
  constraint prepared_before_deadline check (prepared_at is null or prepared_at < safe_until)
);
create index food_listings_status_idx on public.food_listings (status, safe_until);
create index food_listings_donor_idx on public.food_listings (donor_org_id, created_at desc);

-- ---------------------------------------------------------------------
-- Food requests
-- ---------------------------------------------------------------------
create table public.food_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.food_listings (id) on delete cascade,
  receiver_org_id uuid not null references public.organizations (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requested_quantity numeric(10, 2) not null check (requested_quantity > 0),
  message text check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  distance_km numeric(8, 2),
  decision_note text check (char_length(decision_note) <= 500),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One accepted receiver per listing (MVP: no partial fulfilment).
create unique index food_requests_one_accepted on public.food_requests (listing_id) where status = 'accepted';
-- One open request per organization per listing.
create unique index food_requests_one_open_per_org on public.food_requests (listing_id, receiver_org_id)
  where status in ('pending', 'accepted');
create index food_requests_receiver_idx on public.food_requests (receiver_org_id, created_at desc);

-- ---------------------------------------------------------------------
-- Pickups + handover verification
-- ---------------------------------------------------------------------
create table public.pickups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.food_listings (id) on delete cascade,
  request_id uuid not null unique references public.food_requests (id) on delete cascade,
  donor_org_id uuid not null references public.organizations (id) on delete cascade,
  receiver_org_id uuid not null references public.organizations (id) on delete cascade,
  volunteer_id uuid references public.profiles (id) on delete set null,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'assigned', 'en_route', 'arrived', 'collected', 'verified', 'cancelled', 'expired')),
  assigned_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  collected_at timestamptz,
  collected_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  verified_by uuid references auth.users (id) on delete set null,
  cancelled_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pickups_one_active_per_listing on public.pickups (listing_id)
  where status not in ('cancelled', 'expired');
create index pickups_volunteer_idx on public.pickups (volunteer_id);
create index pickups_receiver_idx on public.pickups (receiver_org_id);
create index pickups_donor_idx on public.pickups (donor_org_id);

-- Only bcrypt hashes of handover codes are stored. No API role can read this table.
create table public.pickup_verifications (
  id uuid primary key default gen_random_uuid(),
  pickup_id uuid not null references public.pickups (id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  invalidated_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index pickup_verifications_pickup_idx on public.pickup_verifications (pickup_id, created_at desc);

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Audit trail (append-only)
-- ---------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  listing_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index audit_events_listing_idx on public.audit_events (listing_id, created_at desc);
create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_actor_idx on public.audit_events (actor_id);
