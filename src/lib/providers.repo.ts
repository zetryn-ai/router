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
  isFree: boolean
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
  is_free: number
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
    isFree: row.is_free === 1,
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

export function getProviderById(id: number): Provider | undefined {
  const row = getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
  return row ? toProvider(row) : undefined
}

export function createProvider(input: NewProviderInput): Provider {
  const result = getDb()
    .prepare(
      `INSERT INTO providers (slug, name, default_inject_location, default_inject_key_name, default_base_url, rotation_strategy, default_inject_value_template, category, sticky_limit, is_llm, models_json, is_free)
       VALUES (@slug, @name, @defaultInjectLocation, @defaultInjectKeyName, @defaultBaseUrl, @rotationStrategy, @defaultInjectValueTemplate, @category, @stickyLimit, @isLlm, @modelsJson, @isFree)`
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
      isFree: input.isFree ? 1 : 0,
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

export function addModel(providerId: number, model: string): void {
  const current = getProviderById(providerId)?.models ?? []
  if (current.includes(model)) return
  const next = [...current, model]
  getDb().prepare('UPDATE providers SET models_json = ? WHERE id = ?').run(JSON.stringify(next), providerId)
}

export function removeModel(providerId: number, model: string): void {
  const current = getProviderById(providerId)?.models ?? []
  const next = current.filter((m) => m !== model)
  getDb().prepare('UPDATE providers SET models_json = ? WHERE id = ?').run(JSON.stringify(next), providerId)
}

// ============================================================================
// Default provider catalog. Data verified from official docs / community
// (awesome-solana, provider pricing pages) — see docs/superpowers/plans notes.
// Conventions:
//   - defaultBaseUrl: null  → endpoint is unique per account (key/token in the
//     path or a per-account host); the operator sets the full URL per credential.
//   - defaultInjectKeyName: null → keyless public endpoint (no key injected).
//   - isFree reflects a genuine free tier (free-forever OR recurring free-tier
//     limits); one-time expiring trial credits do NOT count as free.
//   - 'unverified' fields from research use the most likely value and are noted.
// ============================================================================
const DEFAULT_PROVIDERS: NewProviderInput[] = [
  // ---------------------------------------------------------------- RPC nodes
  { slug: 'helius', name: 'Helius', category: 'rpc', defaultInjectLocation: 'query', defaultInjectKeyName: 'api-key', defaultBaseUrl: 'https://mainnet.helius-rpc.com', isFree: true },
  { slug: 'quicknode', name: 'QuickNode', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: null, isFree: true },
  { slug: 'triton-one', name: 'Triton One', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: null, isFree: false },
  { slug: 'alchemy', name: 'Alchemy', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: 'https://solana-mainnet.g.alchemy.com/v2', isFree: true },
  { slug: 'ankr', name: 'Ankr', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: 'https://rpc.ankr.com/solana', isFree: true },
  { slug: 'chainstack', name: 'Chainstack', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: null, isFree: true },
  { slug: 'getblock', name: 'GetBlock', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: 'https://go.getblock.io', isFree: true },
  { slug: 'syndica', name: 'Syndica', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: 'X-Syndica-Api-Key', defaultBaseUrl: 'https://solana-mainnet.api.syndica.io', isFree: true },
  { slug: 'shyft', name: 'Shyft (RPC)', category: 'rpc', defaultInjectLocation: 'query', defaultInjectKeyName: 'api_key', defaultBaseUrl: 'https://rpc.shyft.to', isFree: true },
  { slug: 'drpc', name: 'dRPC', category: 'rpc', defaultInjectLocation: 'query', defaultInjectKeyName: 'dkey', defaultBaseUrl: 'https://lb.drpc.org', isFree: true },
  { slug: 'blockdaemon', name: 'Blockdaemon', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://svc.blockdaemon.com/solana/mainnet/native', isFree: true },
  { slug: 'extrnode', name: 'extrnode', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: 'https://solana-mainnet.rpc.extrnode.com', isFree: true },
  { slug: 'publicnode', name: 'PublicNode', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://solana-rpc.publicnode.com', isFree: true },
  { slug: 'solana-foundation', name: 'Solana Foundation Public RPC', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://api.mainnet-beta.solana.com', isFree: true },
  { slug: 'instantnodes', name: 'InstantNodes', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: 'https://solana-api.instantnodes.io', isFree: true },
  { slug: 'nownodes', name: 'NOWNodes', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: 'api-key', defaultBaseUrl: 'https://sol.nownodes.io', isFree: true },
  { slug: 'omnia', name: 'OMNIA', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://endpoints.omniatech.io/v1/sol/mainnet/public', isFree: true },
  { slug: 'grove', name: 'Grove (Pocket Network)', category: 'rpc', defaultInjectLocation: 'path', defaultInjectKeyName: null, defaultBaseUrl: null, isFree: true },
  { slug: 'tatum', name: 'Tatum', category: 'rpc', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-api-key', defaultBaseUrl: 'https://solana-mainnet.gateway.tatum.io', isFree: true },

  // --------------------------------------------------------------- Data / market
  { slug: 'birdeye', name: 'Birdeye', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'X-API-KEY', defaultBaseUrl: 'https://public-api.birdeye.so', isFree: true },
  { slug: 'dexscreener', name: 'DexScreener', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://api.dexscreener.com', isFree: true },
  { slug: 'jupiter-price', name: 'Jupiter Price API', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://lite-api.jup.ag', isFree: true },
  { slug: 'coingecko', name: 'CoinGecko', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-cg-demo-api-key', defaultBaseUrl: 'https://api.coingecko.com/api/v3', isFree: true },
  { slug: 'solana-tracker', name: 'Solana Tracker', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-api-key', defaultBaseUrl: 'https://data.solanatracker.io', isFree: true },
  { slug: 'moralis', name: 'Moralis (Solana)', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'X-API-Key', defaultBaseUrl: 'https://solana-gateway.moralis.io', isFree: true },
  { slug: 'shyft-data', name: 'Shyft (Data / DAS)', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-api-key', defaultBaseUrl: 'https://api.shyft.to', isFree: true },
  { slug: 'bitquery', name: 'Bitquery', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://streaming.bitquery.io/graphql', isFree: true },
  { slug: 'solanafm', name: 'SolanaFM', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'ApiKey', defaultBaseUrl: 'https://api.solana.fm', isFree: true },
  { slug: 'pyth', name: 'Pyth (Hermes)', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://hermes.pyth.network', isFree: true },
  { slug: 'codex', name: 'Codex (Defined.fi)', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultBaseUrl: 'https://graph.codex.io/graphql', isFree: true },
  { slug: 'geckoterminal', name: 'GeckoTerminal', category: 'data', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://api.geckoterminal.com/api/v2', isFree: true },

  // ---------------------------------------------------------------------- Swap
  { slug: 'jupiter', name: 'Jupiter (Swap/Quote)', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-api-key', defaultBaseUrl: 'https://lite-api.jup.ag', isFree: true },
  { slug: 'raydium', name: 'Raydium API', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: 'https://api-v3.raydium.io', isFree: true },
  { slug: 'orca', name: 'Orca (Whirlpools)', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: null, defaultBaseUrl: null, isFree: true },
  { slug: 'okx-dex', name: 'OKX DEX Aggregator', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: 'OK-ACCESS-KEY', defaultBaseUrl: 'https://web3.okx.com/api/v6/dex/aggregator', isFree: true },
  { slug: 'oneinch', name: '1inch (Fusion+)', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.1inch.dev/fusion', isFree: true },
  { slug: 'dflow', name: 'DFlow', category: 'swap', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-api-key', defaultBaseUrl: 'https://quote-api.dflow.net', isFree: true },

  // ----------------------------------------------------------- LLM (free tier only)
  // Per requirement: only AI providers with a genuine free tier (free-forever or
  // recurring free-tier limits) are seeded. Pure trial-credit providers (OpenAI,
  // Anthropic, Together, Fireworks, DeepSeek) are intentionally omitted.
  // Auth is Authorization: Bearer <key> unless noted. models feed Combos AI.
  { slug: 'groq', name: 'Groq', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'whisper-large-v3-turbo'] },
  { slug: 'gemini', name: 'Google Gemini', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'x-goog-api-key', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] },
  { slug: 'openrouter', name: 'OpenRouter', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://openrouter.ai/api/v1', models: ['deepseek/deepseek-r1:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free', 'google/gemma-3-12b-it:free'] },
  { slug: 'cerebras', name: 'Cerebras', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.cerebras.ai/v1', models: ['gpt-oss-120b', 'llama-3.3-70b', 'llama3.1-8b', 'qwen-3-32b'] },
  { slug: 'mistral', name: 'Mistral AI', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.mistral.ai/v1', models: ['mistral-small-latest', 'mistral-medium-latest', 'open-mistral-nemo', 'codestral-latest'] },
  { slug: 'cohere', name: 'Cohere', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.cohere.com/compatibility/v1', models: ['command-a-03-2025', 'command-r-plus', 'command-r', 'command-r7b'] },
  { slug: 'huggingface', name: 'Hugging Face', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://router.huggingface.co/v1', models: ['meta-llama/Llama-3.3-70B-Instruct', 'deepseek-ai/DeepSeek-R1', 'Qwen/Qwen2.5-72B-Instruct'] },
  { slug: 'cloudflare-workers-ai', name: 'Cloudflare Workers AI', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: null, models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct', '@cf/qwen/qwen2.5-coder-32b-instruct'] },
  { slug: 'github-models', name: 'GitHub Models', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://models.github.ai/inference', models: ['openai/gpt-4.1', 'openai/o4-mini', 'meta/llama-4-scout', 'deepseek/deepseek-r1'] },
  { slug: 'nvidia-nim', name: 'NVIDIA NIM', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1', models: ['meta/llama-3.3-70b-instruct', 'deepseek-ai/deepseek-r1', 'qwen/qwen2.5-coder-32b-instruct'] },
  { slug: 'sambanova', name: 'SambaNova Cloud', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.sambanova.ai/v1', models: ['Meta-Llama-3.3-70B-Instruct', 'Meta-Llama-3.1-405B-Instruct', 'Qwen2.5-72B-Instruct'] },
  { slug: 'ollama-cloud', name: 'Ollama Cloud', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.ollama.com/v1', models: ['gpt-oss:20b', 'gpt-oss:120b', 'qwen3-coder:cloud', 'deepseek-v3.1:cloud'] },
  { slug: 'xai', name: 'xAI (Grok)', category: 'llm', isLlm: true, isFree: true, rotationStrategy: 'priority', defaultInjectLocation: 'header', defaultInjectKeyName: 'Authorization', defaultInjectValueTemplate: 'Bearer {key}', defaultBaseUrl: 'https://api.x.ai/v1', models: ['grok-4', 'grok-4-fast', 'grok-3', 'grok-3-mini'] },
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
           default_inject_value_template = @defaultInjectValueTemplate,
           is_free = @isFree
       WHERE slug = @slug`
    )
    .run({
      slug: provider.slug,
      category: provider.category ?? 'other',
      isLlm: provider.isLlm ? 1 : 0,
      modelsJson: provider.models ? JSON.stringify(provider.models) : null,
      defaultInjectValueTemplate: provider.defaultInjectValueTemplate ?? null,
      isFree: provider.isFree ? 1 : 0,
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
