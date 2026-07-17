# Zetryn Router

API key/provider rotation gateway for Solana memecoin trading bot infra (RPC, market data, swap APIs).

One local HTTP endpoint per provider; the router picks an active credential from the pool (round-robin), injects the key (query param / header / path-based URL), and automatically retries with the next credential on rate limits (429 → cooldown) or auth failures (401/403 → error, needs manual fix).

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `ROUTER_SECRET_KEY`: 32-byte hex string, generate with `openssl rand -hex 32` — encrypts stored API keys (AES-256-GCM). The app refuses to start without it.
   - `JWT_SECRET`: any long random string, generate with `openssl rand -hex 32` — signs the dashboard session cookie.
   - `DATA_DIR`: where `router.db` (SQLite) is stored (default `./data`)
   - `PORT`: port to bind (default 4790)
2. `npm install`
3. `npm run build`
4. Bind to `127.0.0.1` only — this app has no rate limiting of its own and is meant for internal VPS use.

## Running with PM2

```bash
npm install -g pm2
export ROUTER_SECRET_KEY=... JWT_SECRET=...
pm2 start ecosystem.config.js
pm2 save
```

## First login

Default dashboard password is `changeme` — go to Settings and change it immediately after first login.

## Bot integration

Point bot components (Scanner, Enricher, Execution) at:
`http://127.0.0.1:<PORT>/proxy/<provider-slug>/<path>`

Example: a Helius `getAccountInfo` call that would normally go to
`https://mainnet.helius-rpc.com/?api-key=KEY` becomes a POST to
`http://127.0.0.1:4790/proxy/helius/` with the same JSON-RPC body — the router
injects an active key from the pool automatically.

Default providers (seeded on first run):

| Slug | Key injection | Base URL |
|---|---|---|
| `helius` | query param `api-key` | `https://mainnet.helius-rpc.com` |
| `quicknode` | path (baked into per-credential base URL override) | per credential |
| `birdeye` | header `X-API-KEY` | `https://public-api.birdeye.so` |
| `dexscreener` | none (public API) | `https://api.dexscreener.com` |
| `jupiter` | header `x-api-key` | per credential (`https://api.jup.ag` paid / `https://lite-api.jup.ag` free) |

For QuickNode, set the credential's **Base URL override** to your full endpoint URL including the token, e.g. `https://my-endpoint.solana-mainnet.quiknode.pro/abc123token`. For Jupiter, set it to `https://api.jup.ag` (paid key) or `https://lite-api.jup.ag` (keyless).

## Tests

```bash
npm test
```
