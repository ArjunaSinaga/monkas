-- MONKAS 004: soft delete tenant (nonaktifkan, bukan hapus permanen)
-- Alasan: tabel orders menyimpan riwayat transaksi. Hapus permanen = riwayat hilang,
-- rekap omzet & tutup hari jadi rusak. Nonaktifkan = data tetap ada, bisa dipulihkan.
-- Idempotent: aman dijalankan berulang.

alter table tenants
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_tenants_active on tenants(is_active);
