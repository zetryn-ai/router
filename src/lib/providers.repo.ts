import { getDb } from './db'
import type { NewProviderInput, RotationStrategy, ProviderCategory } from './schemas'

export type Provider = {
  id: number
  slug: string
  name: string
  defaultInjectLocation: 'query' | 'header' | 'path'
  defaultInjectKeyName: string | null
  defaultBaseUrl: string | null
  rotationStrategy: RotationStrategy
  defaultInjectValueTemplate: string | null
  category: ProviderCategory
  stickyLimit: number
  isLlm: boolean
  models: string[]
  createdAt: string
}

type ProviderRow = {
  id: number
  slug: string
  name: string
  default_inject_location: 'query' | 'header' | 'path'
  default_inject_key_name: string | null
  default_base_url: string | null
  rotation_strategy: RotationStrategy
  default_inject_value_template: string | null
  category: ProviderCategory
  sticky_limit: number
  is_llm: number
  models_json: string | null
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
    rotationStrategy: row.rotation_strategy,
    defaultInjectValueTemplate: row.default_inject_value_template,
    category: row.category,
    stickyLimit: row.sticky_limit,
    isLlm: row.is_llm === 1,
    models: row.models_json ? JSON.parse(row.models_json) : [],
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
    throw new Error(
      `failed to read back created provider ${input.slug} (rowid ${result.lastInsertRowid})`
    )
  }
  return created
}

export function setRotationStrategy(providerId: number, strategy: RotationStrategy): void {
  getDb().prepare('UPDATE providers SET rotation_strategy = ? WHERE id = ?').run(strategy, providerId)
}

export function setStickyLimit(providerId: number, limit: number): void {
  getDb().prepare('UPDATE providers SET sticky_limit = ? WHERE id = ?').run(limit, providerId)
}

const DEFAULT_PROVIDERS: NewProviderInput[] = [
  {
    slug: 'helius',
    name: 'Helius',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'api-key',
    defaultBaseUrl: 'https://mainnet.helius-rpc.com',
    category: 'rpc',
  },
  {
    slug: 'quicknode',
    name: 'QuickNode',
    defaultInjectLocation: 'path',
    defaultInjectKeyName: null,
    defaultBaseUrl: null, // must be set per-credential via base_url_override
    category: 'rpc',
  },
  {
    slug: 'birdeye',
    name: 'Birdeye',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'X-API-KEY',
    defaultBaseUrl: 'https://public-api.birdeye.so',
    category: 'data',
  },
  {
    slug: 'dexscreener',
    name: 'DexScreener',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: null, // no key required for public endpoints
    defaultBaseUrl: 'https://api.dexscreener.com',
    category: 'data',
  },
  {
    slug: 'jupiter',
    name: 'Jupiter',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'x-api-key',
    defaultBaseUrl: null, // must be set per-credential: lite-api.jup.ag vs api.jup.ag
    category: 'swap',
  },
  // LLM providers for the OrchestratorAgent — key rotation via the same pool
  // mechanism. Auth goes in the Authorization header as "Bearer <key>", rendered
  // from default_inject_value_template. Default strategy is priority so premium
  // keys can be tried before free-tier ones. models feed the Combos AI picker.
  {
    slug: 'openai',
    name: 'OpenAI',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'Authorization',
    defaultInjectValueTemplate: 'Bearer {key}',
    defaultBaseUrl: 'https://api.openai.com',
    rotationStrategy: 'priority',
    category: 'llm',
    isLlm: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o1-mini'],
  },
  {
    slug: 'anthropic',
    name: 'Anthropic',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'x-api-key',
    defaultInjectValueTemplate: null, // Anthropic uses the raw key in x-api-key
    defaultBaseUrl: 'https://api.anthropic.com',
    rotationStrategy: 'priority',
    category: 'llm',
    isLlm: true,
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  },
  {
    slug: 'gemini',
    name: 'Google Gemini',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    rotationStrategy: 'priority',
    category: 'llm',
    isLlm: true,
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-flash'],
  },
]

// Backfill the category / is_llm / models / inject-template metadata onto a
// default provider that already exists from an earlier schema. This runs on
// every boot so a DB seeded before migration 003 gets its LLM/category info
// without wiping user-managed fields (credentials, chosen rotation strategy,
// sticky limit are left untouched).
function backfillDefaultMetadata(provider: NewProviderInput): void {
  getDb()
    .prepare(
      `UPDATE providers
       SET category = @category,
           is_llm = @isLlm,
           models_json = @modelsJson,
           default_inject_value_template = @defaultInjectValueTemplate
       WHERE slug = @slug`
    )
    .run({
      slug: provider.slug,
      category: provider.category ?? 'other',
      isLlm: provider.isLlm ? 1 : 0,
      modelsJson: provider.models ? JSON.stringify(provider.models) : null,
      defaultInjectValueTemplate: provider.defaultInjectValueTemplate ?? null,
    })
}

export function seedDefaultProviders(): void {
  for (const provider of DEFAULT_PROVIDERS) {
    const existing = getProviderBySlug(provider.slug)
    if (!existing) {
      createProvider(provider)
    } else {
      backfillDefaultMetadata(provider)
    }
  }
}
