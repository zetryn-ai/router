# Zetryn Router — API Key & Provider Rotation Gateway

**Status:** Disetujui (fase awal)
**Tanggal:** 2026-07-17

## Latar Belakang

Bot trading memecoin Solana (Scanner, Enricher, Execution) memakai beberapa provider eksternal (RPC node, data API, swap API), masing-masing dengan beberapa API key/akun untuk menghindari rate-limit. Terinspirasi dari [9Router](https://github.com/decolua/9router) — gateway lokal yang merotasi API key LLM — proyek ini membangun gateway serupa tapi khusus untuk provider infrastruktur trading: RPC node dan data/swap API, bukan LLM.

Bot belum dibangun; router ini adalah komponen fondasi pertama yang dibangun sebelum bot lengkap.

## Tujuan Fase Awal

- Satu endpoint proxy lokal yang menerima request dari komponen bot (Scanner/Enricher/Execution) dan meneruskannya ke provider asli dengan API key yang sedang aktif dari pool rotasi.
- Rotasi round-robin antar credential per provider, dengan cooldown otomatis saat kena rate-limit.
- Dashboard web untuk mengelola provider & credential (CRUD), memantau status key, dan melihat log request ringan.
- Cakupan provider fase awal: **Helius** (RPC), **QuickNode** (RPC), **Birdeye** (data API), **DexScreener** (data API), **Jupiter** (Swap/Quote API). LLM key rotation eksplisit di luar cakupan fase ini.

## Riset Provider (Fakta, Bukan Asumsi)

| Provider | Auth | Method | Base URL per akun | Rate-limit signal |
|---|---|---|---|---|
| Helius | Query param `?api-key=` | JSON-RPC POST (+ REST GET/POST untuk `/v0/...`) | Sama untuk semua akun (`mainnet.helius-rpc.com`) | HTTP 429 / JSON-RPC error `-32005`, tanpa header rate-limit |
| QuickNode | Token di path URL (`https://xxx.quiknode.pro/TOKEN/`) atau header `x-token` | JSON-RPC POST (RPC), GET/POST campuran (REST produk lain) | **Beda per akun/endpoint** (subdomain + token unik) | HTTP 429 + header `retry-after` |
| Birdeye | Header `X-API-KEY` (+ `x-chain`) | GET | Sama untuk semua akun (`public-api.birdeye.so`) | HTTP 429, tanpa header rate-limit eksplisit |
| DexScreener | Umumnya tanpa API key (endpoint publik) | GET | Sama untuk semua (`api.dexscreener.com`) | HTTP 429, limit ~60 req/menit per endpoint |
| Jupiter | Header `x-api-key` | GET `/quote`, POST `/swap`, `/swap-instructions` | **Beda per tier**: `lite-api.jup.ag` (keyless) vs `api.jup.ag` (keyed) | Header eksplisit `x-ratelimit-remaining` / `x-ratelimit-current` / `x-ratelimit-reset` (sliding window 60s) |

**Implikasi desain kunci**: skema data tidak bisa berasumsi "base URL tetap per provider, hanya key yang beda" — QuickNode dan Jupiter butuh base URL yang bisa berbeda per credential/akun.

## Arsitektur

Single Next.js app (App Router) yang menjalankan dua peran dalam satu proses:

- **Proxy engine**: route `ANY /proxy/:providerSlug/*path` — generic reverse-proxy yang forward request apa adanya (method, body, query dipertahankan), menyuntikkan credential aktif dari pool.
- **Dashboard + Management API**: UI web untuk CRUD provider & credential, monitoring status, log ringan. Dilindungi password tunggal + session cookie.

**Storage**: SQLite (`better-sqlite3`, WAL mode) di `${DATA_DIR}/router.db`. Dipilih karena skala kecil (5-20 credential per provider) dan untuk menghindari race condition file JSON.

**Deploy**: satu proses Node.js di VPS pribadi (46.250.236.190), dijalankan via PM2, bind ke `127.0.0.1` + port internal.

Alasan single-app (bukan proxy/dashboard terpisah): proxy adalah operasi I/O forward, bukan CPU-bound — berbagi proses dengan dashboard tidak menambah latency signifikan pada skala request yang diperkirakan. Kompleksitas operasional dua service tidak sepadan dengan manfaatnya di skala ini.

## Skema Data

```
providers
├── id (pk)
├── slug                      -- "helius" | "quicknode" | "birdeye" | "dexscreener" | "jupiter" | custom
├── name
├── default_inject_location   -- "query" | "header" | "path"
├── default_inject_key_name   -- "api-key" | "X-API-KEY" | "x-api-key" | null
├── default_base_url          -- boleh null jika tiap credential wajib override
└── created_at

credentials
├── id (pk)
├── provider_id (fk)
├── label
├── base_url_override         -- null = pakai default_base_url provider
├── secret_value              -- terenkripsi at-rest (AES-256-GCM, key dari ROUTER_SECRET_KEY env)
├── inject_location_override
├── inject_key_name_override
├── status                    -- "active" | "cooldown" | "disabled" | "error"
├── cooldown_until             -- timestamp nullable
├── last_used_at
├── last_error
└── created_at

request_logs                   -- ringan, auto-prune setelah N hari
├── id (pk)
├── credential_id (fk)
├── provider_slug
├── status_code
├── duration_ms
└── created_at

settings
├── key (pk)                  -- "dashboard_password_hash", "cooldown_seconds_default:<slug>", dst
└── value
```

Catatan:
- `secret_value` dienkripsi at-rest — beda dari 9Router asli yang menyimpan plaintext.
- `base_url_override` per credential menangani kasus QuickNode (URL unik per akun) dan Jupiter (domain beda per tier key).
- `request_logs` tidak menyimpan body request/response — hanya metadata untuk usage & debugging dasar.

## Alur Proxy & Rotasi

```
1. Terima request di /proxy/:providerSlug/*path
2. Ambil daftar credential provider dengan status="active"
   → jika kosong: cek credential cooldown yang sudah lewat waktunya → reaktivasi → ulangi
   → jika tetap kosong: return 503 {error: "no available credential"}
3. Pilih credential berikutnya via round-robin pointer (in-memory per provider,
   urutan awal direstore dari last_used_at saat proses start)
4. Resolusi target:
   - base_url = credential.base_url_override ?? provider.default_base_url
   - inject_location/key_name = override kredensial ?? default provider
   - suntik key sesuai lokasi (query param / header / sudah termasuk di base_url untuk path-based)
5. Forward request ke provider asli, response di-stream passthrough (termasuk SSE bila ada)
6. Evaluasi hasil:
   - 2xx → update last_used_at, catat log ringan, kembalikan response ke bot
   - 429 / rate-limit signal provider → status="cooldown",
     cooldown_until = now + cooldown_seconds (default per-provider, konfigurasi di settings),
     retry ke credential berikutnya (maksimum percobaan = jumlah credential aktif saat itu)
   - 401/403 → status="error" (permanen, butuh perbaikan manual di dashboard),
     TIDAK auto-cooldown, lanjut ke credential berikutnya
   - Network error/timeout → diperlakukan seperti transient, cooldown singkat, lanjut retry
7. Semua credential gagal → return 502 {error, provider, triedCredentials: n}
```

Rotasi fase awal: **round-robin murni**. Strategi LRU dan priority-based di-parkir untuk iterasi berikutnya — skema data (`status`, `last_used_at`, `cooldown_until`) dirancang agar strategi lain bisa ditambahkan tanpa migrasi skema.

## Dashboard UI

Halaman (auth-gated via session cookie, login password tunggal):

1. **Login** — password → session cookie (httpOnly, signed dengan `JWT_SECRET`)
2. **Providers overview** — daftar provider dengan ringkasan jumlah credential aktif/cooldown/error
3. **Provider detail** — CRUD credential: tambah (label, secret, override base_url/inject bila perlu), lihat status + last_error + cooldown countdown, aksi manual reactivate/disable/delete
4. **Request logs** — tabel metadata request dengan filter provider & status code
5. **Settings** — ubah password dashboard, atur `cooldown_seconds` default per provider
6. **Add custom provider** — form untuk provider di luar 5 bawaan (slug, default_base_url, default_inject_location/key_name)

## Error Handling

- Transient (429, network/timeout) → cooldown otomatis, retry ke credential lain dalam request yang sama.
- Permanen (401/403) → status "error", tidak di-retry-loop, perlu intervensi manual via dashboard.
- Semua credential gagal → 502 dengan detail provider & jumlah percobaan.
- Kegagalan startup (`ROUTER_SECRET_KEY` env hilang) → app refuse to start, pesan eksplisit — tidak pernah fallback diam-diam ke plaintext.
- SQLite dijalankan dalam WAL mode untuk mengurangi risiko lock pada concurrent read/write single-process.

## Testing (Scope Fase Awal)

- Unit test rotasi round-robin dan transisi status (active → cooldown → active setelah expiry; active → error untuk 401/403).
- Unit test resolusi `base_url_override` vs `default_base_url`, dan tiap `inject_location` (query/header/path).
- Manual/integration test: satu credential nyata per provider untuk verifikasi end-to-end proxy.
- Tidak ada target coverage % formal untuk fase ini — fokus ke jalur kritis (rotasi, cooldown, inject key).

## Di Luar Cakupan Fase Ini

- Rotasi LRU dan priority-based (diparkir, skema data sudah kompatibel ke depan).
- LLM provider key rotation (OrchestratorAgent scoring) — fase terpisah.
- Cloud sync / multi-instance router.
- Analytics/usage dashboard mendalam (grafik, agregasi biaya) — request_logs hanya metadata dasar.
- Proxy/dashboard sebagai service terpisah (Opsi B) — tidak dipilih untuk fase ini.
