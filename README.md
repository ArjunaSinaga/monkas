# MONKAS — Monjali Kasir
App kasir standalone multitenant, 1 QRIS bersama manual. Terpisah dari kerja.inc.

## Migrasi database
File SQL ada di `supabase/migrations/`. Urutan apply: `001_core.sql` -> `002_admins.sql` -> `003_products_category.sql`.

Project monkas: `kfpfgmbuansfggxdqitd` (dashboard: https://supabase.com/dashboard/project/kfpfgmbuansfggxdqitd).

Cara apply (pilih salah satu):

- Dashboard Supabase > SQL Editor > tempel isi file > Run (satu file satu Run).
- CLI: `supabase link --project-ref kfpfgmbuansfggxdqitd` lalu `supabase db push`.
- Management API tanpa CLI (butuh PAT dari https://supabase.com/dashboard/account/tokens):

```powershell
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
Invoke-RestMethod -Method Post `
  -Uri "https://api.supabase.com/v1/projects/kfpfgmbuansfggxdqitd/database/query" `
  -Headers @{ Authorization = "Bearer $env:SUPABASE_ACCESS_TOKEN"; "Content-Type" = "application/json" } `
  -Body (@{ query = (Get-Content supabase/migrations/003_products_category.sql -Raw) } | ConvertTo-Json)
```


Migrasi baru (status "sudah dijalankan" di project live belum diverifikasi):

| File | Isi |
|---|---|
| `003_products_category.sql` | tambah kolom `category` di tabel `products` + index `(tenant_id, category)` |

Kolom `category` dipakai halaman `/admin`. Kalau migrasi belum dijalankan, halaman admin
menampilkan pesan error saat memuat produk.


## Fitur: AI per request (OpenAI)

Setiap request ke `GET /api/ai` memicu satu percobaan panggilan OpenAI (Responses API).
Panggilan ke OpenAI hanya benar-benar terjadi kalau: inputnya belum ada di cache,
budget belum habis, dan request yang sama belum sedang berjalan (dedupe). Kalau OpenAI
error, timeout, atau key kosong, kasir tetap jalan normal (degraded, bukan 500).

| Endpoint | Fungsi |
|---|---|
| `GET /api/ai?intent=kasir&tenant=...&items=...` | Saran singkat untuk kasir (dipakai halaman `/kasir`) |
| `GET /api/ai?stats=1` | Ringkasan request, cache hit, token terpakai, dan estimasi biaya USD |

Pengaman biaya (atur lewat `.env.local`):

| Env | Default | Fungsi |
|---|---|---|
| `OPENAI_MODEL` | `gpt-5-nano` | Model termurah: input $0.05/1M token, output $0.40/1M token |
| `OPENAI_CACHE_TTL_MS` | `600000` | Input identik dalam TTL ini = 0 panggilan ke OpenAI |
| `OPENAI_MAX_CALLS_PER_HOUR` | `60` | Batas panggilan OpenAI per jam per proses |
| `OPENAI_MAX_SPEND_USD` | `1` | Batas estimasi spend USD per proses |
| `OPENAI_TIMEOUT_MS` | `8000` | Batas tunggu sebelum fallback |
| `OPENAI_MAX_RETRIES` | `2` | Retry hanya untuk 429/5xx/network error |

Estimasi biaya per panggilan (gpt-5-nano, input 180 token + output 24 token):
$0.000009 + $0.0000096 = $0.0000186 per panggilan. 60 panggilan/jam = $0,0011/jam.
Key API hanya dibaca di server, tidak pernah dikirim ke browser.

Tes tanpa API key (mock OpenAI-compatible di repo):

```bash
node scripts/mock-openai.mjs
# .env.local: OPENAI_API_KEY=test, OPENAI_BASE_URL=http://127.0.0.1:8787/v1
```

Harga model mengikuti https://platform.openai.com/docs/pricing (cek ulang saat harga berubah).