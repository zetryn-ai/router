# Zetryn Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single Next.js app that proxies bot-trading infra requests (RPC/data/swap providers) through a rotating pool of API keys with automatic cooldown, plus a password-protected dashboard to manage providers and credentials.

**Architecture:** Single Next.js 15 App Router app running one process: API routes under `/proxy/[slug]/[...path]` do generic reverse-proxying with credential injection and round-robin+cooldown rotation; API routes under `/api/*` back a password-gated dashboard UI; SQLite (`better-sqlite3`, WAL mode) is the single source of truth for providers, credentials, and lightweight request logs.

**Tech Stack:** Next.js 15 (App Router, TypeScript), better-sqlite3, Zod, Tailwind CSS, Vitest for unit tests, `jose` for signed session cookies, Node's built-in `crypto` (AES-256-GCM) for secret encryption.

## Global Constraints

- Node.js 24 (confirmed installed: v24.15.0) — use native `fetch`, no polyfills.
- Secrets (`secret_value`) must be encrypted at rest with AES-256-GCM using a key derived from the `ROUTER_SECRET_KEY` env var — app must refuse to start if this env var is missing.
- Proxy responses must be streamed passthrough (no full-body buffering) to keep Jupiter swap execution latency low.
- Round-robin rotation state is in-memory per provider, reseeded from `last_used_at` order on process start — no external state store.
- Rate-limit (429) and network/timeout errors are transient → credential goes to `cooldown` with a `cooldown_until` timestamp. Auth errors (401/403) are permanent → credential goes to `error`, never auto-recovered.
- No plaintext secret storage anywhere, including logs.
- `request_logs` stores metadata only (status code, duration, timestamps) — never request/response bodies.
- Dashboard auth is a single password (hashed, stored in `settings`) + signed httpOnly session cookie — no multi-user accounts.
- Default 5 providers (Helius, QuickNode, Birdeye, DexScreener, Jupiter) must be seeded on first run with their documented default inject location/key name (see spec table).

---

## File Structure

```
router/
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── .env.example
├── src/
│   ├── lib/
│   │   ├── db.ts                    # SQLite connection singleton + migration runner
│   │   ├── migrations/
│   │   │   └── 001_init.sql         # providers, credentials, request_logs, settings tables
│   │   ├── crypto.ts                # encryptSecret/decryptSecret (AES-256-GCM)
│   │   ├── auth.ts                  # password hash/verify, session cookie sign/verify
│   │   ├── providers.repo.ts        # CRUD for providers table
│   │   ├── credentials.repo.ts      # CRUD + status transitions for credentials table
│   │   ├── logs.repo.ts             # insert + prune + query request_logs
│   │   ├── settings.repo.ts         # get/set settings key-value
│   │   ├── rotation.ts              # in-memory round-robin picker per provider
│   │   ├── seed.ts                  # seeds 5 default providers on first run
│   │   └── schemas.ts               # Zod schemas for provider/credential input validation
│   ├── app/
│   │   ├── proxy/[slug]/[...path]/route.ts   # the generic reverse-proxy handler
│   │   ├── login/page.tsx
│   │   ├── login/actions.ts                  # server action: verify password, set cookie
│   │   ├── (dashboard)/layout.tsx            # auth-gate wrapper, redirects to /login
│   │   ├── (dashboard)/page.tsx              # providers overview
│   │   ├── (dashboard)/providers/[slug]/page.tsx   # provider detail + credential CRUD
│   │   ├── (dashboard)/logs/page.tsx         # request logs table
│   │   ├── (dashboard)/settings/page.tsx     # password change + cooldown defaults
│   │   └── api/
│   │       ├── providers/route.ts             # GET list, POST create custom provider
│   │       ├── credentials/route.ts           # POST create credential
│   │       ├── credentials/[id]/route.ts      # PATCH (reactivate/disable), DELETE
│   │       ├── logs/route.ts                  # GET paginated logs with filters
│   │       └── settings/route.ts              # GET/PUT settings
│   └── middleware.ts                # protects (dashboard) routes, allows /proxy and /login
└── tests/
    ├── rotation.test.ts
    ├── crypto.test.ts
    ├── credentials.repo.test.ts
    └── proxy-resolve.test.ts        # tests URL/inject resolution logic in isolation
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx` (placeholder, replaced in Task 9)
- Create: `src/app/globals.css`

**Interfaces:**
- Produces: a runnable Next.js 15 TypeScript app with Tailwind configured, and a working `vitest` test runner.

- [ ] **Step 1: Scaffold Next.js app**

Run:
```bash
cd /mnt/data/Project/zetryn/router
npx --yes create-next-app@latest . --typescript --tailwind --app --no-src-dir=false --import-alias "@/*" --eslint --yes
```
Expected: Next.js project files created (`package.json`, `next.config.ts`, `tsconfig.json`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`).

- [ ] **Step 2: Install additional dependencies**

Run:
```bash
npm install better-sqlite3 zod jose
npm install -D vitest @types/better-sqlite3 @vitest/coverage-v8
```
Expected: dependencies added to `package.json`.

- [ ] **Step 3: Add vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Add test script to package.json**

Edit `package.json` scripts section to include:
```json
"test": "vitest run"
```

- [ ] **Step 5: Create .env.example**

Create `.env.example`:
```
ROUTER_SECRET_KEY=
JWT_SECRET=
DATA_DIR=./data
PORT=4790
```

- [ ] **Step 6: Verify dev server boots**

Run: `npm run build`
Expected: build succeeds with no errors (default Next.js starter page).

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, better-sqlite3, zod, vitest"
```

---

### Task 2: SQLite schema + migration runner

**Files:**
- Create: `src/lib/migrations/001_init.sql`
- Create: `src/lib/db.ts`
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `process.env.DATA_DIR` (defaults to `./data` if unset)
- Produces: `getDb(): Database` (from `src/lib/db.ts`) — a singleton `better-sqlite3` connection with WAL mode enabled and migrations applied. All later repo modules import `getDb`.

- [ ] **Step 1: Write the migration SQL**

Create `src/lib/migrations/001_init.sql`:
```sql
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_inject_location TEXT NOT NULL CHECK (default_inject_location IN ('query','header','path')),
  default_inject_key_name TEXT,
  default_base_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  base_url_override TEXT,
  secret_value TEXT NOT NULL,
  inject_location_override TEXT CHECK (inject_location_override IN ('query','header','path') OR inject_location_override IS NULL),
  inject_key_name_override TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cooldown','disabled','error')),
  cooldown_until TEXT,
  last_used_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id INTEGER REFERENCES credentials(id) ON DELETE SET NULL,
  provider_slug TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credentials_provider_id ON credentials(provider_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
```

- [ ] **Step 2: Write the failing test**

Create `tests/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-db')

beforeEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('getDb', () => {
  it('creates all expected tables', async () => {
    const { getDb } = await import('../src/lib/db')
    const db = getDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    expect(names).toEqual(
      expect.arrayContaining(['providers', 'credentials', 'request_logs', 'settings'])
    )
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    const { getDb } = await import('../src/lib/db')
    const db1 = getDb()
    const db2 = getDb()
    expect(db1).toBe(db2)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/db'"

- [ ] **Step 4: Implement db.ts**

Create `src/lib/db.ts`:
```typescript
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

let instance: Database.Database | null = null

export function getDb(): Database.Database {
  if (instance) return instance

  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const db = new Database(path.join(dataDir, 'router.db'))
  db.pragma('journal_mode = WAL')

  const migrationPath = path.join(process.cwd(), 'src', 'lib', 'migrations', '001_init.sql')
  const migrationSql = fs.readFileSync(migrationPath, 'utf-8')
  db.exec(migrationSql)

  instance = db
  return instance
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/db.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/migrations/001_init.sql src/lib/db.ts tests/db.test.ts
git commit -m "feat: add SQLite schema and db singleton with WAL mode"
```

---

### Task 3: Secret encryption (crypto.ts)

**Files:**
- Create: `src/lib/crypto.ts`
- Test: `tests/crypto.test.ts`

**Interfaces:**
- Consumes: `process.env.ROUTER_SECRET_KEY` (a 32-byte hex or base64 string)
- Produces: `encryptSecret(plaintext: string): string` and `decryptSecret(ciphertext: string): string` — both used by `credentials.repo.ts` (Task 5). Throws `Error('ROUTER_SECRET_KEY is not set')` at module load if the env var is missing.

- [ ] **Step 1: Write the failing test**

Create `tests/crypto.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64) // 32 bytes hex
})

describe('encryptSecret/decryptSecret', () => {
  it('round-trips a plaintext string', async () => {
    const { encryptSecret, decryptSecret } = await import('../src/lib/crypto')
    const plaintext = 'my-super-secret-api-key'
    const encrypted = encryptSecret(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(decryptSecret(encrypted)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext each time', async () => {
    const { encryptSecret } = await import('../src/lib/crypto')
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
  })

  it('throws at module load if ROUTER_SECRET_KEY is missing', async () => {
    vi.resetModules()
    delete process.env.ROUTER_SECRET_KEY
    await expect(import('../src/lib/crypto')).rejects.toThrow('ROUTER_SECRET_KEY')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crypto.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/crypto'"

- [ ] **Step 3: Implement crypto.ts**

Create `src/lib/crypto.ts`:
```typescript
import crypto from 'node:crypto'

const rawKey = process.env.ROUTER_SECRET_KEY
if (!rawKey) {
  throw new Error('ROUTER_SECRET_KEY is not set — refusing to start without an encryption key')
}

function resolveKey(): Buffer {
  // Accept 64-char hex (32 bytes) or fall back to hashing an arbitrary string to 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(rawKey!)) {
    return Buffer.from(rawKey!, 'hex')
  }
  return crypto.createHash('sha256').update(rawKey!).digest()
}

const key = resolveKey()
const ALGO = 'aes-256-gcm'

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decryptSecret(ciphertext: string): string {
  const data = Buffer.from(ciphertext, 'base64')
  const iv = data.subarray(0, 12)
  const authTag = data.subarray(12, 28)
  const encrypted = data.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crypto.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.ts tests/crypto.test.ts
git commit -m "feat: add AES-256-GCM secret encryption for credential storage"
```

---

### Task 4: Providers repo + seed data

**Files:**
- Create: `src/lib/schemas.ts`
- Create: `src/lib/providers.repo.ts`
- Create: `src/lib/seed.ts`
- Test: `tests/providers.repo.test.ts`

**Interfaces:**
- Consumes: `getDb()` from Task 2
- Produces:
  - `type Provider = { id: number; slug: string; name: string; defaultInjectLocation: 'query'|'header'|'path'; defaultInjectKeyName: string | null; defaultBaseUrl: string | null; createdAt: string }`
  - `listProviders(): Provider[]`
  - `getProviderBySlug(slug: string): Provider | undefined`
  - `createProvider(input: NewProviderInput): Provider`
  - `seedDefaultProviders(): void` — idempotent, called once at app startup
  - `NewProviderSchema` (Zod) from `schemas.ts`, exported for reuse in API routes (Task 8)

- [ ] **Step 1: Write the failing test**

Create `tests/providers.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-providers-repo')

beforeEach(() => {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('providers.repo', () => {
  it('creates and lists a custom provider', async () => {
    const { createProvider, listProviders } = await import('../src/lib/providers.repo')
    createProvider({
      slug: 'custom-rpc',
      name: 'Custom RPC',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://custom.example.com',
    })
    const providers = listProviders()
    expect(providers).toHaveLength(1)
    expect(providers[0]).toMatchObject({ slug: 'custom-rpc', name: 'Custom RPC' })
  })

  it('seeds exactly the 5 default providers, idempotently', async () => {
    const { seedDefaultProviders, listProviders } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    seedDefaultProviders() // calling twice must not duplicate
    const slugs = listProviders().map((p) => p.slug).sort()
    expect(slugs).toEqual(['birdeye', 'dexscreener', 'helius', 'jupiter', 'quicknode'])
  })

  it('seeds helius with query-param injection', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const helius = getProviderBySlug('helius')
    expect(helius).toMatchObject({
      defaultInjectLocation: 'query',
      defaultInjectKeyName: 'api-key',
      defaultBaseUrl: 'https://mainnet.helius-rpc.com',
    })
  })

  it('seeds quicknode with path injection and null default base url', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    const qn = getProviderBySlug('quicknode')
    expect(qn).toMatchObject({
      defaultInjectLocation: 'path',
      defaultBaseUrl: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/providers.repo.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/providers.repo'"

- [ ] **Step 3: Write Zod schemas**

Create `src/lib/schemas.ts`:
```typescript
import { z } from 'zod'

export const InjectLocationSchema = z.enum(['query', 'header', 'path'])

export const NewProviderSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  name: z.string().min(1),
  defaultInjectLocation: InjectLocationSchema,
  defaultInjectKeyName: z.string().nullable().optional(),
  defaultBaseUrl: z.string().url().nullable().optional(),
})
export type NewProviderInput = z.infer<typeof NewProviderSchema>

export const NewCredentialSchema = z.object({
  providerId: z.number().int().positive(),
  label: z.string().min(1),
  secretValue: z.string().min(1),
  baseUrlOverride: z.string().url().nullable().optional(),
  injectLocationOverride: InjectLocationSchema.nullable().optional(),
  injectKeyNameOverride: z.string().nullable().optional(),
})
export type NewCredentialInput = z.infer<typeof NewCredentialSchema>
```

- [ ] **Step 4: Implement providers.repo.ts**

Create `src/lib/providers.repo.ts`:
```typescript
import { getDb } from './db'
import type { NewProviderInput } from './schemas'

export type Provider = {
  id: number
  slug: string
  name: string
  defaultInjectLocation: 'query' | 'header' | 'path'
  defaultInjectKeyName: string | null
  defaultBaseUrl: string | null
  createdAt: string
}

type ProviderRow = {
  id: number
  slug: string
  name: string
  default_inject_location: 'query' | 'header' | 'path'
  default_inject_key_name: string | null
  default_base_url: string | null
  created_at: string
}

function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultInjectLocation: row.default_inject_location,
    defaultInjectKeyName: row.default_inject_key_name,
    defaultBaseUrl: row.default_base_url,
    createdAt: row.created_at,
  }
}

export function listProviders(): Provider[] {
  const rows = getDb().prepare('SELECT * FROM providers ORDER BY name').all() as ProviderRow[]
  return rows.map(toProvider)
}

export function getProviderBySlug(slug: string): Provider | undefined {
  const row = getDb().prepare('SELECT * FROM providers WHERE slug = ?').get(slug) as
    | ProviderRow
    | undefined
  return row ? toProvider(row) : undefined
}

export function createProvider(input: NewProviderInput): Provider {
  const result = getDb()
    .prepare(
      `INSERT INTO providers (slug, name, default_inject_location, default_inject_key_name, default_base_url)
       VALUES (@slug, @name, @defaultInjectLocation, @defaultInjectKeyName, @defaultBaseUrl)`
    )
    .run({
      slug: input.slug,
      name: input.name,
      defaultInjectLocation: input.defaultInjectLocation,
      defaultInjectKeyName: input.defaultInjectKeyName ?? null,
      defaultBaseUrl: input.defaultBaseUrl ?? null,
    })
  return getProviderBySlug(input.slug) ?? (() => {
    throw new Error(`failed to read back created provider ${input.slug} (rowid ${result.lastInsertRowid})`)
  })()
}

const DEFAULT_PROVIDERS: NewProviderInput[] = [
  {
    slug: 'helius',
    name: 'Helius',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'api-key',
    defaultBaseUrl: 'https://mainnet.helius-rpc.com',
  },
  {
    slug: 'quicknode',
    name: 'QuickNode',
    defaultInjectLocation: 'path',
    defaultInjectKeyName: null,
    defaultBaseUrl: null, // must be set per-credential via base_url_override
  },
  {
    slug: 'birdeye',
    name: 'Birdeye',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://public-api.birdeye.so',
  },
  {
    slug: 'dexscreener',
    name: 'DexScreener',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: null, // no key required for public endpoints
    defaultBaseUrl: 'https://api.dexscreener.com',
  },
  {
    slug: 'jupiter',
    name: 'Jupiter',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'x-api-key',
    defaultBaseUrl: null, // must be set per-credential: lite-api.jup.ag vs api.jup.ag
  },
]

export function seedDefaultProviders(): void {
  for (const provider of DEFAULT_PROVIDERS) {
    const existing = getProviderBySlug(provider.slug)
    if (!existing) createProvider(provider)
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/providers.repo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas.ts src/lib/providers.repo.ts tests/providers.repo.test.ts
git commit -m "feat: add providers repo with seed data for 5 default providers"
```

---

### Task 5: Credentials repo (CRUD + status transitions)

**Files:**
- Create: `src/lib/credentials.repo.ts`
- Test: `tests/credentials.repo.test.ts`

**Interfaces:**
- Consumes: `getDb()` (Task 2), `encryptSecret`/`decryptSecret` (Task 3), `NewCredentialInput` (Task 4)
- Produces:
  - `type Credential = { id: number; providerId: number; label: string; baseUrlOverride: string | null; secretValue: string; injectLocationOverride: 'query'|'header'|'path'|null; injectKeyNameOverride: string | null; status: 'active'|'cooldown'|'disabled'|'error'; cooldownUntil: string | null; lastUsedAt: string | null; lastError: string | null; createdAt: string }` — note `secretValue` here is the **decrypted** plaintext, decrypted on read.
  - `listCredentialsByProvider(providerId: number): Credential[]`
  - `createCredential(input: NewCredentialInput): Credential`
  - `markActive(id: number): void`
  - `markCooldown(id: number, cooldownSeconds: number): void`
  - `markError(id: number, message: string): void`
  - `markDisabled(id: number): void`
  - `touchLastUsed(id: number): void`
  - `reactivateExpiredCooldowns(providerId: number): void` — flips any `cooldown` row whose `cooldown_until` has passed back to `active`
  - `deleteCredential(id: number): void`

- [ ] **Step 1: Write the failing test**

Create `tests/credentials.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-credentials-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

async function setup() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential, listCredentialsByProvider } = await import('../src/lib/credentials.repo')
  const provider = createProvider({
    slug: 'test-provider',
    name: 'Test Provider',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://api.example.com',
  })
  return { provider, createCredential, listCredentialsByProvider }
}

describe('credentials.repo', () => {
  it('creates a credential and stores the secret encrypted, decrypted on read', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'plain-secret-123' })
    const list = listCredentialsByProvider(provider.id)
    expect(list).toHaveLength(1)
    expect(list[0].secretValue).toBe('plain-secret-123')
    expect(list[0].status).toBe('active')
  })

  it('stores raw db value encrypted (not equal to plaintext)', async () => {
    const { provider, createCredential } = await setup()
    const created = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'plain-secret-123' })
    const { getDb } = await import('../src/lib/db')
    const row = getDb().prepare('SELECT secret_value FROM credentials WHERE id = ?').get(created.id) as {
      secret_value: string
    }
    expect(row.secret_value).not.toBe('plain-secret-123')
  })

  it('markCooldown sets status and cooldown_until in the future', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markCooldown } = await import('../src/lib/credentials.repo')
    const cred = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'secret' })
    markCooldown(cred.id, 60)
    const [updated] = listCredentialsByProvider(provider.id)
    expect(updated.status).toBe('cooldown')
    expect(updated.cooldownUntil).not.toBeNull()
    expect(new Date(updated.cooldownUntil!).getTime()).toBeGreaterThan(Date.now())
  })

  it('markError sets status to error and records last_error, does not set cooldown_until', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markError } = await import('../src/lib/credentials.repo')
    const cred = createCredential({ providerId: provider.id, label: 'acc-1', secretValue: 'secret' })
    markError(cred.id, 'HTTP 401 invalid key')
    const [updated] = listCredentialsByProvider(provider.id)
    expect(updated.status).toBe('error')
    expect(updated.lastError).toBe('HTTP 401 invalid key')
    expect(updated.cooldownUntil).toBeNull()
  })

  it('reactivateExpiredCooldowns flips only expired cooldowns back to active', async () => {
    const { provider, createCredential, listCredentialsByProvider } = await setup()
    const { markCooldown, reactivateExpiredCooldowns } = await import('../src/lib/credentials.repo')
    const { getDb } = await import('../src/lib/db')
    const expired = createCredential({ providerId: provider.id, label: 'expired', secretValue: 's1' })
    const active = createCredential({ providerId: provider.id, label: 'still-cooling', secretValue: 's2' })
    markCooldown(expired.id, 60)
    markCooldown(active.id, 60)
    // force the "expired" one into the past directly via SQL
    getDb()
      .prepare("UPDATE credentials SET cooldown_until = datetime('now', '-10 seconds') WHERE id = ?")
      .run(expired.id)

    reactivateExpiredCooldowns(provider.id)

    const list = listCredentialsByProvider(provider.id)
    const expiredRow = list.find((c) => c.id === expired.id)!
    const activeRow = list.find((c) => c.id === active.id)!
    expect(expiredRow.status).toBe('active')
    expect(activeRow.status).toBe('cooldown')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/credentials.repo.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/credentials.repo'"

- [ ] **Step 3: Implement credentials.repo.ts**

Create `src/lib/credentials.repo.ts`:
```typescript
import { getDb } from './db'
import { encryptSecret, decryptSecret } from './crypto'
import type { NewCredentialInput } from './schemas'

export type Credential = {
  id: number
  providerId: number
  label: string
  baseUrlOverride: string | null
  secretValue: string
  injectLocationOverride: 'query' | 'header' | 'path' | null
  injectKeyNameOverride: string | null
  status: 'active' | 'cooldown' | 'disabled' | 'error'
  cooldownUntil: string | null
  lastUsedAt: string | null
  lastError: string | null
  createdAt: string
}

type CredentialRow = {
  id: number
  provider_id: number
  label: string
  base_url_override: string | null
  secret_value: string
  inject_location_override: 'query' | 'header' | 'path' | null
  inject_key_name_override: string | null
  status: 'active' | 'cooldown' | 'disabled' | 'error'
  cooldown_until: string | null
  last_used_at: string | null
  last_error: string | null
  created_at: string
}

function toCredential(row: CredentialRow): Credential {
  return {
    id: row.id,
    providerId: row.provider_id,
    label: row.label,
    baseUrlOverride: row.base_url_override,
    secretValue: decryptSecret(row.secret_value),
    injectLocationOverride: row.inject_location_override,
    injectKeyNameOverride: row.inject_key_name_override,
    status: row.status,
    cooldownUntil: row.cooldown_until,
    lastUsedAt: row.last_used_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  }
}

export function listCredentialsByProvider(providerId: number): Credential[] {
  const rows = getDb()
    .prepare('SELECT * FROM credentials WHERE provider_id = ? ORDER BY id')
    .all(providerId) as CredentialRow[]
  return rows.map(toCredential)
}

export function createCredential(input: NewCredentialInput): Credential {
  const result = getDb()
    .prepare(
      `INSERT INTO credentials (provider_id, label, base_url_override, secret_value, inject_location_override, inject_key_name_override)
       VALUES (@providerId, @label, @baseUrlOverride, @secretValue, @injectLocationOverride, @injectKeyNameOverride)`
    )
    .run({
      providerId: input.providerId,
      label: input.label,
      baseUrlOverride: input.baseUrlOverride ?? null,
      secretValue: encryptSecret(input.secretValue),
      injectLocationOverride: input.injectLocationOverride ?? null,
      injectKeyNameOverride: input.injectKeyNameOverride ?? null,
    })
  const row = getDb()
    .prepare('SELECT * FROM credentials WHERE id = ?')
    .get(result.lastInsertRowid) as CredentialRow
  return toCredential(row)
}

export function markActive(id: number): void {
  getDb().prepare("UPDATE credentials SET status = 'active', cooldown_until = NULL WHERE id = ?").run(id)
}

export function markCooldown(id: number, cooldownSeconds: number): void {
  getDb()
    .prepare(
      `UPDATE credentials SET status = 'cooldown', cooldown_until = datetime('now', '+' || ? || ' seconds') WHERE id = ?`
    )
    .run(cooldownSeconds, id)
}

export function markError(id: number, message: string): void {
  getDb()
    .prepare("UPDATE credentials SET status = 'error', last_error = ?, cooldown_until = NULL WHERE id = ?")
    .run(message, id)
}

export function markDisabled(id: number): void {
  getDb().prepare("UPDATE credentials SET status = 'disabled' WHERE id = ?").run(id)
}

export function touchLastUsed(id: number): void {
  getDb().prepare("UPDATE credentials SET last_used_at = datetime('now') WHERE id = ?").run(id)
}

export function reactivateExpiredCooldowns(providerId: number): void {
  getDb()
    .prepare(
      `UPDATE credentials
       SET status = 'active', cooldown_until = NULL
       WHERE provider_id = ? AND status = 'cooldown' AND cooldown_until <= datetime('now')`
    )
    .run(providerId)
}

export function deleteCredential(id: number): void {
  getDb().prepare('DELETE FROM credentials WHERE id = ?').run(id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/credentials.repo.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/credentials.repo.ts tests/credentials.repo.test.ts
git commit -m "feat: add credentials repo with encrypted storage and status transitions"
```

---

### Task 6: Rotation picker + URL/inject resolution

**Files:**
- Create: `src/lib/rotation.ts`
- Test: `tests/rotation.test.ts`
- Test: `tests/proxy-resolve.test.ts`

**Interfaces:**
- Consumes: `Credential`, `listCredentialsByProvider`, `reactivateExpiredCooldowns` (Task 5); `Provider` (Task 4)
- Produces:
  - `pickNextCredential(providerId: number): Credential | null` — round-robin in-memory pointer per provider, calls `reactivateExpiredCooldowns` first, returns `null` if no active credential exists.
  - `resolveTarget(provider: Provider, credential: Credential, incomingPath: string, incomingQuery: URLSearchParams): { url: string; headers: Record<string, string> }` — pure function, no DB access, used by the proxy route (Task 7).

- [ ] **Step 1: Write the failing test for rotation**

Create `tests/rotation.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-rotation')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

describe('pickNextCredential', () => {
  it('returns null when there are no credentials', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p1',
      name: 'P1',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    expect(pickNextCredential(provider.id)).toBeNull()
  })

  it('cycles through active credentials round-robin', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p2',
      name: 'P2',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const a = createCredential({ providerId: provider.id, label: 'a', secretValue: 'sa' })
    const b = createCredential({ providerId: provider.id, label: 'b', secretValue: 'sb' })

    const picks = [
      pickNextCredential(provider.id)?.id,
      pickNextCredential(provider.id)?.id,
      pickNextCredential(provider.id)?.id,
    ]
    // must alternate between the two, in some consistent cyclical order
    expect(picks[0]).not.toBe(picks[1])
    expect(picks[0]).toBe(picks[2])
    expect([a.id, b.id]).toEqual(expect.arrayContaining([picks[0], picks[1]]))
  })

  it('skips disabled and error credentials, and cooldown credentials whose time has not passed', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential, markDisabled, markError, markCooldown } = await import(
      '../src/lib/credentials.repo'
    )
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'p3',
      name: 'P3',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const disabled = createCredential({ providerId: provider.id, label: 'disabled', secretValue: 's1' })
    const errored = createCredential({ providerId: provider.id, label: 'errored', secretValue: 's2' })
    const cooling = createCredential({ providerId: provider.id, label: 'cooling', secretValue: 's3' })
    const healthy = createCredential({ providerId: provider.id, label: 'healthy', secretValue: 's4' })
    markDisabled(disabled.id)
    markError(errored.id, 'bad key')
    markCooldown(cooling.id, 300)

    const pick = pickNextCredential(provider.id)
    expect(pick?.id).toBe(healthy.id)
  })
})
```

- [ ] **Step 2: Write the failing test for resolveTarget**

Create `tests/proxy-resolve.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveTarget } from '../src/lib/rotation'
import type { Provider } from '../src/lib/providers.repo'
import type { Credential } from '../src/lib/credentials.repo'

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 1,
    slug: 'helius',
    name: 'Helius',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'api-key',
    defaultBaseUrl: 'https://mainnet.helius-rpc.com',
    createdAt: '2026-01-01',
    ...overrides,
  }
}

function makeCredential(overrides: Partial<Credential> = {}): Credential {
  return {
    id: 1,
    providerId: 1,
    label: 'acc-1',
    baseUrlOverride: null,
    secretValue: 'SECRET123',
    injectLocationOverride: null,
    injectKeyNameOverride: null,
    status: 'active',
    cooldownUntil: null,
    lastUsedAt: null,
    lastError: null,
    createdAt: '2026-01-01',
    ...overrides,
  }
}

describe('resolveTarget', () => {
  it('injects key as query param using provider default base url (helius-style)', () => {
    const provider = makeProvider()
    const credential = makeCredential()
    const result = resolveTarget(provider, credential, '/', new URLSearchParams())
    expect(result.url).toBe('https://mainnet.helius-rpc.com/?api-key=SECRET123')
    expect(result.headers).toEqual({})
  })

  it('injects key as header using provider default base url (birdeye-style)', () => {
    const provider = makeProvider({
      slug: 'birdeye',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://public-api.birdeye.so',
    })
    const credential = makeCredential({ secretValue: 'BIRDEYE_KEY' })
    const result = resolveTarget(provider, credential, '/defi/price', new URLSearchParams('address=abc'))
    expect(result.url).toBe('https://public-api.birdeye.so/defi/price?address=abc')
    expect(result.headers).toEqual({ 'X-API-KEY': 'BIRDEYE_KEY' })
  })

  it('uses credential base_url_override when provider has no default (quicknode-style path injection)', () => {
    const provider = makeProvider({
      slug: 'quicknode',
      defaultInjectLocation: 'path',
      defaultInjectKeyName: null,
      defaultBaseUrl: null,
    })
    const credential = makeCredential({
      baseUrlOverride: 'https://my-endpoint.solana-mainnet.quiknode.pro/abc123token',
    })
    const result = resolveTarget(provider, credential, '/', new URLSearchParams())
    expect(result.url).toBe('https://my-endpoint.solana-mainnet.quiknode.pro/abc123token/')
    expect(result.headers).toEqual({})
  })

  it('credential-level override wins over provider default for inject location', () => {
    const provider = makeProvider({
      slug: 'jupiter',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'x-api-key',
      defaultBaseUrl: null,
    })
    const credential = makeCredential({
      baseUrlOverride: 'https://api.jup.ag',
      secretValue: 'JUP_KEY',
    })
    const result = resolveTarget(provider, credential, '/swap/v1/quote', new URLSearchParams('inputMint=abc'))
    expect(result.url).toBe('https://api.jup.ag/swap/v1/quote?inputMint=abc')
    expect(result.headers).toEqual({ 'x-api-key': 'JUP_KEY' })
  })

  it('throws a clear error when no base url is available from either provider or credential', () => {
    const provider = makeProvider({ defaultBaseUrl: null })
    const credential = makeCredential({ baseUrlOverride: null })
    expect(() => resolveTarget(provider, credential, '/', new URLSearchParams())).toThrow(
      /no base url configured/i
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/rotation.test.ts tests/proxy-resolve.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/rotation'"

- [ ] **Step 4: Implement rotation.ts**

Create `src/lib/rotation.ts`:
```typescript
import { listCredentialsByProvider, reactivateExpiredCooldowns } from './credentials.repo'
import type { Credential } from './credentials.repo'
import type { Provider } from './providers.repo'

const roundRobinPointers = new Map<number, number>()

export function pickNextCredential(providerId: number): Credential | null {
  reactivateExpiredCooldowns(providerId)
  const all = listCredentialsByProvider(providerId)
  const active = all.filter((c) => c.status === 'active')
  if (active.length === 0) return null

  const lastIndex = roundRobinPointers.get(providerId) ?? -1
  const nextIndex = (lastIndex + 1) % active.length
  roundRobinPointers.set(providerId, nextIndex)
  return active[nextIndex]
}

export function resolveTarget(
  provider: Provider,
  credential: Credential,
  incomingPath: string,
  incomingQuery: URLSearchParams
): { url: string; headers: Record<string, string> } {
  const baseUrl = credential.baseUrlOverride ?? provider.defaultBaseUrl
  if (!baseUrl) {
    throw new Error(
      `no base url configured for provider "${provider.slug}" credential "${credential.label}" — set base_url_override on the credential`
    )
  }

  const injectLocation = credential.injectLocationOverride ?? provider.defaultInjectLocation
  const injectKeyName = credential.injectKeyNameOverride ?? provider.defaultInjectKeyName

  const url = new URL(incomingPath.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
  for (const [key, value] of incomingQuery) {
    url.searchParams.set(key, value)
  }

  const headers: Record<string, string> = {}

  if (injectKeyName) {
    if (injectLocation === 'query') {
      url.searchParams.set(injectKeyName, credential.secretValue)
    } else if (injectLocation === 'header') {
      headers[injectKeyName] = credential.secretValue
    }
    // 'path' location: the secret is expected to already be part of baseUrl (credential.baseUrlOverride)
  }

  return { url: url.toString(), headers }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/rotation.test.ts tests/proxy-resolve.test.ts`
Expected: PASS (3 + 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/rotation.ts tests/rotation.test.ts tests/proxy-resolve.test.ts
git commit -m "feat: add round-robin credential picker and URL/inject resolution"
```

---

### Task 7: Logs repo + settings repo

**Files:**
- Create: `src/lib/logs.repo.ts`
- Create: `src/lib/settings.repo.ts`
- Test: `tests/logs.repo.test.ts`
- Test: `tests/settings.repo.test.ts`

**Interfaces:**
- Consumes: `getDb()` (Task 2)
- Produces:
  - `logRequest(entry: { credentialId: number | null; providerSlug: string; statusCode: number | null; durationMs: number }): void`
  - `listLogs(filters: { providerSlug?: string; statusCode?: number; limit?: number; offset?: number }): { id: number; credentialId: number | null; providerSlug: string; statusCode: number | null; durationMs: number | null; createdAt: string }[]`
  - `pruneLogsOlderThan(days: number): void`
  - `getSetting(key: string): string | undefined`
  - `setSetting(key: string, value: string): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/logs.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-logs-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('logs.repo', () => {
  it('logs and lists a request', async () => {
    const { logRequest, listLogs } = await import('../src/lib/logs.repo')
    logRequest({ credentialId: 1, providerSlug: 'helius', statusCode: 200, durationMs: 42 })
    const logs = listLogs({})
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ providerSlug: 'helius', statusCode: 200, durationMs: 42 })
  })

  it('filters by providerSlug and statusCode', async () => {
    const { logRequest, listLogs } = await import('../src/lib/logs.repo')
    logRequest({ credentialId: 1, providerSlug: 'helius', statusCode: 200, durationMs: 10 })
    logRequest({ credentialId: 2, providerSlug: 'jupiter', statusCode: 429, durationMs: 20 })
    const filtered = listLogs({ providerSlug: 'jupiter' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].providerSlug).toBe('jupiter')
  })

  it('pruneLogsOlderThan removes logs past the retention window', async () => {
    const { logRequest, listLogs, pruneLogsOlderThan } = await import('../src/lib/logs.repo')
    const { getDb } = await import('../src/lib/db')
    logRequest({ credentialId: 1, providerSlug: 'helius', statusCode: 200, durationMs: 10 })
    getDb()
      .prepare("UPDATE request_logs SET created_at = datetime('now', '-40 days')")
      .run()
    pruneLogsOlderThan(30)
    expect(listLogs({})).toHaveLength(0)
  })
})
```

Create `tests/settings.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-settings-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('settings.repo', () => {
  it('returns undefined for an unset key', async () => {
    const { getSetting } = await import('../src/lib/settings.repo')
    expect(getSetting('nonexistent')).toBeUndefined()
  })

  it('sets and gets a value, and overwrites on repeated set', async () => {
    const { getSetting, setSetting } = await import('../src/lib/settings.repo')
    setSetting('cooldown_seconds_default:helius', '60')
    expect(getSetting('cooldown_seconds_default:helius')).toBe('60')
    setSetting('cooldown_seconds_default:helius', '90')
    expect(getSetting('cooldown_seconds_default:helius')).toBe('90')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/logs.repo.test.ts tests/settings.repo.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement logs.repo.ts**

Create `src/lib/logs.repo.ts`:
```typescript
import { getDb } from './db'

export function logRequest(entry: {
  credentialId: number | null
  providerSlug: string
  statusCode: number | null
  durationMs: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO request_logs (credential_id, provider_slug, status_code, duration_ms)
       VALUES (@credentialId, @providerSlug, @statusCode, @durationMs)`
    )
    .run(entry)
}

type LogRow = {
  id: number
  credential_id: number | null
  provider_slug: string
  status_code: number | null
  duration_ms: number | null
  created_at: string
}

export function listLogs(filters: {
  providerSlug?: string
  statusCode?: number
  limit?: number
  offset?: number
}): {
  id: number
  credentialId: number | null
  providerSlug: string
  statusCode: number | null
  durationMs: number | null
  createdAt: string
}[] {
  const conditions: string[] = []
  const params: Record<string, unknown> = {}
  if (filters.providerSlug) {
    conditions.push('provider_slug = @providerSlug')
    params.providerSlug = filters.providerSlug
  }
  if (filters.statusCode !== undefined) {
    conditions.push('status_code = @statusCode')
    params.statusCode = filters.statusCode
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.limit = filters.limit ?? 100
  params.offset = filters.offset ?? 0

  const rows = getDb()
    .prepare(
      `SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
    )
    .all(params) as LogRow[]

  return rows.map((row) => ({
    id: row.id,
    credentialId: row.credential_id,
    providerSlug: row.provider_slug,
    statusCode: row.status_code,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }))
}

export function pruneLogsOlderThan(days: number): void {
  getDb()
    .prepare(`DELETE FROM request_logs WHERE created_at < datetime('now', '-' || ? || ' days')`)
    .run(days)
}
```

- [ ] **Step 4: Implement settings.repo.ts**

Create `src/lib/settings.repo.ts`:
```typescript
import { getDb } from './db'

export function getSetting(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run({ key, value })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/logs.repo.test.ts tests/settings.repo.test.ts`
Expected: PASS (3 + 2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/logs.repo.ts src/lib/settings.repo.ts tests/logs.repo.test.ts tests/settings.repo.test.ts
git commit -m "feat: add request logs repo (with pruning) and settings key-value repo"
```

---

### Task 8: Auth (password hash + session cookie)

**Files:**
- Create: `src/lib/auth.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `getSetting`/`setSetting` (Task 7), `process.env.JWT_SECRET`
- Produces:
  - `hashPassword(password: string): string`
  - `verifyPassword(password: string, hash: string): boolean`
  - `createSessionToken(): Promise<string>` — signed JWT with a short claim, no user data needed (single-user system)
  - `verifySessionToken(token: string): Promise<boolean>`
  - `DEFAULT_PASSWORD = 'changeme'` — used by seed logic (Task 9) to set an initial password hash if none exists

- [ ] **Step 1: Write the failing test**

Create `tests/auth.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-for-vitest-only'
})

describe('auth', () => {
  it('hashPassword produces a hash different from the plaintext, verifyPassword confirms match', async () => {
    const { hashPassword, verifyPassword } = await import('../src/lib/auth')
    const hash = hashPassword('correct-horse-battery-staple')
    expect(hash).not.toBe('correct-horse-battery-staple')
    expect(verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
    expect(verifyPassword('wrong-password', hash)).toBe(false)
  })

  it('createSessionToken produces a token that verifySessionToken accepts', async () => {
    const { createSessionToken, verifySessionToken } = await import('../src/lib/auth')
    const token = await createSessionToken()
    expect(await verifySessionToken(token)).toBe(true)
  })

  it('verifySessionToken rejects a garbage token', async () => {
    const { verifySessionToken } = await import('../src/lib/auth')
    expect(await verifySessionToken('not-a-real-token')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/auth.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/auth'"

- [ ] **Step 3: Implement auth.ts**

Create `src/lib/auth.ts`:
```typescript
import crypto from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const DEFAULT_PASSWORD = 'changeme'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [saltHex, hashHex] = storedHash.split(':')
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, salt, 64)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getJwtSecret())
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getJwtSecret())
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts tests/auth.test.ts
git commit -m "feat: add password hashing and JWT session token helpers"
```

---

### Task 9: Startup seeding + app bootstrap

**Files:**
- Create: `src/lib/bootstrap.ts`
- Modify: `src/app/layout.tsx` (call bootstrap once)
- Test: `tests/bootstrap.test.ts`

**Interfaces:**
- Consumes: `seedDefaultProviders` (Task 4), `getSetting`/`setSetting` (Task 7), `hashPassword`/`DEFAULT_PASSWORD` (Task 8)
- Produces: `runBootstrap(): void` — idempotent; seeds default providers and, if `settings['dashboard_password_hash']` is unset, sets it to the hash of `DEFAULT_PASSWORD`.

- [ ] **Step 1: Write the failing test**

Create `tests/bootstrap.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-bootstrap')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
  process.env.JWT_SECRET = 'test-jwt-secret'
})

describe('runBootstrap', () => {
  it('seeds 5 default providers', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { listProviders } = await import('../src/lib/providers.repo')
    runBootstrap()
    expect(listProviders()).toHaveLength(5)
  })

  it('sets a default password hash only if unset', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { getSetting, setSetting } = await import('../src/lib/settings.repo')
    const { verifyPassword, DEFAULT_PASSWORD } = await import('../src/lib/auth')

    runBootstrap()
    const hash1 = getSetting('dashboard_password_hash')
    expect(hash1).toBeDefined()
    expect(verifyPassword(DEFAULT_PASSWORD, hash1!)).toBe(true)

    setSetting('dashboard_password_hash', 'custom-hash-should-not-change')
    runBootstrap()
    expect(getSetting('dashboard_password_hash')).toBe('custom-hash-should-not-change')
  })

  it('is idempotent — running twice does not duplicate providers', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { listProviders } = await import('../src/lib/providers.repo')
    runBootstrap()
    runBootstrap()
    expect(listProviders()).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bootstrap.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/bootstrap'"

- [ ] **Step 3: Implement bootstrap.ts**

Create `src/lib/bootstrap.ts`:
```typescript
import { seedDefaultProviders } from './providers.repo'
import { getSetting, setSetting } from './settings.repo'
import { hashPassword, DEFAULT_PASSWORD } from './auth'

export function runBootstrap(): void {
  seedDefaultProviders()
  if (!getSetting('dashboard_password_hash')) {
    setSetting('dashboard_password_hash', hashPassword(DEFAULT_PASSWORD))
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/bootstrap.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire bootstrap into app layout**

Read `src/app/layout.tsx` first, then modify it to call `runBootstrap()` once at module load (top-level, outside the component function) so it runs when the server process starts:
```typescript
import { runBootstrap } from '@/lib/bootstrap'

runBootstrap()

// ... keep the existing RootLayout export below unchanged
```

- [ ] **Step 6: Verify build still succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/lib/bootstrap.ts src/app/layout.tsx tests/bootstrap.test.ts
git commit -m "feat: run idempotent bootstrap (seed providers, default password) on app start"
```

---

### Task 10: Proxy route handler

**Files:**
- Create: `src/app/proxy/[slug]/[...path]/route.ts`
- Test: `tests/proxy-route.test.ts`

**Interfaces:**
- Consumes: `getProviderBySlug` (Task 4), `pickNextCredential`, `resolveTarget` (Task 6), `markCooldown`, `markError`, `touchLastUsed` (Task 5), `logRequest` (Task 7)
- Produces: the actual `GET/POST/PUT/PATCH/DELETE` exports Next.js requires for a catch-all route — this is the integration point bots will call as `http://<vps>:<port>/proxy/helius/` etc.

This task integrates everything from Tasks 4-7 into the live HTTP path. Because `fetch` to real external providers can't run in unit tests, this task tests the **retry/rotation orchestration logic** in isolation by extracting it into a testable function that takes a `fetchFn` dependency, then wires that function into the thin Next.js route export.

- [ ] **Step 1: Write the failing test for the orchestration function**

Create `tests/proxy-route.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-proxy-route')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
})

async function setupProviderWithTwoCredentials() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential } = await import('../src/lib/credentials.repo')
  const provider = createProvider({
    slug: 'test-p',
    name: 'Test P',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://api.example.com',
  })
  const credA = createCredential({ providerId: provider.id, label: 'a', secretValue: 'secret-a' })
  const credB = createCredential({ providerId: provider.id, label: 'b', secretValue: 'secret-b' })
  return { provider, credA, credB }
}

describe('handleProxyRequest', () => {
  it('returns the upstream response on first-try success', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi.fn().mockResolvedValue(new Response('ok-body', { status: 200 }))
    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 with the next credential, then succeeds', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('marks credential as error (not cooldown) on 401 and moves to next credential', async () => {
    const { provider, credA } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const { listCredentialsByProvider } = await import('../src/lib/credentials.repo')

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('ok-body', { status: 200 }))

    await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    const creds = listCredentialsByProvider(provider.id)
    const first = creds.find((c) => c.id === credA.id)!
    expect(first.status).toBe('error')
  })

  it('returns 502 when all credentials are exhausted', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')

    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }))

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(502)
    const body = await result.body
    expect(body).toMatchObject({ provider: provider.slug, triedCredentials: 2 })
  })

  it('returns 503 immediately when the provider has no credentials at all', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const provider = createProvider({
      slug: 'empty-p',
      name: 'Empty P',
      defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY',
      defaultBaseUrl: 'https://api.example.com',
    })
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn()

    const result = await handleProxyRequest({
      slug: provider.slug,
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })

    expect(result.status).toBe(503)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns 404 when the provider slug does not exist', async () => {
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn()
    const result = await handleProxyRequest({
      slug: 'does-not-exist',
      path: '/foo',
      query: new URLSearchParams(),
      method: 'GET',
      body: null,
      headers: {},
      fetchFn,
    })
    expect(result.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/proxy-route.test.ts`
Expected: FAIL with "Cannot find module '../src/lib/proxy-orchestrator'"

- [ ] **Step 3: Implement the orchestrator**

Create `src/lib/proxy-orchestrator.ts`:
```typescript
import { getProviderBySlug } from './providers.repo'
import { pickNextCredential, resolveTarget } from './rotation'
import { markCooldown, markError, touchLastUsed, listCredentialsByProvider } from './credentials.repo'
import { logRequest } from './logs.repo'
import { getSetting } from './settings.repo'

const DEFAULT_COOLDOWN_SECONDS = 60

function cooldownSecondsFor(providerSlug: string): number {
  const configured = getSetting(`cooldown_seconds_default:${providerSlug}`)
  return configured ? Number(configured) : DEFAULT_COOLDOWN_SECONDS
}

export type ProxyRequestInput = {
  slug: string
  path: string
  query: URLSearchParams
  method: string
  body: BodyInit | null
  headers: Record<string, string>
  fetchFn: (url: string, init: RequestInit) => Promise<Response>
}

export type ProxyResult = {
  status: number
  body: unknown
  headers?: Record<string, string>
  stream?: ReadableStream | null
}

export async function handleProxyRequest(input: ProxyRequestInput): Promise<ProxyResult> {
  const provider = getProviderBySlug(input.slug)
  if (!provider) {
    return { status: 404, body: { error: `unknown provider "${input.slug}"` } }
  }

  const totalCredentials = listCredentialsByProvider(provider.id).length
  if (totalCredentials === 0) {
    return { status: 503, body: { error: 'no available credential', provider: provider.slug } }
  }

  let attempts = 0
  const maxAttempts = totalCredentials

  while (attempts < maxAttempts) {
    const credential = pickNextCredential(provider.id)
    if (!credential) {
      return { status: 503, body: { error: 'no available credential', provider: provider.slug } }
    }
    attempts++

    const { url, headers } = resolveTarget(provider, credential, input.path, input.query)
    const start = Date.now()

    let response: Response
    try {
      response = await input.fetchFn(url, {
        method: input.method,
        headers: { ...input.headers, ...headers },
        body: input.body,
      })
    } catch (err) {
      markCooldown(credential.id, cooldownSecondsFor(provider.slug))
      logRequest({
        credentialId: credential.id,
        providerSlug: provider.slug,
        statusCode: null,
        durationMs: Date.now() - start,
      })
      continue
    }

    const durationMs = Date.now() - start
    logRequest({
      credentialId: credential.id,
      providerSlug: provider.slug,
      statusCode: response.status,
      durationMs,
    })

    if (response.status === 429) {
      markCooldown(credential.id, cooldownSecondsFor(provider.slug))
      continue
    }
    if (response.status === 401 || response.status === 403) {
      markError(credential.id, `HTTP ${response.status}`)
      continue
    }

    touchLastUsed(credential.id)
    return { status: response.status, body: response.body, stream: response.body }
  }

  return {
    status: 502,
    body: { error: 'all credentials exhausted', provider: provider.slug, triedCredentials: attempts },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/proxy-route.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Implement the thin Next.js route wrapping the orchestrator**

Create `src/app/proxy/[slug]/[...path]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { handleProxyRequest } from '@/lib/proxy-orchestrator'

async function handle(req: NextRequest, params: { slug: string; path: string[] }) {
  const path = '/' + (params.path ?? []).join('/')
  const query = req.nextUrl.searchParams
  const method = req.method
  const body = method === 'GET' || method === 'HEAD' ? null : await req.arrayBuffer()
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (!['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
      headers[key] = value
    }
  })

  const result = await handleProxyRequest({
    slug: params.slug,
    path,
    query,
    method,
    body: body as BodyInit | null,
    headers,
    fetchFn: fetch,
  })

  if (result.stream) {
    return new Response(result.stream, { status: result.status })
  }
  return Response.json(result.body, { status: result.status })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return handle(req, await ctx.params)
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return handle(req, await ctx.params)
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return handle(req, await ctx.params)
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return handle(req, await ctx.params)
}
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string; path: string[] }> }) {
  return handle(req, await ctx.params)
}
```

- [ ] **Step 6: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds with the new dynamic route listed in output

- [ ] **Step 7: Commit**

```bash
git add src/lib/proxy-orchestrator.ts src/app/proxy tests/proxy-route.test.ts
git commit -m "feat: add proxy orchestrator with retry/cooldown logic and Next.js route handler"
```

---

### Task 11: Middleware auth gate

**Files:**
- Create: `src/middleware.ts`
- Test: `tests/middleware-logic.test.ts`

**Interfaces:**
- Consumes: `verifySessionToken` (Task 8)
- Produces: `isProtectedPath(pathname: string): boolean` (pure function, exported for testing) used inside the Next.js `middleware` default export.

- [ ] **Step 1: Write the failing test**

Create `tests/middleware-logic.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { isProtectedPath } from '../src/middleware'

describe('isProtectedPath', () => {
  it('does not protect /proxy/* paths', () => {
    expect(isProtectedPath('/proxy/helius/foo')).toBe(false)
  })

  it('does not protect /login', () => {
    expect(isProtectedPath('/login')).toBe(false)
  })

  it('protects the dashboard root and nested pages', () => {
    expect(isProtectedPath('/')).toBe(true)
    expect(isProtectedPath('/providers/helius')).toBe(true)
    expect(isProtectedPath('/settings')).toBe(true)
  })

  it('protects the management api', () => {
    expect(isProtectedPath('/api/providers')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/middleware-logic.test.ts`
Expected: FAIL with "Cannot find module '../src/middleware'"

- [ ] **Step 3: Implement middleware.ts**

Create `src/middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

export function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith('/proxy/')) return false
  if (pathname === '/login') return false
  return true
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (!isProtectedPath(pathname)) return NextResponse.next()

  const token = req.cookies.get('session')?.value
  const valid = token ? await verifySessionToken(token) : false

  if (!valid) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/middleware-logic.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts tests/middleware-logic.test.ts
git commit -m "feat: add auth-gate middleware protecting dashboard, excluding /proxy and /login"
```

---

### Task 12: Login page + server action

**Files:**
- Create: `src/app/login/actions.ts`
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `getSetting` (Task 7), `verifyPassword`, `createSessionToken` (Task 8)
- Produces: a server action `loginAction(formData: FormData): Promise<{ error?: string }>` that sets the `session` cookie on success and redirects to `/`.

- [ ] **Step 1: Implement the server action**

Create `src/app/login/actions.ts`:
```typescript
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSetting } from '@/lib/settings.repo'
import { verifyPassword, createSessionToken } from '@/lib/auth'

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get('password') ?? '')
  const storedHash = getSetting('dashboard_password_hash')

  if (!storedHash || !verifyPassword(password, storedHash)) {
    return { error: 'Password salah' }
  }

  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect('/')
}
```

- [ ] **Step 2: Implement the login page**

Create `src/app/login/page.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <form
        className="w-full max-w-sm space-y-4 rounded-lg bg-gray-900 p-8"
        action={(formData) => {
          startTransition(async () => {
            const result = await loginAction(formData)
            if (result?.error) setError(result.error)
          })
        }}
      >
        <h1 className="text-xl font-semibold text-white">Zetryn Router</h1>
        <input
          type="password"
          name="password"
          placeholder="Password"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Manual verification**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=$(openssl rand -hex 32) npm run dev`
Then open `http://localhost:3000/login` in a browser, enter `changeme`, confirm redirect to `/` (which will 404/error until Task 13 — that's expected at this point).

- [ ] **Step 5: Commit**

```bash
git add src/app/login
git commit -m "feat: add login page with password server action and session cookie"
```

---

### Task 13: Dashboard layout + providers overview page

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/page.tsx` (move to be the dashboard home / providers overview)
- Create: `src/app/api/providers/route.ts`

**Interfaces:**
- Consumes: `listProviders`, `createProvider` (Task 4), `listCredentialsByProvider` (Task 5), `NewProviderSchema` (Task 4)
- Produces: `GET /api/providers` returns `Provider[]` with a `credentialCounts: { active, cooldown, disabled, error }` field per provider; `POST /api/providers` validates with `NewProviderSchema` and creates a custom provider.

- [ ] **Step 1: Implement the dashboard layout wrapper**

Create `src/app/(dashboard)/layout.tsx`:
```tsx
import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex gap-6 border-b border-gray-800 px-6 py-4">
        <Link href="/" className="font-semibold">Zetryn Router</Link>
        <Link href="/logs" className="text-gray-400 hover:text-white">Logs</Link>
        <Link href="/settings" className="text-gray-400 hover:text-white">Settings</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Implement GET/POST /api/providers**

Create `src/app/api/providers/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { listProviders, createProvider } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { NewProviderSchema } from '@/lib/schemas'

export async function GET() {
  const providers = listProviders()
  const withCounts = providers.map((provider) => {
    const creds = listCredentialsByProvider(provider.id)
    const credentialCounts = {
      active: creds.filter((c) => c.status === 'active').length,
      cooldown: creds.filter((c) => c.status === 'cooldown').length,
      disabled: creds.filter((c) => c.status === 'disabled').length,
      error: creds.filter((c) => c.status === 'error').length,
    }
    return { ...provider, credentialCounts }
  })
  return Response.json(withCounts)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewProviderSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const provider = createProvider(parsed.data)
  return Response.json(provider, { status: 201 })
}
```

- [ ] **Step 3: Implement the providers overview page**

Read the existing `src/app/page.tsx` first (it's the Next.js starter placeholder from Task 1), then replace its contents:

Create `src/app/(dashboard)/page.tsx` (and delete the old `src/app/page.tsx` placeholder since this route group now owns `/`):
```tsx
import Link from 'next/link'
import { listProviders } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'

export default function ProvidersOverviewPage() {
  const providers = listProviders()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Providers</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const creds = listCredentialsByProvider(provider.id)
          const active = creds.filter((c) => c.status === 'active').length
          const cooldown = creds.filter((c) => c.status === 'cooldown').length
          const error = creds.filter((c) => c.status === 'error').length
          return (
            <Link
              key={provider.id}
              href={`/providers/${provider.slug}`}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-600"
            >
              <h2 className="font-semibold">{provider.name}</h2>
              <p className="mt-2 text-sm text-gray-400">
                {active} active · {cooldown} cooldown · {error} error
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

Run: `rm src/app/page.tsx`

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds, `/` resolves to the dashboard route group page

- [ ] **Step 5: Manual verification**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=$(openssl rand -hex 32) npm run dev`
Open `http://localhost:3000/`, log in with `changeme`, confirm 5 provider cards render (Helius, QuickNode, Birdeye, DexScreener, Jupiter) each showing "0 active · 0 cooldown · 0 error".

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\) src/app/api/providers src/app/page.tsx
git commit -m "feat: add dashboard layout, providers overview page, and providers API route"
```

---

### Task 14: Provider detail page + credentials API

**Files:**
- Create: `src/app/(dashboard)/providers/[slug]/page.tsx`
- Create: `src/app/(dashboard)/providers/[slug]/credential-form.tsx`
- Create: `src/app/api/credentials/route.ts`
- Create: `src/app/api/credentials/[id]/route.ts`

**Interfaces:**
- Consumes: `getProviderBySlug` (Task 4), `listCredentialsByProvider`, `createCredential`, `markActive`, `markDisabled`, `deleteCredential` (Task 5), `NewCredentialSchema` (Task 4)
- Produces: `POST /api/credentials` (create), `PATCH /api/credentials/:id` (body `{ action: 'reactivate' | 'disable' }`), `DELETE /api/credentials/:id`

- [ ] **Step 1: Implement POST /api/credentials**

Create `src/app/api/credentials/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { createCredential } from '@/lib/credentials.repo'
import { NewCredentialSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewCredentialSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const credential = createCredential(parsed.data)
  return Response.json({ ...credential, secretValue: '••••••••' }, { status: 201 })
}
```

- [ ] **Step 2: Implement PATCH/DELETE /api/credentials/[id]**

Create `src/app/api/credentials/[id]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { markActive, markDisabled, deleteCredential } from '@/lib/credentials.repo'
import { z } from 'zod'

const PatchSchema = z.object({ action: z.enum(['reactivate', 'disable']) })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const credentialId = Number(id)
  const body = await req.json()
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.action === 'reactivate') markActive(credentialId)
  if (parsed.data.action === 'disable') markDisabled(credentialId)
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  deleteCredential(Number(id))
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Implement the credential form client component**

Create `src/app/(dashboard)/providers/[slug]/credential-form.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function CredentialForm({ providerId }: { providerId: number }) {
  const [label, setLabel] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [baseUrlOverride, setBaseUrlOverride] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          label,
          secretValue,
          baseUrlOverride: baseUrlOverride || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(JSON.stringify(body.error))
        return
      }
      setLabel('')
      setSecretValue('')
      setBaseUrlOverride('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">Add credential</h3>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. acc-1)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={secretValue}
        onChange={(e) => setSecretValue(e.target.value)}
        placeholder="API key / secret"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={baseUrlOverride}
        onChange={(e) => setBaseUrlOverride(e.target.value)}
        placeholder="Base URL override (optional — required for QuickNode/Jupiter-paid)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50"
      >
        {isPending ? 'Adding...' : 'Add credential'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Implement the provider detail page**

Create `src/app/(dashboard)/providers/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getProviderBySlug } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { CredentialForm } from './credential-form'
import { CredentialRow } from './credential-row'

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const provider = getProviderBySlug(slug)
  if (!provider) notFound()

  const credentials = listCredentialsByProvider(provider.id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{provider.name}</h1>
      <div className="space-y-2">
        {credentials.map((cred) => (
          <CredentialRow key={cred.id} credential={cred} />
        ))}
        {credentials.length === 0 && <p className="text-gray-500">No credentials yet.</p>}
      </div>
      <CredentialForm providerId={provider.id} />
    </div>
  )
}
```

- [ ] **Step 5: Implement the credential row client component (status badge + actions)**

Create `src/app/(dashboard)/providers/[slug]/credential-row.tsx`:
```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Credential } from '@/lib/credentials.repo'

const STATUS_COLORS: Record<Credential['status'], string> = {
  active: 'bg-green-600',
  cooldown: 'bg-yellow-600',
  disabled: 'bg-gray-600',
  error: 'bg-red-600',
}

export function CredentialRow({ credential }: { credential: Credential }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function act(action: 'reactivate' | 'disable') {
    startTransition(async () => {
      await fetch(`/api/credentials/${credential.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      router.refresh()
    })
  }

  function remove() {
    startTransition(async () => {
      await fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-900 p-3">
      <div>
        <span className={`mr-2 rounded px-2 py-0.5 text-xs ${STATUS_COLORS[credential.status]}`}>
          {credential.status}
        </span>
        <span className="font-medium">{credential.label}</span>
        {credential.lastError && (
          <p className="text-xs text-red-400">{credential.lastError}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button disabled={isPending} onClick={() => act('reactivate')} className="text-sm text-blue-400">
          Reactivate
        </button>
        <button disabled={isPending} onClick={() => act('disable')} className="text-sm text-gray-400">
          Disable
        </button>
        <button disabled={isPending} onClick={remove} className="text-sm text-red-400">
          Delete
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 7: Manual verification**

Run dev server, log in, click into "Helius" provider, add a credential with label `test-1` and a dummy secret, confirm it appears with an "active" green badge. Click "Disable", confirm badge turns gray. Click "Reactivate", confirm it turns green again. Click "Delete", confirm it disappears.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/providers src/app/api/credentials
git commit -m "feat: add provider detail page with credential CRUD UI and API routes"
```

---

### Task 15: Request logs page

**Files:**
- Create: `src/app/(dashboard)/logs/page.tsx`
- Create: `src/app/api/logs/route.ts`

**Interfaces:**
- Consumes: `listLogs` (Task 7)
- Produces: `GET /api/logs?providerSlug=&statusCode=&limit=&offset=` returning JSON array; the logs page reads directly via `listLogs` server-side (no client fetch needed since it's a server component), but the API route is exposed too for potential future external consumption per the spec ("Request logs" management API).

- [ ] **Step 1: Implement GET /api/logs**

Create `src/app/api/logs/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { listLogs } from '@/lib/logs.repo'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const logs = listLogs({
    providerSlug: params.get('providerSlug') ?? undefined,
    statusCode: params.get('statusCode') ? Number(params.get('statusCode')) : undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    offset: params.get('offset') ? Number(params.get('offset')) : undefined,
  })
  return Response.json(logs)
}
```

- [ ] **Step 2: Implement the logs page (server component)**

Create `src/app/(dashboard)/logs/page.tsx`:
```tsx
import { listLogs } from '@/lib/logs.repo'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ providerSlug?: string }>
}) {
  const { providerSlug } = await searchParams
  const logs = listLogs({ providerSlug, limit: 100 })

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Request Logs</h1>
      <table className="w-full text-left text-sm">
        <thead className="text-gray-500">
          <tr>
            <th className="py-2">Time</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-gray-800">
              <td className="py-2">{log.createdAt}</td>
              <td>{log.providerSlug}</td>
              <td className={log.statusCode && log.statusCode >= 400 ? 'text-red-400' : 'text-green-400'}>
                {log.statusCode ?? 'network error'}
              </td>
              <td>{log.durationMs}ms</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500">
                No requests logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/logs src/app/api/logs
git commit -m "feat: add request logs page and API route"
```

---

### Task 16: Settings page (password change + cooldown defaults)

**Files:**
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/(dashboard)/settings/settings-form.tsx`
- Create: `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: `getSetting`, `setSetting` (Task 7), `hashPassword`, `verifyPassword` (Task 8), `listProviders` (Task 4)
- Produces: `PUT /api/settings` accepting `{ type: 'password'; currentPassword: string; newPassword: string } | { type: 'cooldown'; providerSlug: string; seconds: number }`

- [ ] **Step 1: Implement PUT /api/settings**

Create `src/app/api/settings/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSetting, setSetting } from '@/lib/settings.repo'
import { hashPassword, verifyPassword } from '@/lib/auth'

const PasswordChangeSchema = z.object({
  type: z.literal('password'),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

const CooldownChangeSchema = z.object({
  type: z.literal('cooldown'),
  providerSlug: z.string().min(1),
  seconds: z.number().int().positive(),
})

const BodySchema = z.discriminatedUnion('type', [PasswordChangeSchema, CooldownChangeSchema])

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (parsed.data.type === 'password') {
    const storedHash = getSetting('dashboard_password_hash')
    if (!storedHash || !verifyPassword(parsed.data.currentPassword, storedHash)) {
      return Response.json({ error: 'current password is incorrect' }, { status: 401 })
    }
    setSetting('dashboard_password_hash', hashPassword(parsed.data.newPassword))
    return Response.json({ ok: true })
  }

  setSetting(`cooldown_seconds_default:${parsed.data.providerSlug}`, String(parsed.data.seconds))
  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Implement the settings form client component**

Create `src/app/(dashboard)/settings/settings-form.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import type { Provider } from '@/lib/providers.repo'

export function SettingsForm({
  providers,
  cooldownDefaults,
}: {
  providers: Provider[]
  cooldownDefaults: Record<string, number>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', currentPassword, newPassword }),
      })
      const body = await res.json()
      setPasswordMessage(res.ok ? 'Password updated' : body.error)
      if (res.ok) {
        setCurrentPassword('')
        setNewPassword('')
      }
    })
  }

  function submitCooldownChange(providerSlug: string, seconds: number) {
    startTransition(async () => {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cooldown', providerSlug, seconds }),
      })
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submitPasswordChange} className="max-w-sm space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          required
          minLength={8}
        />
        {passwordMessage && <p className="text-sm text-gray-400">{passwordMessage}</p>}
        <button disabled={isPending} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">
          Update password
        </button>
      </form>

      <div className="max-w-sm space-y-3">
        <h2 className="font-semibold">Cooldown defaults (seconds)</h2>
        {providers.map((p) => (
          <div key={p.slug} className="flex items-center justify-between gap-3">
            <span>{p.name}</span>
            <input
              type="number"
              defaultValue={cooldownDefaults[p.slug] ?? 60}
              min={1}
              className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1"
              onBlur={(e) => submitCooldownChange(p.slug, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Implement the settings page**

Create `src/app/(dashboard)/settings/page.tsx`:
```tsx
import { listProviders } from '@/lib/providers.repo'
import { getSetting } from '@/lib/settings.repo'
import { SettingsForm } from './settings-form'

export default function SettingsPage() {
  const providers = listProviders()
  const cooldownDefaults: Record<string, number> = {}
  for (const p of providers) {
    const value = getSetting(`cooldown_seconds_default:${p.slug}`)
    if (value) cooldownDefaults[p.slug] = Number(value)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm providers={providers} cooldownDefaults={cooldownDefaults} />
    </div>
  )
}
```

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 5: Manual verification**

Log in, go to Settings, change the dashboard password, confirm it rejects a wrong current password and accepts a correct one, then log out (clear cookie) and confirm the new password works on `/login`. Change a cooldown default for Helius, confirm the value persists on page refresh.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/settings src/app/api/settings
git commit -m "feat: add settings page for password change and per-provider cooldown defaults"
```

---

### Task 17: Custom provider form on overview page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Create: `src/app/(dashboard)/add-provider-form.tsx`

**Interfaces:**
- Consumes: `POST /api/providers` (Task 13)
- Produces: a form on the overview page for adding providers beyond the 5 seeded defaults, per spec §Dashboard UI point 6.

- [ ] **Step 1: Implement the add-provider form**

Create `src/app/(dashboard)/add-provider-form.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function AddProviderForm() {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [injectLocation, setInjectLocation] = useState<'query' | 'header' | 'path'>('header')
  const [injectKeyName, setInjectKeyName] = useState('')
  const [defaultBaseUrl, setDefaultBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          defaultInjectLocation: injectLocation,
          defaultInjectKeyName: injectKeyName || null,
          defaultBaseUrl: defaultBaseUrl || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(JSON.stringify(body.error))
        return
      }
      setSlug('')
      setName('')
      setInjectKeyName('')
      setDefaultBaseUrl('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">Add custom provider</h3>
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug (lowercase-with-dashes)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <select
        value={injectLocation}
        onChange={(e) => setInjectLocation(e.target.value as 'query' | 'header' | 'path')}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      >
        <option value="header">Header</option>
        <option value="query">Query param</option>
        <option value="path">Path (key baked into base URL per credential)</option>
      </select>
      <input
        value={injectKeyName}
        onChange={(e) => setInjectKeyName(e.target.value)}
        placeholder="Inject key name (e.g. X-API-KEY) — leave blank for path-based"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      <input
        value={defaultBaseUrl}
        onChange={(e) => setDefaultBaseUrl(e.target.value)}
        placeholder="Default base URL (optional if set per-credential)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={isPending} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">
        {isPending ? 'Adding...' : 'Add provider'}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Wire it into the overview page**

Modify `src/app/(dashboard)/page.tsx` — add the import and render it below the grid:
```tsx
import { AddProviderForm } from './add-provider-form'
```
Add `<AddProviderForm />` as the last element inside the returned `<div className="space-y-4">...</div>`, after the grid `<div>`.

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Manual verification**

Log in, on the overview page fill in the "Add custom provider" form with a test provider, submit, confirm a new card appears in the grid showing "0 active · 0 cooldown · 0 error".

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx src/app/\(dashboard\)/add-provider-form.tsx
git commit -m "feat: add custom provider creation form to the overview page"
```

---

### Task 18: Log pruning on startup + PM2 deployment config

**Files:**
- Modify: `src/lib/bootstrap.ts`
- Create: `ecosystem.config.js`
- Create: `README.md`

**Interfaces:**
- Consumes: `pruneLogsOlderThan` (Task 7)
- Produces: `runBootstrap()` now also prunes logs older than 30 days; a PM2 ecosystem file for VPS deployment.

- [ ] **Step 1: Write the failing test for prune-on-bootstrap**

Modify `tests/bootstrap.test.ts` — add this test inside the existing `describe('runBootstrap', ...)` block:
```typescript
  it('prunes logs older than 30 days on every run', async () => {
    const { runBootstrap } = await import('../src/lib/bootstrap')
    const { logRequest, listLogs } = await import('../src/lib/logs.repo')
    const { getDb } = await import('../src/lib/db')

    runBootstrap()
    logRequest({ credentialId: null, providerSlug: 'helius', statusCode: 200, durationMs: 10 })
    getDb().prepare("UPDATE request_logs SET created_at = datetime('now', '-31 days')").run()

    runBootstrap()

    expect(listLogs({})).toHaveLength(0)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/bootstrap.test.ts`
Expected: FAIL — the new test fails because `runBootstrap` doesn't call `pruneLogsOlderThan` yet.

- [ ] **Step 3: Update bootstrap.ts**

Modify `src/lib/bootstrap.ts`:
```typescript
import { seedDefaultProviders } from './providers.repo'
import { getSetting, setSetting } from './settings.repo'
import { hashPassword, DEFAULT_PASSWORD } from './auth'
import { pruneLogsOlderThan } from './logs.repo'

export function runBootstrap(): void {
  seedDefaultProviders()
  if (!getSetting('dashboard_password_hash')) {
    setSetting('dashboard_password_hash', hashPassword(DEFAULT_PASSWORD))
  }
  pruneLogsOlderThan(30)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/bootstrap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Create PM2 ecosystem config**

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'zetryn-router',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '4790',
        DATA_DIR: process.env.DATA_DIR || './data',
      },
      instances: 1,
      autorestart: true,
    },
  ],
}
```

- [ ] **Step 6: Create README with deployment instructions**

Create `README.md`:
```markdown
# Zetryn Router

API key/provider rotation gateway for Solana memecoin trading bot infra (RPC, market data, swap APIs).

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `ROUTER_SECRET_KEY`: 32-byte hex string, generate with `openssl rand -hex 32`
   - `JWT_SECRET`: any long random string, generate with `openssl rand -hex 32`
   - `DATA_DIR`: where `router.db` is stored (default `./data`)
   - `PORT`: port to bind (default 4790)
2. `npm install`
3. `npm run build`
4. Bind to `127.0.0.1` only — this app has no rate limiting of its own and is meant for internal VPS use.

## Running with PM2

```bash
npm install -g pm2
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
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests across all files PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/bootstrap.ts tests/bootstrap.test.ts ecosystem.config.js README.md
git commit -m "feat: prune old logs on bootstrap, add PM2 config and deployment README"
```

---

## Post-Plan Manual Verification (End-to-End)

Not a task with commits — a final manual check once all 18 tasks are done, using one real credential per provider (per spec's testing scope):

1. Set real `ROUTER_SECRET_KEY`/`JWT_SECRET`, start with `npm run build && npm start`.
2. Log in, add one real Helius API key as a credential.
3. `curl -X POST http://localhost:4790/proxy/helius/ -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}'` — confirm a real 200 response from Helius.
4. Repeat for Birdeye (`curl http://localhost:4790/proxy/birdeye/defi/price?address=So11111111111111111111111111111111111111112`), DexScreener, and Jupiter (with a real key configured with the correct `api.jup.ag` base URL override) if available.
5. Confirm each successful call appears in the Logs page with correct status code and duration.
