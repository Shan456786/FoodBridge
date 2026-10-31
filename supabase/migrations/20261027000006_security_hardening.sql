-- =====================================================================
-- FoodBridge — security hardening (audit 2026-10-27)
--
-- 1. Anonymous visitors get column-limited reads: no admin review notes,
--    creator account ids or internal moderation fields.
-- 2. Signed-in users can no longer execute the generic private.log_audit()
--    (it would allow forged audit events if the private schema were ever
--    exposed). The listing audit trigger now calls a narrow function that
--    derives everything from the row and only logs for the donor's own org.
-- =====================================================================

-- 1. Column-limited anonymous access ------------------------------------
revoke select on public.organizations from anon;
grant select (id, name, kind, org_type, city, verification_status, is_demo) on public.organizations to anon;

revoke select on public.food_listings from anon;
grant select (id, donor_org_id, title, description, category, diet, quantity, quantity_unit, estimated_meals,
  prepared_at, safe_until, pickup_start, pickup_end, storage_requirement, packaging, allergens, pickup_address,
  latitude, longitude, max_radius_km, status, handling_confirmed, is_demo, created_at, updated_at)
  on public.food_listings to anon;

-- 2. Narrow audit logging for direct listing writes ----------------------
create or replace function private.audit_listing_write(p_listing_id uuid, p_op text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_l public.food_listings;
begin
  select * into v_l from public.food_listings where id = p_listing_id;
  if v_l.id is null or p_op not in ('INSERT', 'UPDATE') or not private.is_org_member(v_l.donor_org_id) then
    return; -- nothing to log for rows the caller does not own
  end if;
  insert into public.audit_events (actor_id, action, entity_type, entity_id, listing_id, metadata, is_demo)
  values (auth.uid(), case p_op when 'INSERT' then 'listing_created' else 'listing_updated' end,
          'food_listing', v_l.id, v_l.id,
          case p_op when 'INSERT' then jsonb_build_object('title', v_l.title, 'meals', v_l.estimated_meals)
                    else jsonb_build_object('title', v_l.title) end,
          v_l.is_demo);
end $$;

create or replace function private.audit_listing_change()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return null; -- RPCs (running as the owner) write their own audit events
  end if;
  perform private.audit_listing_write(new.id, tg_op);
  return null;
end $$;

revoke all on function private.audit_listing_write(uuid, text) from public;
grant execute on function private.audit_listing_write(uuid, text) to authenticated;
revoke execute on function private.log_audit(text, text, uuid, uuid, jsonb, boolean) from authenticated;
