-- MONKAS schema 001: 4 tabel inti
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  qris_photo_url text,
  pin_hash text not null,
  created_at timestamptz default now()
);
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  is_active boolean default true,
  created_at timestamptz default now()
);
create table if not exists variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  price_delta_cents integer not null default 0,
  created_at timestamptz default now()
);
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  items jsonb not null,
  total_cents integer not null check (total_cents >= 0),
  paid_at timestamptz default now(),
  voided boolean default false
);
create index if not exists idx_products_tenant on products(tenant_id);
create index if not exists idx_variants_product on variants(product_id);
create index if not exists idx_orders_tenant on orders(tenant_id);
