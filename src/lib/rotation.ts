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
      url.searchParams.set(injectKeyName, credential.secretValue)
    } else if (injectLocation === 'header') {
      headers[injectKeyName] = credential.secretValue
    }
    // 'path' location: the secret is expected to already be part of baseUrl (credential.baseUrlOverride)
  }

  return { url: url.toString(), headers }
}
