import { listCredentialsByProvider, reactivateExpiredCooldowns } from './credentials.repo'
import type { Credential } from './credentials.repo'
import type { Provider } from './providers.repo'

const roundRobinPointers = new Map<number, number>()
const stickyCounts = new Map<number, number>()

// Sort key for "least recently used": a credential that has never been used
// (lastUsedAt === null) is the most stale, so it sorts first.
function lastUsedRank(c: Credential): number {
  return c.lastUsedAt ? new Date(c.lastUsedAt + 'Z').getTime() : 0
}

export function pickNextCredential(provider: Provider): Credential | null {
  reactivateExpiredCooldowns(provider.id)
  const all = listCredentialsByProvider(provider.id)
  const active = all.filter((c) => c.status === 'active')
  if (active.length === 0) return null

  switch (provider.rotationStrategy) {
    case 'lru': {
      // Oldest last_used_at first (nulls treated as oldest).
      return [...active].sort((a, b) => lastUsedRank(a) - lastUsedRank(b))[0]
    }
    case 'priority': {
      // Lowest priority number first; ties broken by least-recently-used.
      return [...active].sort(
        (a, b) => a.priority - b.priority || lastUsedRank(a) - lastUsedRank(b)
      )[0]
    }
    case 'round_robin':
    default: {
      const limit = Math.max(1, provider.stickyLimit ?? 1)
      const used = stickyCounts.get(provider.id) ?? 0
      let index = roundRobinPointers.get(provider.id) ?? 0
      if (used >= limit) {
        // sticky window exhausted — advance to the next credential and reset the counter
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
  }
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

  // Render the injected value through the provider template if present, so
  // providers like OpenAI get "Bearer <key>" while others inject the raw key.
  const template = provider.defaultInjectValueTemplate
  const injectValue = template ? template.replace('{key}', credential.secretValue) : credential.secretValue

  const url = new URL(
    incomingPath.replace(/^\/+/, ''),
    baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
  )
  for (const [key, value] of incomingQuery) {
    url.searchParams.set(key, value)
  }

  const headers: Record<string, string> = {}

  if (injectKeyName) {
    if (injectLocation === 'query') {
      url.searchParams.set(injectKeyName, injectValue)
    } else if (injectLocation === 'header') {
      headers[injectKeyName] = injectValue
    }
    // 'path' location: the secret is expected to already be part of baseUrl (credential.baseUrlOverride)
  }

  return { url: url.toString(), headers }
}
