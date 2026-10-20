-- MONKAS 003: field category pada tabel products.
-- Sumber: blueprint 5.2 (kategori Minuman/Makanan untuk filter kasir).
-- Idempotent: aman dijalankan berulang.
alter table products
  add column if not exists category text not null default 'Minuman';

-- Index composite untuk filter kasir per tenant + kategori (nanti dipakai halaman /kasir).
create index if not exists idx_products_tenant_category on products(tenant_id, category);
