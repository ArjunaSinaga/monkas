# MONKAS — Monjali Kasir
App kasir standalone multitenant, 1 QRIS bersama manual. Terpisah dari kerja.inc.

## Migrasi database
File SQL ada di `supabase/migrations/`. Cara apply (pilih salah satu):

- Dashboard Supabase > SQL Editor > tempel isi file > Run.
- CLI: `supabase link --project-ref <ref>` lalu `supabase db push`.

Migrasi baru (status "sudah dijalankan" di project live belum diverifikasi):

| File | Isi |
|---|---|
| `003_products_category.sql` | tambah kolom `category` di tabel `products` + index `(tenant_id, category)` |

Kolom `category` dipakai halaman `/admin`. Kalau migrasi belum dijalankan, halaman admin
menampilkan pesan error saat memuat produk.

