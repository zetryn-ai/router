import { getDb } from './db'
import type { NewProviderInput, RotationStrategy } from './schemas'

export type Provider = {
  id: number
  slug: string
  name: string
  defaultInjectLocation: 'query' | 'header' | 'path'
  defaultInjectKeyName: string | null
  defaultBaseUrl: string | null
  rotationStrategy: RotationStrategy
  defaultInjectValueTemplate: string | null
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
      `INSERT INTO providers (slug, name, default_inject_location, default_inject_key_name, default_base_url, rotation_strategy, default_inject_value_template)
       VALUES (@slug, @name, @defaultInjectLocation, @defaultInjectKeyName, @defaultBaseUrl, @rotationStrategy, @defaultInjectValueTemplate)`
    )
    .run({
      slug: input.slug,
      name: input.name,
      defaultInjectLocation: input.defaultInjectLocation,
      defaultInjectKeyName: input.defaultInjectKeyName ?? null,
      defaultBaseUrl: input.defaultBaseUrl ?? null,
      rotationStrategy: input.rotationStrategy ?? 'round_robin',
      defaultInjectValueTemplate: input.defaultInjectValueTemplate ?? null,
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
  // LLM providers for the OrchestratorAgent — key rotation via the same pool
  // mechanism. Auth goes in the Authorization header as "Bearer <key>", rendered
  // from default_inject_value_template. Default strategy is priority so premium
  // keys can be tried before free-tier ones.
  {
    slug: 'openai',
    name: 'OpenAI',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'Authorization',
    defaultInjectValueTemplate: 'Bearer {key}',
    defaultBaseUrl: 'https://api.openai.com',
    rotationStrategy: 'priority',
  },
  {
    slug: 'anthropic',
    name: 'Anthropic',
    defaultInjectLocation: 'header',
    defaultInjectKeyName: 'x-api-key',
    defaultInjectValueTemplate: null, // Anthropic uses the raw key in x-api-key
    defaultBaseUrl: 'https://api.anthropic.com',
    rotationStrategy: 'priority',
  },
  {
    slug: 'gemini',
    name: 'Google Gemini',
    defaultInjectLocation: 'query',
    defaultInjectKeyName: 'key',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    rotationStrategy: 'priority',
  },
]

export function seedDefaultProviders(): void {
  for (const provider of DEFAULT_PROVIDERS) {
    const existing = getProviderBySlug(provider.slug)
    if (!existing) createProvider(provider)
  }
}
