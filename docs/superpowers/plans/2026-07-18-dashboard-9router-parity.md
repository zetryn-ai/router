# Dashboard 9Router-Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Zetryn Router dashboard to mirror 9Router's information architecture — a 5-item nav (API Endpoint, Providers, Combos AI, Logs, Settings), consumer API-key auth with enforcement, category-grouped providers with per-provider sticky round-robin, LLM model catalog, and AI-only model combos with fallback/round-robin/fusion/capacity strategies.

**Architecture:** Extends the existing Next.js 15 App Router + SQLite (better-sqlite3) + Polygon-theme dashboard. New DB tables (`api_keys`, `combos`) and new provider columns (`category`, `sticky_limit`, `is_llm`, `models_json`) added via migration 003. The proxy gains two new resolution paths: consumer-key enforcement (gate before rotation) and combo resolution (`/proxy/combo/<name>/...` fans out to member LLM models by strategy). Combos are LLM-only; RPC/data/swap providers are unaffected.

**Tech Stack:** Next.js 16 (App Router, TypeScript), better-sqlite3, Zod, Tailwind v4, Framer Motion, Vitest, jose.

## Global Constraints

- Node.js 24 — native `fetch`, no polyfills.
- Secrets (`credentials.secret_value`, `api_keys.key_hash`) never returned to the client in plaintext; consumer API keys are shown once at creation then stored hashed.
- Consumer API keys are hashed with the existing `hashPassword`/`verifyPassword` scrypt helpers in `src/lib/auth.ts` (salted scrypt) — do NOT invent a new hashing scheme.
- Migrations are append-only files under `src/lib/migrations/` applied by the `schema_migrations` ledger in `src/lib/db.ts`; never edit `001_init.sql` or `002_rotation.sql`.
- Combos are LLM-only: only providers with `is_llm = 1` expose models and may be combo members. Enforce in the API layer.
- All new UI uses the existing shared components (`@/components/ui`, `@/components/status-badge`, glass-card utilities) and the Polygon theme tokens — never hardcode hex.
- The proxy stays loopback-only; consumer-key enforcement is opt-in via the `require_api_key` setting (default off) so existing loopback bot calls keep working until the user turns it on.
- `rotation_strategy` values remain `round_robin | lru | priority` (existing). Combo strategies are a separate enum `fallback | round_robin | fusion | capacity` stored on the combo, not on providers.
- Every task ends green: `npm test` passes and `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build` succeeds.

---

## File Structure

```
src/lib/
├── migrations/003_endpoint_combos.sql   # NEW: api_keys, combos tables; provider category/sticky/is_llm/models columns
├── apikeys.repo.ts                       # NEW: consumer API key CRUD (hashed), verify
├── combos.repo.ts                        # NEW: combo CRUD, member models as JSON
├── providers.repo.ts                     # MODIFY: category, stickyLimit, isLlm, models fields + seed metadata
├── schemas.ts                            # MODIFY: NewApiKey, NewCombo, category/strategy enums
├── proxy-orchestrator.ts                 # MODIFY: consumer-key gate; export requireApiKeyEnabled()
├── combo-orchestrator.ts                 # NEW: resolve /proxy/combo/<name> by strategy
├── rotation.ts                           # MODIFY: sticky round-robin (repeat same cred N times)
└── settings.repo.ts                      # (unchanged; reused for require_api_key + endpoint settings)

src/app/(dashboard)/
├── dashboard-shell.tsx                   # MODIFY: 5 nav items incl. API Endpoint + Combos AI
├── endpoint/page.tsx                     # NEW: API Endpoint page (base URL + API keys section)
├── endpoint/api-keys-panel.tsx           # NEW: client — create/list/revoke consumer keys, require toggle
├── page.tsx                              # MODIFY: providers overview grouped by category
├── provider-card.tsx                     # MODIFY: show category badge + connection count + sticky/RR
├── providers/[slug]/page.tsx             # MODIFY: sticky-N control, models section (LLM only)
├── providers/[slug]/sticky-control.tsx   # NEW: client — round-robin + sticky-N input
├── combos/page.tsx                       # NEW: combos list + strategy descriptions
└── combos/combo-editor.tsx               # NEW: client — create/edit combo modal (name, models, strategy)

src/app/api/
├── apikeys/route.ts                      # NEW: GET list, POST create (returns plaintext once)
├── apikeys/[id]/route.ts                 # NEW: DELETE (revoke)
├── combos/route.ts                       # NEW: GET list, POST create
├── combos/[name]/route.ts               # NEW: PATCH (models/strategy), DELETE
└── providers/[slug]/route.ts             # MODIFY: accept stickyLimit in PATCH

src/app/proxy/
├── [slug]/[[...path]]/route.ts           # MODIFY: call consumer-key gate
└── combo/[name]/[[...path]]/route.ts     # NEW: combo proxy entrypoint
```

---

### Task 1: Migration 003 — endpoint, combos, provider metadata

**Files:**
- Create: `src/lib/migrations/003_endpoint_combos.sql`
- Test: `tests/db.test.ts` (extend)

**Interfaces:**
- Produces: new columns `providers.category` (TEXT, default `'other'`), `providers.sticky_limit` (INTEGER, default 1), `providers.is_llm` (INTEGER 0/1, default 0), `providers.models_json` (TEXT nullable); new tables `api_keys(id, label, key_hash, key_prefix, created_at, last_used_at)` and `combos(id, name UNIQUE, strategy, models_json, created_at)`.

- [ ] **Step 1: Write the migration SQL**

Create `src/lib/migrations/003_endpoint_combos.sql`:
```sql
ALTER TABLE providers ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE providers ADD COLUMN sticky_limit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE providers ADD COLUMN is_llm INTEGER NOT NULL DEFAULT 0;
ALTER TABLE providers ADD COLUMN models_json TEXT;

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  strategy TEXT NOT NULL DEFAULT 'fallback' CHECK (strategy IN ('fallback','round_robin','fusion','capacity')),
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Write the failing test**

Extend `tests/db.test.ts` — add inside the top-level `describe('getDb', ...)`:
```typescript
  it('applies migration 003 (provider category/sticky/is_llm/models, api_keys, combos)', async () => {
    const { getDb } = await import('../src/lib/db')
    const db = getDb()
    const providerCols = (db.prepare('PRAGMA table_info(providers)').all() as { name: string }[]).map((c) => c.name)
    expect(providerCols).toEqual(
      expect.arrayContaining(['category', 'sticky_limit', 'is_llm', 'models_json'])
    )
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((t) => t.name)
    expect(tables).toEqual(expect.arrayContaining(['api_keys', 'combos']))
  })
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/db.test.ts`
Expected: FAIL — new columns/tables missing (test asserts arrayContaining and finds them absent).

- [ ] **Step 4: Run test to verify it passes**

The migration runner in `src/lib/db.ts` auto-applies any new `.sql` file. No code change needed beyond Step 1.

Run: `npm test -- tests/db.test.ts`
Expected: PASS (all db tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/migrations/003_endpoint_combos.sql tests/db.test.ts
git commit -m "feat: migration 003 — provider category/sticky/is_llm/models, api_keys and combos tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Provider metadata (category, sticky, isLlm, models) + seed

**Files:**
- Modify: `src/lib/providers.repo.ts`
- Modify: `src/lib/schemas.ts`
- Test: `tests/providers.repo.test.ts` (extend)

**Interfaces:**
- Consumes: migration 003 columns.
- Produces:
  - `type ProviderCategory = 'rpc' | 'data' | 'swap' | 'llm' | 'other'`
  - `Provider` gains `category: ProviderCategory`, `stickyLimit: number`, `isLlm: boolean`, `models: string[]`.
  - `setStickyLimit(providerId: number, limit: number): void`
  - Seed sets category + isLlm + models for the 8 defaults.

- [ ] **Step 1: Write the failing test**

Extend `tests/providers.repo.test.ts` inside `describe('providers.repo', ...)`:
```typescript
  it('seeds providers with categories and marks LLM providers', async () => {
    const { seedDefaultProviders, getProviderBySlug } = await import('../src/lib/providers.repo')
    seedDefaultProviders()
    expect(getProviderBySlug('helius')).toMatchObject({ category: 'rpc', isLlm: false })
    expect(getProviderBySlug('birdeye')).toMatchObject({ category: 'data', isLlm: false })
    expect(getProviderBySlug('jupiter')).toMatchObject({ category: 'swap', isLlm: false })
    const openai = getProviderBySlug('openai')!
    expect(openai.category).toBe('llm')
    expect(openai.isLlm).toBe(true)
    expect(openai.models).toEqual(expect.arrayContaining(['gpt-4o', 'gpt-4o-mini']))
  })

  it('setStickyLimit updates the value', async () => {
    const { createProvider, getProviderBySlug, setStickyLimit } = await import('../src/lib/providers.repo')
    const p = createProvider({
      slug: 'sticky-p', name: 'Sticky', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://api.example.com',
    })
    setStickyLimit(p.id, 5)
    expect(getProviderBySlug('sticky-p')!.stickyLimit).toBe(5)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/providers.repo.test.ts`
Expected: FAIL — `category`/`isLlm`/`models`/`setStickyLimit` undefined.

- [ ] **Step 3: Extend schemas.ts**

In `src/lib/schemas.ts`, add near the top (after `RotationStrategySchema`):
```typescript
export const ProviderCategorySchema = z.enum(['rpc', 'data', 'swap', 'llm', 'other'])
export type ProviderCategory = z.infer<typeof ProviderCategorySchema>
```
Add `category`, `isLlm`, `models`, `stickyLimit` as optional to `NewProviderSchema`:
```typescript
export const NewProviderSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with dashes'),
  name: z.string().min(1),
  defaultInjectLocation: InjectLocationSchema,
  defaultInjectKeyName: z.string().nullable().optional(),
  defaultBaseUrl: z.string().url().nullable().optional(),
  rotationStrategy: RotationStrategySchema.optional(),
  defaultInjectValueTemplate: z.string().nullable().optional(),
  category: ProviderCategorySchema.optional(),
  isLlm: z.boolean().optional(),
  models: z.array(z.string()).optional(),
  stickyLimit: z.number().int().positive().optional(),
})
```
Extend `UpdateProviderSchema` to accept sticky:
```typescript
export const UpdateProviderSchema = z.object({
  rotationStrategy: RotationStrategySchema.optional(),
  stickyLimit: z.number().int().positive().optional(),
})
```

- [ ] **Step 4: Update providers.repo.ts**

In `src/lib/providers.repo.ts`, extend the `Provider` type, `ProviderRow` type, `toProvider`, `createProvider` INSERT, add `setStickyLimit`, and seed metadata.

Replace the `Provider` type:
```typescript
export type Provider = {
  id: number
  slug: string
  name: string
  defaultInjectLocation: 'query' | 'header' | 'path'
  defaultInjectKeyName: string | null
  defaultBaseUrl: string | null
  rotationStrategy: RotationStrategy
  defaultInjectValueTemplate: string | null
  category: 'rpc' | 'data' | 'swap' | 'llm' | 'other'
  stickyLimit: number
  isLlm: boolean
  models: string[]
  createdAt: string
}
```
Add to `ProviderRow`:
```typescript
  category: 'rpc' | 'data' | 'swap' | 'llm' | 'other'
  sticky_limit: number
  is_llm: number
  models_json: string | null
```
In `toProvider`, add:
```typescript
    category: row.category,
    stickyLimit: row.sticky_limit,
    isLlm: row.is_llm === 1,
    models: row.models_json ? JSON.parse(row.models_json) : [],
```
Replace `createProvider` INSERT to include the new columns:
```typescript
export function createProvider(input: NewProviderInput): Provider {
  const result = getDb()
    .prepare(
      `INSERT INTO providers (slug, name, default_inject_location, default_inject_key_name, default_base_url, rotation_strategy, default_inject_value_template, category, sticky_limit, is_llm, models_json)
       VALUES (@slug, @name, @defaultInjectLocation, @defaultInjectKeyName, @defaultBaseUrl, @rotationStrategy, @defaultInjectValueTemplate, @category, @stickyLimit, @isLlm, @modelsJson)`
    )
    .run({
      slug: input.slug,
      name: input.name,
      defaultInjectLocation: input.defaultInjectLocation,
      defaultInjectKeyName: input.defaultInjectKeyName ?? null,
      defaultBaseUrl: input.defaultBaseUrl ?? null,
      rotationStrategy: input.rotationStrategy ?? 'round_robin',
      defaultInjectValueTemplate: input.defaultInjectValueTemplate ?? null,
      category: input.category ?? 'other',
      stickyLimit: input.stickyLimit ?? 1,
      isLlm: input.isLlm ? 1 : 0,
      modelsJson: input.models ? JSON.stringify(input.models) : null,
    })
  const created = getProviderBySlug(input.slug)
  if (!created) {
    throw new Error(`failed to read back created provider ${input.slug} (rowid ${result.lastInsertRowid})`)
  }
  return created
}
```
Add after `setRotationStrategy`:
```typescript
export function setStickyLimit(providerId: number, limit: number): void {
  getDb().prepare('UPDATE providers SET sticky_limit = ? WHERE id = ?').run(limit, providerId)
}
```
Update `DEFAULT_PROVIDERS` entries to add `category` and (for LLM) `isLlm` + `models`:
- helius → `category: 'rpc'`
- quicknode → `category: 'rpc'`
- birdeye → `category: 'data'`
- dexscreener → `category: 'data'`
- jupiter → `category: 'swap'`
- openai → `category: 'llm', isLlm: true, models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini']`
- anthropic → `category: 'llm', isLlm: true, models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']`
- gemini → `category: 'llm', isLlm: true, models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-flash']`

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/providers.repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers.repo.ts src/lib/schemas.ts tests/providers.repo.test.ts
git commit -m "feat: provider category/sticky/isLlm/models metadata + LLM model seeds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Sticky round-robin in rotation

**Files:**
- Modify: `src/lib/rotation.ts`
- Test: `tests/rotation.test.ts` (extend)

**Interfaces:**
- Consumes: `Provider.stickyLimit`.
- Produces: round-robin now repeats the same credential `stickyLimit` times before advancing. LRU/priority unaffected. In-memory counter per provider.

- [ ] **Step 1: Write the failing test**

Extend `tests/rotation.test.ts` inside `describe('pickNextCredential', ...)`:
```typescript
  it('sticky round-robin repeats the same credential stickyLimit times before advancing', async () => {
    const { createProvider } = await import('../src/lib/providers.repo')
    const { createCredential } = await import('../src/lib/credentials.repo')
    const { pickNextCredential } = await import('../src/lib/rotation')
    const provider = createProvider({
      slug: 'sticky-rr', name: 'StickyRR', defaultInjectLocation: 'header',
      defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://api.example.com',
      stickyLimit: 2,
    })
    createCredential({ providerId: provider.id, label: 'a', secretValue: 's1' })
    createCredential({ providerId: provider.id, label: 'b', secretValue: 's2' })
    const picks = [
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
      pickNextCredential(provider)!.label,
    ]
    // stickyLimit=2 → a,a,b,b
    expect(picks[0]).toBe(picks[1])
    expect(picks[2]).toBe(picks[3])
    expect(picks[0]).not.toBe(picks[2])
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/rotation.test.ts`
Expected: FAIL — current round-robin advances every call (a,b,a,b).

- [ ] **Step 3: Update rotation.ts round-robin branch**

In `src/lib/rotation.ts`, replace the module-level pointer map and the `round_robin` branch. Add a second map for sticky counts:
```typescript
const roundRobinPointers = new Map<number, number>()
const stickyCounts = new Map<number, number>()
```
Replace the `round_robin` case body:
```typescript
    case 'round_robin':
    default: {
      const limit = Math.max(1, provider.stickyLimit ?? 1)
      const used = stickyCounts.get(provider.id) ?? 0
      let index = roundRobinPointers.get(provider.id) ?? 0
      if (used >= limit) {
        // advance to next credential and reset the sticky counter
        index = (index + 1) % active.length
        roundRobinPointers.set(provider.id, index)
        stickyCounts.set(provider.id, 1)
      } else {
        if (index >= active.length) index = 0
        roundRobinPointers.set(provider.id, index)
        stickyCounts.set(provider.id, used + 1)
      }
      return active[index]
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/rotation.test.ts`
Expected: PASS. Note the pre-existing round-robin test uses the default `stickyLimit` of 1, so a,b,a alternation still holds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rotation.ts tests/rotation.test.ts
git commit -m "feat: sticky round-robin — repeat a credential N times before advancing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Consumer API keys repo (hashed)

**Files:**
- Create: `src/lib/apikeys.repo.ts`
- Modify: `src/lib/schemas.ts`
- Test: `tests/apikeys.repo.test.ts`

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` from `src/lib/auth.ts`, `getDb`.
- Produces:
  - `type ApiKey = { id: number; label: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null }`
  - `createApiKey(label: string): { record: ApiKey; plaintext: string }` — generates `zr_<32 hex>`, stores hash + first 8 chars as prefix, returns plaintext ONCE.
  - `listApiKeys(): ApiKey[]`
  - `deleteApiKey(id: number): void`
  - `verifyApiKey(plaintext: string): boolean` — true if any stored hash matches; touches `last_used_at`.
  - `NewApiKeySchema` (Zod) in schemas.ts.

- [ ] **Step 1: Write the failing test**

Create `tests/apikeys.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-apikeys-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.JWT_SECRET = 'test-jwt'
})

describe('apikeys.repo', () => {
  it('creates a key, returns plaintext once, stores only a hash + prefix', async () => {
    const { createApiKey, listApiKeys } = await import('../src/lib/apikeys.repo')
    const { record, plaintext } = createApiKey('bot-1')
    expect(plaintext).toMatch(/^zr_[0-9a-f]{32}$/)
    expect(record.label).toBe('bot-1')
    expect(record.keyPrefix).toBe(plaintext.slice(0, 8))
    const { getDb } = await import('../src/lib/db')
    const row = getDb().prepare('SELECT key_hash FROM api_keys WHERE id = ?').get(record.id) as { key_hash: string }
    expect(row.key_hash).not.toContain(plaintext)
    expect(listApiKeys()).toHaveLength(1)
  })

  it('verifyApiKey accepts a valid key and rejects a bad one', async () => {
    const { createApiKey, verifyApiKey } = await import('../src/lib/apikeys.repo')
    const { plaintext } = createApiKey('bot-1')
    expect(verifyApiKey(plaintext)).toBe(true)
    expect(verifyApiKey('zr_' + '0'.repeat(32))).toBe(false)
  })

  it('deleteApiKey removes it and revokes access', async () => {
    const { createApiKey, deleteApiKey, verifyApiKey, listApiKeys } = await import('../src/lib/apikeys.repo')
    const { record, plaintext } = createApiKey('bot-1')
    deleteApiKey(record.id)
    expect(listApiKeys()).toHaveLength(0)
    expect(verifyApiKey(plaintext)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/apikeys.repo.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Add schema**

In `src/lib/schemas.ts` append:
```typescript
export const NewApiKeySchema = z.object({
  label: z.string().min(1),
})
```

- [ ] **Step 4: Implement apikeys.repo.ts**

Create `src/lib/apikeys.repo.ts`:
```typescript
import crypto from 'node:crypto'
import { getDb } from './db'
import { hashPassword, verifyPassword } from './auth'

export type ApiKey = {
  id: number
  label: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

type ApiKeyRow = {
  id: number
  label: string
  key_hash: string
  key_prefix: string
  created_at: string
  last_used_at: string | null
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }
}

export function createApiKey(label: string): { record: ApiKey; plaintext: string } {
  const plaintext = 'zr_' + crypto.randomBytes(16).toString('hex')
  const keyHash = hashPassword(plaintext)
  const keyPrefix = plaintext.slice(0, 8)
  const result = getDb()
    .prepare('INSERT INTO api_keys (label, key_hash, key_prefix) VALUES (?, ?, ?)')
    .run(label, keyHash, keyPrefix)
  const row = getDb().prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid) as ApiKeyRow
  return { record: toApiKey(row), plaintext }
}

export function listApiKeys(): ApiKey[] {
  const rows = getDb().prepare('SELECT * FROM api_keys ORDER BY id DESC').all() as ApiKeyRow[]
  return rows.map(toApiKey)
}

export function deleteApiKey(id: number): void {
  getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(id)
}

export function verifyApiKey(plaintext: string): boolean {
  const rows = getDb().prepare('SELECT * FROM api_keys').all() as ApiKeyRow[]
  for (const row of rows) {
    if (verifyPassword(plaintext, row.key_hash)) {
      getDb().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(row.id)
      return true
    }
  }
  return false
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/apikeys.repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/apikeys.repo.ts src/lib/schemas.ts tests/apikeys.repo.test.ts
git commit -m "feat: consumer API key repo — hashed storage, plaintext shown once, verify

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Consumer-key enforcement in the proxy

**Files:**
- Modify: `src/lib/proxy-orchestrator.ts`
- Modify: `src/app/proxy/[slug]/[[...path]]/route.ts`
- Test: `tests/proxy-route.test.ts` (extend)

**Interfaces:**
- Consumes: `verifyApiKey` (Task 4), `getSetting` (settings.repo).
- Produces:
  - `requireApiKeyEnabled(): boolean` (reads setting `require_api_key === '1'`).
  - `handleProxyRequest` gains optional `authorization?: string | null` on its input; when enforcement is on and the bearer token is missing/invalid, returns `{ status: 401, body: { error: 'invalid or missing API key' } }` BEFORE touching credentials.

- [ ] **Step 1: Write the failing test**

Extend `tests/proxy-route.test.ts` inside `describe('handleProxyRequest', ...)`:
```typescript
  it('rejects with 401 when require_api_key is on and no key is supplied', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { setSetting } = await import('../src/lib/settings.repo')
    setSetting('require_api_key', '1')
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn()
    const result = await handleProxyRequest({
      slug: provider.slug, path: '/foo', query: new URLSearchParams(),
      method: 'GET', body: null, headers: {}, fetchFn, authorization: null,
    })
    expect(result.status).toBe(401)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('accepts a valid consumer key when enforcement is on', async () => {
    const { provider } = await setupProviderWithTwoCredentials()
    const { setSetting } = await import('../src/lib/settings.repo')
    const { createApiKey } = await import('../src/lib/apikeys.repo')
    setSetting('require_api_key', '1')
    const { plaintext } = createApiKey('bot')
    const { handleProxyRequest } = await import('../src/lib/proxy-orchestrator')
    const fetchFn = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const result = await handleProxyRequest({
      slug: provider.slug, path: '/foo', query: new URLSearchParams(),
      method: 'GET', body: null, headers: {}, fetchFn, authorization: `Bearer ${plaintext}`,
    })
    expect(result.status).toBe(200)
  })
```
Note: `tests/proxy-route.test.ts` `beforeEach` already sets `DATA_DIR` and `ROUTER_SECRET_KEY`; add `process.env.JWT_SECRET = 'test-jwt'` to its `beforeEach` so the scrypt hashing helpers work.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/proxy-route.test.ts`
Expected: FAIL — `authorization` not handled; 401 path missing.

- [ ] **Step 3: Update proxy-orchestrator.ts**

In `src/lib/proxy-orchestrator.ts`:

Add imports at top:
```typescript
import { getSetting } from './settings.repo'
import { verifyApiKey } from './apikeys.repo'
```
(Note: `getSetting` may already be imported for cooldown — do not duplicate the import.)

Add exported helper:
```typescript
export function requireApiKeyEnabled(): boolean {
  return getSetting('require_api_key') === '1'
}
```
Add `authorization?: string | null` to `ProxyRequestInput`:
```typescript
export type ProxyRequestInput = {
  slug: string
  path: string
  query: URLSearchParams
  method: string
  body: BodyInit | null
  headers: Record<string, string>
  fetchFn: (url: string, init: RequestInit) => Promise<Response>
  authorization?: string | null
}
```
At the very start of `handleProxyRequest` (before `getProviderBySlug`), add the gate:
```typescript
  if (requireApiKeyEnabled()) {
    const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token || !verifyApiKey(token)) {
      return { status: 401, body: { error: 'invalid or missing API key' } }
    }
  }
```

- [ ] **Step 4: Update the proxy route to pass the header**

In `src/app/proxy/[slug]/[[...path]]/route.ts`, inside `handle`, capture the Authorization header and pass it, while ensuring it is NOT forwarded upstream (strip it from `headers`). Update the header loop and the `handleProxyRequest` call:
```typescript
  const headers: Record<string, string> = {}
  let authorization: string | null = null
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'authorization') {
      authorization = value
      return // consumed by the router, never forwarded upstream
    }
    if (!STRIP_REQUEST_HEADERS.includes(lower)) {
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
    authorization,
  })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/proxy-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/proxy-orchestrator.ts "src/app/proxy/[slug]/[[...path]]/route.ts" tests/proxy-route.test.ts
git commit -m "feat: opt-in consumer API-key enforcement gate in the proxy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Combos repo

**Files:**
- Create: `src/lib/combos.repo.ts`
- Modify: `src/lib/schemas.ts`
- Test: `tests/combos.repo.test.ts`

**Interfaces:**
- Consumes: `getDb`.
- Produces:
  - `type ComboStrategy = 'fallback' | 'round_robin' | 'fusion' | 'capacity'`
  - `type Combo = { id: number; name: string; strategy: ComboStrategy; models: string[]; createdAt: string }`
  - `listCombos(): Combo[]`, `getComboByName(name: string): Combo | undefined`
  - `createCombo(input: { name: string; strategy: ComboStrategy; models: string[] }): Combo`
  - `updateCombo(name: string, patch: { strategy?: ComboStrategy; models?: string[] }): void`
  - `deleteCombo(name: string): void`
  - `NewComboSchema`, `UpdateComboSchema`, `ComboStrategySchema` in schemas.ts.

- [ ] **Step 1: Write the failing test**

Create `tests/combos.repo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-combos-repo')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
})

describe('combos.repo', () => {
  it('creates and reads a combo with models and strategy', async () => {
    const { createCombo, getComboByName } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o', 'gemini/gemini-2.5-flash'] })
    const c = getComboByName('combo1')!
    expect(c.strategy).toBe('fallback')
    expect(c.models).toEqual(['openai/gpt-4o', 'gemini/gemini-2.5-flash'])
  })

  it('updates strategy and models', async () => {
    const { createCombo, updateCombo, getComboByName } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o'] })
    updateCombo('combo1', { strategy: 'round_robin', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-5'] })
    const c = getComboByName('combo1')!
    expect(c.strategy).toBe('round_robin')
    expect(c.models).toHaveLength(2)
  })

  it('deletes a combo', async () => {
    const { createCombo, deleteCombo, listCombos } = await import('../src/lib/combos.repo')
    createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o'] })
    deleteCombo('combo1')
    expect(listCombos()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/combos.repo.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Add schemas**

In `src/lib/schemas.ts` append:
```typescript
export const ComboStrategySchema = z.enum(['fallback', 'round_robin', 'fusion', 'capacity'])
export type ComboStrategy = z.infer<typeof ComboStrategySchema>

export const NewComboSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/, 'only letters, numbers, -, _ and . allowed'),
  strategy: ComboStrategySchema,
  models: z.array(z.string().min(1)).min(1),
})

export const UpdateComboSchema = z.object({
  strategy: ComboStrategySchema.optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
})
```

- [ ] **Step 4: Implement combos.repo.ts**

Create `src/lib/combos.repo.ts`:
```typescript
import { getDb } from './db'
import type { ComboStrategy } from './schemas'

export type Combo = {
  id: number
  name: string
  strategy: ComboStrategy
  models: string[]
  createdAt: string
}

type ComboRow = {
  id: number
  name: string
  strategy: ComboStrategy
  models_json: string
  created_at: string
}

function toCombo(row: ComboRow): Combo {
  return {
    id: row.id,
    name: row.name,
    strategy: row.strategy,
    models: JSON.parse(row.models_json),
    createdAt: row.created_at,
  }
}

export function listCombos(): Combo[] {
  const rows = getDb().prepare('SELECT * FROM combos ORDER BY name').all() as ComboRow[]
  return rows.map(toCombo)
}

export function getComboByName(name: string): Combo | undefined {
  const row = getDb().prepare('SELECT * FROM combos WHERE name = ?').get(name) as ComboRow | undefined
  return row ? toCombo(row) : undefined
}

export function createCombo(input: { name: string; strategy: ComboStrategy; models: string[] }): Combo {
  getDb()
    .prepare('INSERT INTO combos (name, strategy, models_json) VALUES (?, ?, ?)')
    .run(input.name, input.strategy, JSON.stringify(input.models))
  const created = getComboByName(input.name)
  if (!created) throw new Error(`failed to read back combo ${input.name}`)
  return created
}

export function updateCombo(name: string, patch: { strategy?: ComboStrategy; models?: string[] }): void {
  if (patch.strategy !== undefined) {
    getDb().prepare('UPDATE combos SET strategy = ? WHERE name = ?').run(patch.strategy, name)
  }
  if (patch.models !== undefined) {
    getDb().prepare('UPDATE combos SET models_json = ? WHERE name = ?').run(JSON.stringify(patch.models), name)
  }
}

export function deleteCombo(name: string): void {
  getDb().prepare('DELETE FROM combos WHERE name = ?').run(name)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/combos.repo.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/combos.repo.ts src/lib/schemas.ts tests/combos.repo.test.ts
git commit -m "feat: combos repo — name, strategy, member models CRUD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Combo orchestrator (fallback + round_robin; fusion/capacity degraded)

**Files:**
- Create: `src/lib/combo-orchestrator.ts`
- Create: `src/app/proxy/combo/[name]/[[...path]]/route.ts`
- Test: `tests/combo-orchestrator.test.ts`

**Interfaces:**
- Consumes: `getComboByName` (Task 6), `handleProxyRequest` (Task 5), `logRequest`.
- Produces: `handleComboRequest(input)` where input mirrors `ProxyRequestInput` but with `comboName` instead of `slug`. It resolves the combo, then dispatches to member models. A member model string is `"<provider-slug>/<model-id>"`; the orchestrator rewrites the request to `handleProxyRequest` targeting that provider with the model injected into the JSON body's `model` field. Strategy behavior:
  - `fallback`: try members in order until one returns 2xx.
  - `round_robin`: rotate the starting member per call (in-memory pointer), then fall back through the rest.
  - `fusion` and `capacity`: for this phase, behave as `fallback` and record a log note; a comment documents the degrade so it is not silently wrong.

- [ ] **Step 1: Write the failing test**

Create `tests/combo-orchestrator.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const TEST_DATA_DIR = path.join(process.cwd(), 'data', 'test-combo-orch')

beforeEach(() => {
  vi.resetModules()
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true })
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true })
  process.env.DATA_DIR = TEST_DATA_DIR
  process.env.ROUTER_SECRET_KEY = '0'.repeat(64)
  process.env.JWT_SECRET = 'test-jwt'
})

async function seedLlm() {
  const { createProvider } = await import('../src/lib/providers.repo')
  const { createCredential } = await import('../src/lib/credentials.repo')
  const { createCombo } = await import('../src/lib/combos.repo')
  const openai = createProvider({
    slug: 'openai', name: 'OpenAI', defaultInjectLocation: 'header',
    defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}',
    defaultBaseUrl: 'https://api.openai.com', category: 'llm', isLlm: true, models: ['gpt-4o'],
  })
  const gemini = createProvider({
    slug: 'gemini', name: 'Gemini', defaultInjectLocation: 'query', defaultInjectKeyName: 'key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com', category: 'llm', isLlm: true, models: ['gemini-2.5-flash'],
  })
  createCredential({ providerId: openai.id, label: 'o', secretValue: 'sk-o' })
  createCredential({ providerId: gemini.id, label: 'g', secretValue: 'sk-g' })
  createCombo({ name: 'combo1', strategy: 'fallback', models: ['openai/gpt-4o', 'gemini/gemini-2.5-flash'] })
}

describe('handleComboRequest', () => {
  it('returns 404 for an unknown combo', async () => {
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    const result = await handleComboRequest({
      comboName: 'nope', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ messages: [] }), headers: {}, fetchFn: vi.fn(),
    })
    expect(result.status).toBe(404)
  })

  it('fallback: first member fails, second succeeds', async () => {
    await seedLlm()
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    const result = await handleComboRequest({
      comboName: 'combo1', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ model: 'combo1', messages: [] }), headers: { 'content-type': 'application/json' },
      fetchFn,
    })
    expect(result.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('rewrites the body model field to the member model id', async () => {
    await seedLlm()
    const { handleComboRequest } = await import('../src/lib/combo-orchestrator')
    let capturedBody = ''
    const fetchFn = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedBody = String(init.body)
      return Promise.resolve(new Response('ok', { status: 200 }))
    })
    await handleComboRequest({
      comboName: 'combo1', path: '/v1/chat/completions', query: new URLSearchParams(),
      method: 'POST', body: JSON.stringify({ model: 'combo1', messages: [] }), headers: { 'content-type': 'application/json' },
      fetchFn,
    })
    expect(JSON.parse(capturedBody).model).toBe('gpt-4o')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/combo-orchestrator.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement combo-orchestrator.ts**

Create `src/lib/combo-orchestrator.ts`:
```typescript
import { getComboByName } from './combos.repo'
import { handleProxyRequest, type ProxyResult } from './proxy-orchestrator'

const roundRobinStart = new Map<string, number>()

export type ComboRequestInput = {
  comboName: string
  path: string
  query: URLSearchParams
  method: string
  body: BodyInit | null
  headers: Record<string, string>
  fetchFn: (url: string, init: RequestInit) => Promise<Response>
  authorization?: string | null
}

// Rewrite the JSON body's `model` field to the concrete member model id.
// If the body is not JSON or has no model field, it is passed through unchanged.
function rewriteModel(body: BodyInit | null, modelId: string): BodyInit | null {
  if (typeof body !== 'string') return body
  try {
    const parsed = JSON.parse(body)
    if (parsed && typeof parsed === 'object') {
      parsed.model = modelId
      return JSON.stringify(parsed)
    }
  } catch {
    // not JSON — leave as-is
  }
  return body
}

export async function handleComboRequest(input: ComboRequestInput): Promise<ProxyResult> {
  const combo = getComboByName(input.comboName)
  if (!combo) {
    return { status: 404, body: { error: `unknown combo "${input.comboName}"` } }
  }
  if (combo.models.length === 0) {
    return { status: 503, body: { error: 'combo has no models', combo: combo.name } }
  }

  // Determine member order. round_robin rotates the starting index per call.
  // fusion and capacity are not yet distinct — they degrade to fallback order.
  let order = combo.models
  if (combo.strategy === 'round_robin') {
    const start = (roundRobinStart.get(combo.name) ?? -1) + 1
    roundRobinStart.set(combo.name, start)
    const offset = start % combo.models.length
    order = [...combo.models.slice(offset), ...combo.models.slice(0, offset)]
  }

  let lastResult: ProxyResult = { status: 502, body: { error: 'combo exhausted', combo: combo.name } }
  for (const member of order) {
    const slash = member.indexOf('/')
    if (slash < 0) continue
    const slug = member.slice(0, slash)
    const modelId = member.slice(slash + 1)
    const result = await handleProxyRequest({
      slug,
      path: input.path,
      query: input.query,
      method: input.method,
      body: rewriteModel(input.body, modelId),
      headers: input.headers,
      fetchFn: input.fetchFn,
      authorization: input.authorization,
    })
    if (result.status >= 200 && result.status < 300) return result
    lastResult = result
  }
  return lastResult
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/combo-orchestrator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the combo proxy route**

Create `src/app/proxy/combo/[name]/[[...path]]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { handleComboRequest } from '@/lib/combo-orchestrator'

const STRIP_REQUEST_HEADERS = ['host', 'connection', 'content-length', 'accept-encoding']

async function handle(req: NextRequest, params: { name: string; path?: string[] }) {
  const path = '/' + (params.path ?? []).join('/')
  const query = req.nextUrl.searchParams
  const method = req.method
  const body = method === 'GET' || method === 'HEAD' ? null : await req.text()
  const headers: Record<string, string> = {}
  let authorization: string | null = null
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'authorization') {
      authorization = value
      return
    }
    if (!STRIP_REQUEST_HEADERS.includes(lower)) headers[key] = value
  })

  const result = await handleComboRequest({
    comboName: params.name,
    path,
    query,
    method,
    body,
    headers,
    fetchFn: fetch,
    authorization,
  })

  if (result.stream !== undefined) {
    return new Response(result.stream, { status: result.status, headers: result.headers })
  }
  return Response.json(result.body, { status: result.status })
}

type Ctx = { params: Promise<{ name: string; path?: string[] }> }
export async function GET(req: NextRequest, ctx: Ctx) { return handle(req, await ctx.params) }
export async function POST(req: NextRequest, ctx: Ctx) { return handle(req, await ctx.params) }
export async function PUT(req: NextRequest, ctx: Ctx) { return handle(req, await ctx.params) }
export async function PATCH(req: NextRequest, ctx: Ctx) { return handle(req, await ctx.params) }
export async function DELETE(req: NextRequest, ctx: Ctx) { return handle(req, await ctx.params) }
```

- [ ] **Step 6: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds; `/proxy/combo/[name]/[[...path]]` appears in the route list.

- [ ] **Step 7: Commit**

```bash
git add src/lib/combo-orchestrator.ts "src/app/proxy/combo/[name]/[[...path]]/route.ts" tests/combo-orchestrator.test.ts
git commit -m "feat: combo proxy — fallback/round-robin over LLM members, model-field rewrite

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: API routes — api keys, combos, provider sticky

**Files:**
- Create: `src/app/api/apikeys/route.ts`
- Create: `src/app/api/apikeys/[id]/route.ts`
- Create: `src/app/api/combos/route.ts`
- Create: `src/app/api/combos/[name]/route.ts`
- Modify: `src/app/api/providers/[slug]/route.ts`
- Modify: `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: repos from Tasks 2, 4, 6; `setStickyLimit`.
- Produces: REST endpoints the dashboard clients call. Combo create/edit rejects non-LLM member providers with 400.

- [ ] **Step 1: Implement api keys routes**

Create `src/app/api/apikeys/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { createApiKey, listApiKeys } from '@/lib/apikeys.repo'
import { NewApiKeySchema } from '@/lib/schemas'

export async function GET() {
  return Response.json(listApiKeys())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewApiKeySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  const { record, plaintext } = createApiKey(parsed.data.label)
  // plaintext returned ONCE — the client must surface it immediately
  return Response.json({ ...record, plaintext }, { status: 201 })
}
```

Create `src/app/api/apikeys/[id]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { deleteApiKey } from '@/lib/apikeys.repo'

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const n = Number(id)
  if (!Number.isInteger(n)) return Response.json({ error: 'invalid id' }, { status: 400 })
  deleteApiKey(n)
  return Response.json({ ok: true })
}
```

- [ ] **Step 2: Implement combos routes with LLM-only guard**

Create `src/app/api/combos/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { listCombos, createCombo, getComboByName } from '@/lib/combos.repo'
import { getProviderBySlug } from '@/lib/providers.repo'
import { NewComboSchema } from '@/lib/schemas'

// Every member "slug/model" must reference an is_llm provider.
function validateLlmMembers(models: string[]): string | null {
  for (const m of models) {
    const slug = m.split('/')[0]
    const provider = getProviderBySlug(slug)
    if (!provider) return `unknown provider "${slug}" in member "${m}"`
    if (!provider.isLlm) return `provider "${slug}" is not an LLM provider; combos are AI-only`
  }
  return null
}

export async function GET() {
  return Response.json(listCombos())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewComboSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (getComboByName(parsed.data.name)) {
    return Response.json({ error: `combo "${parsed.data.name}" already exists` }, { status: 409 })
  }
  const err = validateLlmMembers(parsed.data.models)
  if (err) return Response.json({ error: err }, { status: 400 })
  const combo = createCombo(parsed.data)
  return Response.json(combo, { status: 201 })
}
```

Create `src/app/api/combos/[name]/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { updateCombo, deleteCombo, getComboByName } from '@/lib/combos.repo'
import { getProviderBySlug } from '@/lib/providers.repo'
import { UpdateComboSchema } from '@/lib/schemas'

function validateLlmMembers(models: string[]): string | null {
  for (const m of models) {
    const slug = m.split('/')[0]
    const provider = getProviderBySlug(slug)
    if (!provider) return `unknown provider "${slug}" in member "${m}"`
    if (!provider.isLlm) return `provider "${slug}" is not an LLM provider; combos are AI-only`
  }
  return null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  if (!getComboByName(name)) return Response.json({ error: 'unknown combo' }, { status: 404 })
  const body = await req.json()
  const parsed = UpdateComboSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  if (parsed.data.models) {
    const err = validateLlmMembers(parsed.data.models)
    if (err) return Response.json({ error: err }, { status: 400 })
  }
  updateCombo(name, parsed.data)
  return Response.json({ ok: true })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  deleteCombo(name)
  return Response.json({ ok: true })
}
```

- [ ] **Step 3: Extend provider PATCH for sticky, and settings PUT for require_api_key**

In `src/app/api/providers/[slug]/route.ts`, after the existing rotation-strategy handling, also apply sticky when present. Replace the handler body's mutation section:
```typescript
  const parsed = UpdateProviderSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }
  if (parsed.data.rotationStrategy) setRotationStrategy(provider.id, parsed.data.rotationStrategy)
  if (parsed.data.stickyLimit) setStickyLimit(provider.id, parsed.data.stickyLimit)
  return Response.json({ ok: true })
```
Update the import to include `setStickyLimit`:
```typescript
import { getProviderBySlug, setRotationStrategy, setStickyLimit } from '@/lib/providers.repo'
```

In `src/app/api/settings/route.ts`, extend the discriminated union to accept a `require_api_key` toggle. Add a schema branch and handling:
```typescript
const RequireApiKeySchema = z.object({
  type: z.literal('require_api_key'),
  enabled: z.boolean(),
})
```
Add `RequireApiKeySchema` to the `BodySchema` discriminated union, and handle it:
```typescript
  if (parsed.data.type === 'require_api_key') {
    setSetting('require_api_key', parsed.data.enabled ? '1' : '0')
    return Response.json({ ok: true })
  }
```

- [ ] **Step 4: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds; `/api/apikeys`, `/api/apikeys/[id]`, `/api/combos`, `/api/combos/[name]` in route list.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/apikeys src/app/api/combos "src/app/api/providers/[slug]/route.ts" src/app/api/settings/route.ts
git commit -m "feat: API routes for consumer keys, combos (LLM-only guard), provider sticky, require-key toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Nav restructure — 5 items incl. API Endpoint + Combos AI

**Files:**
- Modify: `src/app/(dashboard)/dashboard-shell.tsx`

**Interfaces:**
- Produces: nav array with 5 entries pointing to `/endpoint`, `/`, `/combos`, `/logs`, `/settings`.

- [ ] **Step 1: Update the nav items**

In `src/app/(dashboard)/dashboard-shell.tsx`, replace `NAV_ITEMS`:
```typescript
const NAV_ITEMS = [
  { href: '/endpoint', label: 'API Endpoint', icon: '⧉' },
  { href: '/', label: 'Providers', icon: '◈' },
  { href: '/combos', label: 'Combos AI', icon: '❋' },
  { href: '/logs', label: 'Logs', icon: '≡' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]
```
`isActive` already handles `/` exact-match and prefix-match for the rest — no change needed.

- [ ] **Step 2: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard-shell.tsx"
git commit -m "feat: 5-item nav with API Endpoint and Combos AI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: API Endpoint page + API keys panel

**Files:**
- Create: `src/app/(dashboard)/endpoint/page.tsx`
- Create: `src/app/(dashboard)/endpoint/api-keys-panel.tsx`

**Interfaces:**
- Consumes: `/api/apikeys`, `/api/settings` (require_api_key), `listApiKeys`, `getSetting`.
- Produces: server page showing base URL + require-key state; client panel to create/list/revoke keys and toggle enforcement.

- [ ] **Step 1: Implement the API keys client panel**

Create `src/app/(dashboard)/endpoint/api-keys-panel.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TextInput, Button } from '@/components/ui'

type ApiKeyView = { id: number; label: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null }

export function ApiKeysPanel({
  initialKeys,
  requireEnabled,
}: {
  initialKeys: ApiKeyView[]
  requireEnabled: boolean
}) {
  const [label, setLabel] = useState('')
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [require, setRequire] = useState(requireEnabled)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function createKey(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/apikeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (res.ok) {
        const body = await res.json()
        setJustCreated(body.plaintext)
        setLabel('')
        router.refresh()
      }
    })
  }

  function revoke(id: number) {
    if (!confirm('Revoke this API key? Clients using it will be rejected.')) return
    startTransition(async () => {
      await fetch(`/api/apikeys/${id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  function toggleRequire() {
    const next = !require
    setRequire(next)
    startTransition(async () => {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'require_api_key', enabled: next }),
      })
      router.refresh()
    })
  }

  return (
    <div className="glass-card space-y-5 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">🔑</span>
          <h2 className="font-semibold">API Keys</h2>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated/60 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium">Require API key</p>
          <p className="text-xs text-text-muted">Requests without a valid key will be rejected</p>
        </div>
        <button
          onClick={toggleRequire}
          disabled={isPending}
          aria-label="Toggle require API key"
          className={`relative h-6 w-11 rounded-full transition-colors ${require ? 'bg-accent-primary' : 'bg-border-default'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${require ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <AnimatePresence>
        {justCreated && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-border-glow bg-gradient-card p-3"
          >
            <p className="text-xs text-text-secondary">Copy this key now — it will not be shown again:</p>
            <code className="mt-1 block break-all font-mono text-sm text-accent-primary">{justCreated}</code>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={createKey} className="flex gap-2">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Key label (e.g. scanner-bot)" required />
        <Button type="submit" disabled={isPending}>Create Key</Button>
      </form>

      <div className="space-y-2">
        {initialKeys.length === 0 && <p className="text-sm text-text-muted">No API keys yet.</p>}
        {initialKeys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
            <div>
              <span className="font-medium">{k.label}</span>
              <span className="ml-2 font-mono text-xs text-text-muted">{k.keyPrefix}…</span>
            </div>
            <Button variant="danger" onClick={() => revoke(k.id)} className="px-3 py-1.5 text-xs">Revoke</Button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement the endpoint page**

Create `src/app/(dashboard)/endpoint/page.tsx`:
```tsx
import { listApiKeys } from '@/lib/apikeys.repo'
import { getSetting } from '@/lib/settings.repo'
import { ApiKeysPanel } from './api-keys-panel'

export const dynamic = 'force-dynamic'

export default function EndpointPage() {
  const keys = listApiKeys()
  const requireEnabled = getSetting('require_api_key') === '1'
  const port = process.env.PORT ?? '4790'
  const baseUrl = `http://127.0.0.1:${port}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">API Endpoint</h1>
        <p className="mt-1 text-sm text-text-secondary">Where your bot components send requests.</p>
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">⧉</span>
          <h2 className="font-semibold">Local base URL</h2>
        </div>
        <code className="block rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 font-mono text-sm">
          {baseUrl}/proxy/&lt;provider&gt;/&lt;path&gt;
        </code>
        <p className="text-xs text-text-muted">
          Combos: <span className="font-mono">{baseUrl}/proxy/combo/&lt;name&gt;/&lt;path&gt;</span>. Bound to loopback only.
        </p>
      </div>

      <ApiKeysPanel initialKeys={keys} requireEnabled={requireEnabled} />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds; `/endpoint` in route list.

- [ ] **Step 4: Manual check**

Run dev server, log in, visit `/endpoint`. Create a key → plaintext banner appears once. Toggle "Require API key" on. `curl http://127.0.0.1:3000/proxy/helius` (no cred) still 503 for non-enforced… but with enforcement ON and no key → 401. Revoke the key.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/endpoint"
git commit -m "feat: API Endpoint page — base URL, consumer API keys, require-key toggle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Providers overview grouped by category

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/app/(dashboard)/provider-card.tsx`

**Interfaces:**
- Consumes: `Provider.category`, `Provider.isLlm`.
- Produces: overview groups providers under category headings (RPC Nodes, Market Data, Swap, AI / LLM, Other) with the existing stat cards + AddProviderForm retained.

- [ ] **Step 1: Update page to group by category**

In `src/app/(dashboard)/page.tsx`, replace the flat grid with grouped sections. Build the card list (keep existing counts) but also carry `category`. Replace the grid block:
```tsx
  const CATEGORY_LABELS: Record<string, string> = {
    rpc: 'RPC Nodes',
    data: 'Market Data',
    swap: 'Swap',
    llm: 'AI / LLM',
    other: 'Other',
  }
  const ORDER = ['rpc', 'data', 'swap', 'llm', 'other']
  const grouped = ORDER
    .map((cat) => ({ cat, items: cards.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0)
```
where `cards` entries now include `category: provider.category`. Render:
```tsx
      {grouped.map((group) => (
        <section key={group.cat} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {CATEGORY_LABELS[group.cat]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((card, index) => (
              <ProviderCard key={card.slug} provider={card} index={index} />
            ))}
          </div>
        </section>
      ))}
```
Update the `cards.map` to include `category` in each object:
```tsx
    return {
      slug: provider.slug,
      name: provider.name,
      category: provider.category,
      active: creds.filter((c) => c.status === 'active').length,
      cooldown: creds.filter((c) => c.status === 'cooldown').length,
      disabled: creds.filter((c) => c.status === 'disabled').length,
      error: creds.filter((c) => c.status === 'error').length,
    }
```

- [ ] **Step 2: Update ProviderCard type to accept category**

In `src/app/(dashboard)/provider-card.tsx`, add `category: string` to `ProviderCardData`. No visual change required beyond the existing card (category heading comes from the page). This keeps the type in sync so the build passes.

- [ ] **Step 3: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/page.tsx" "src/app/(dashboard)/provider-card.tsx"
git commit -m "feat: group providers overview by category (RPC/Data/Swap/LLM)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Provider detail — sticky-N control + LLM models section

**Files:**
- Create: `src/app/(dashboard)/providers/[slug]/sticky-control.tsx`
- Modify: `src/app/(dashboard)/providers/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Provider.stickyLimit`, `Provider.isLlm`, `Provider.models`, `/api/providers/[slug]` PATCH with `stickyLimit`.
- Produces: sticky-N input beside the rotation strategy (only meaningful for round-robin); a read-only "Available Models" list shown only when `isLlm`.

- [ ] **Step 1: Implement sticky-control client component**

Create `src/app/(dashboard)/providers/[slug]/sticky-control.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function StickyControl({ slug, current }: { slug: string; current: number }) {
  const [value, setValue] = useState(String(current))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function save(n: number) {
    if (!Number.isFinite(n) || n < 1) return
    startTransition(async () => {
      await fetch(`/api/providers/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stickyLimit: n }),
      })
      router.refresh()
    })
  }

  return (
    <div className="glass-card flex items-center justify-between p-5">
      <div>
        <h3 className="font-semibold">Sticky</h3>
        <p className="text-xs text-text-muted">Reuse the same key for N requests before rotating (round-robin only).</p>
      </div>
      <input
        type="number"
        min={1}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => save(Number(e.target.value))}
        className="w-20 rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-right font-mono text-sm outline-none focus:border-border-glow"
      />
    </div>
  )
}
```

- [ ] **Step 2: Wire into provider detail page**

In `src/app/(dashboard)/providers/[slug]/page.tsx`, import and render `StickyControl` right after `RotationStrategyControl`, and add an Available Models block when `provider.isLlm`. Add imports:
```tsx
import { StickyControl } from './sticky-control'
```
After `<RotationStrategyControl ... />` add:
```tsx
      <StickyControl slug={provider.slug} current={provider.stickyLimit} />
      {provider.isLlm && provider.models.length > 0 && (
        <div className="glass-card space-y-3 p-5">
          <h3 className="font-semibold">Available Models</h3>
          <div className="flex flex-wrap gap-2">
            {provider.models.map((m) => (
              <span key={m} className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1 font-mono text-xs">
                {provider.slug}/{m}
              </span>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/providers/[slug]/sticky-control.tsx" "src/app/(dashboard)/providers/[slug]/page.tsx"
git commit -m "feat: provider detail sticky-N control and LLM models list

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Combos AI page + editor

**Files:**
- Create: `src/app/(dashboard)/combos/page.tsx`
- Create: `src/app/(dashboard)/combos/combo-editor.tsx`

**Interfaces:**
- Consumes: `/api/combos`, `/api/combos/[name]`, `listCombos`, `listProviders` (for the LLM model picker).
- Produces: combos list with strategy descriptions and a create/edit modal. The model picker only offers `slug/model` entries from `isLlm` providers.

- [ ] **Step 1: Implement the combo editor client component**

Create `src/app/(dashboard)/combos/combo-editor.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TextInput, Select, FieldLabel, Button } from '@/components/ui'

type ComboView = { name: string; strategy: string; models: string[] }
type ModelOption = { value: string; label: string }

const STRATEGIES = [
  { value: 'fallback', label: 'Fallback — try in order' },
  { value: 'round_robin', label: 'Round Robin — spread load' },
  { value: 'fusion', label: 'Fusion — query all, judge picks (degrades to fallback)' },
  { value: 'capacity', label: 'Capacity auto-switch (degrades to fallback)' },
]

export function ComboEditor({
  existing,
  modelOptions,
  onClose,
}: {
  existing: ComboView | null
  modelOptions: ModelOption[]
  onClose: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [strategy, setStrategy] = useState(existing?.strategy ?? 'fallback')
  const [models, setModels] = useState<string[]>(existing?.models ?? [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggleModel(v: string) {
    setModels((prev) => (prev.includes(v) ? prev.filter((m) => m !== v) : [...prev, v]))
  }

  function submit() {
    startTransition(async () => {
      const isEdit = existing !== null
      const res = await fetch(isEdit ? `/api/combos/${existing!.name}` : '/api/combos', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { strategy, models } : { name, strategy, models }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-lg space-y-4 p-6"
      >
        <h2 className="text-lg font-semibold">{existing ? 'Edit Combo' : 'Create Combo'}</h2>

        {!existing && (
          <div className="space-y-1.5">
            <FieldLabel>Combo name</FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="combo1" required />
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel>Strategy</FieldLabel>
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Models (AI providers only)</FieldLabel>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border-default p-2">
            {modelOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleModel(opt.value)}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors ${
                  models.includes(opt.value) ? 'bg-gradient-hero text-white' : 'hover:bg-bg-elevated'
                }`}
              >
                {models.includes(opt.value) ? '✓ ' : ''}{opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || models.length === 0 || (!existing && !name)}>
            {existing ? 'Save' : 'Create'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Implement the combos page (client wrapper for modal state)**

Create `src/app/(dashboard)/combos/page.tsx`:
```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { ComboEditor } from './combo-editor'

type ComboView = { name: string; strategy: string; models: string[] }
type ModelOption = { value: string; label: string }

export default function CombosPage() {
  const [combos, setCombos] = useState<ComboView[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [editing, setEditing] = useState<ComboView | null>(null)
  const [creating, setCreating] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function load() {
    const [combosRes, providersRes] = await Promise.all([
      fetch('/api/combos'),
      fetch('/api/providers'),
    ])
    setCombos(await combosRes.json())
    const providers = await providersRes.json()
    const opts: ModelOption[] = []
    for (const p of providers) {
      if (!p.isLlm) continue
      for (const m of p.models ?? []) opts.push({ value: `${p.slug}/${m}`, label: `${p.slug}/${m}` })
    }
    setModelOptions(opts)
  }

  useEffect(() => {
    load()
  }, [])

  function remove(name: string) {
    if (!confirm(`Delete combo "${name}"?`)) return
    startTransition(async () => {
      await fetch(`/api/combos/${name}`, { method: 'DELETE' })
      load()
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Combos AI</h1>
          <p className="mt-1 text-sm text-text-secondary">Group AI models under one name with a fallback strategy.</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Create Combo</Button>
      </div>

      <div className="space-y-2.5">
        {combos.length === 0 && (
          <div className="glass-card px-5 py-10 text-center text-sm text-text-muted">
            No combos yet — create one to route across multiple AI models.
          </div>
        )}
        {combos.map((c) => (
          <div key={c.name} className="glass-card flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="font-mono font-medium">{c.name}</p>
              <p className="truncate font-mono text-xs text-text-muted">{c.models.join(' · ')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-xs">{c.strategy}</span>
              <Button variant="ghost" onClick={() => setEditing(c)} className="px-3 py-1.5 text-xs">Edit</Button>
              <Button variant="danger" onClick={() => remove(c.name)} className="px-3 py-1.5 text-xs">Delete</Button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ComboEditor
          existing={editing}
          modelOptions={modelOptions}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Ensure /api/providers returns isLlm and models**

In `src/app/api/providers/route.ts` GET, the spread `...provider` already includes `isLlm` and `models` from Task 2's `Provider` type. Confirm the mapped object keeps them (it uses `{ ...provider, credentialCounts }`, so they pass through). No change needed unless the object was reshaped — verify by reading the file.

- [ ] **Step 4: Verify build**

Run: `ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: build succeeds; `/combos` in route list.

- [ ] **Step 5: Manual check**

Dev server → `/combos` → Create Combo → name `combo1`, strategy Fallback, pick 2 LLM models → Create. Row appears. Edit → change strategy. Delete.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(dashboard)/combos"
git commit -m "feat: Combos AI page + editor (LLM-only model picker, strategy select)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Full verification + README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full test suite**

Run: `rm -rf data && npm test`
Expected: all tests pass (existing + new repos/orchestrators).

- [ ] **Step 2: Production build**

Run: `rm -rf data && ROUTER_SECRET_KEY=$(openssl rand -hex 32) JWT_SECRET=x npm run build`
Expected: clean build; route list includes `/endpoint`, `/combos`, `/api/apikeys`, `/api/combos`, `/proxy/combo/[name]/[[...path]]`.

- [ ] **Step 3: Update README**

Add a "Consumer API keys" section (how to create, how `require_api_key` gates the proxy, bot sends `Authorization: Bearer zr_…`) and a "Combos AI" section (LLM-only, `POST /proxy/combo/<name>/v1/chat/completions`, strategies; note fusion/capacity currently behave as fallback).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document consumer API keys and Combos AI

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Post-Plan Manual Verification (End-to-End)

Once all tasks are done, run the production server locally and drive it with Playwright/browser:

1. Nav shows 5 items; each routes correctly.
2. `/endpoint`: create key → plaintext shown once; toggle require-key ON; `curl` proxy without key → 401; with `Authorization: Bearer <key>` → passes gate.
3. `/` providers grouped under RPC/Data/Swap/AI-LLM headings.
4. Provider detail: sticky-N persists; LLM provider shows Available Models.
5. `/combos`: create a fallback combo of 2 LLM models; `curl -X POST /proxy/combo/<name>/v1/chat/completions -d '{"model":"<name>","messages":[]}'` rewrites model to the first member and (with fake keys) returns the upstream's real error after trying members in order.
6. Both light and dark themes render all new pages cleanly, desktop + mobile.
