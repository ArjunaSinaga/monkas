-- MONKAS schema 005: hardening hash (PIN tenant & password admin)
-- Tujuan: tutup kebocoran baca pin_hash / password_hash lewat anon key,
-- TANPA mematikan alur login/kasir/admin.
--
-- Cara: verifikasi hash dipindah ke fungsi SECURITY DEFINER di database,
-- lalu hak SELECT/UPDATE kolom hash dicabut dari anon.
-- Idempotent: aman dijalankan berulang.

-- ============ 1. Fungsi login & verifikasi ============

create or replace function public.monkas_login_tenant(p_name text, p_hash text)
returns table (id uuid, name text)
language sql
security definer
set search_path = public
as $$
  select t.id, t.name
  from tenants t
  where t.name = p_name and t.pin_hash = p_hash and t.is_active = true
  limit 1;
$$;

create or replace function public.monkas_login_admin(p_username text, p_hash text)
returns table (id uuid, username text)
language sql
security definer
set search_path = public
as $$
  select a.id, a.username
  from admins a
  where a.username = p_username and a.password_hash = p_hash
  limit 1;
$$;

-- ============ 2. Fungsi tulis yang butuh verifikasi admin ============

create or replace function public.monkas_admin_set_tenant_pin(
  p_username text, p_admin_hash text, p_tenant uuid, p_new_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from admins where username = p_username and password_hash = p_admin_hash
  ) then
    return false;
  end if;
  update tenants set pin_hash = p_new_hash where id = p_tenant;
  return found;
end;
$$;

create or replace function public.monkas_admin_set_tenant_active(
  p_username text, p_admin_hash text, p_tenant uuid, p_active boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from admins where username = p_username and password_hash = p_admin_hash
  ) then
    return false;
  end if;
  update tenants
     set is_active = p_active,
         deleted_at = case when p_active then null else now() end
   where id = p_tenant;
  return found;
end;
$$;

create or replace function public.monkas_admin_set_password(
  p_username text, p_old_hash text, p_new_hash text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update admins
     set password_hash = p_new_hash
   where username = p_username and password_hash = p_old_hash;
  return found;
end;
$$;

-- ============ 3. Hak akses ============
-- RPC di atas boleh dipanggil anon, tapi tabel hash tidak bisa dibaca langsung.
grant execute on function public.monkas_login_tenant(text, text) to anon, authenticated;
grant execute on function public.monkas_login_admin(text, text) to anon, authenticated;
grant execute on function public.monkas_admin_set_tenant_pin(text, text, uuid, text) to anon, authenticated;
grant execute on function public.monkas_admin_set_tenant_active(text, text, uuid, boolean) to anon, authenticated;
grant execute on function public.monkas_admin_set_password(text, text, text) to anon, authenticated;

revoke select on public.admins from anon, authenticated;
revoke update on public.admins from anon, authenticated;
revoke insert on public.admins from anon, authenticated;

revoke select on public.tenants from anon, authenticated;
grant select (id, name, qris_photo_url, created_at, is_active) on public.tenants to anon;
grant insert on public.tenants to anon;
grant update (is_active, deleted_at, qris_photo_url, name) on public.tenants to anon;

-- Catatan: RLS penuh (products/orders) masih fase berikutnya dan butuh
-- SUPABASE_SERVICE_ROLE_KEY di server karena app belum punya user auth.
