import { getProviderBySlug } from './providers.repo'
import { pickNextCredential, resolveTarget } from './rotation'
import { markCooldown, markError, touchLastUsed, listCredentialsByProvider } from './credentials.repo'
import { logRequest } from './logs.repo'
import { getSetting } from './settings.repo'

const DEFAULT_COOLDOWN_SECONDS = 60

function cooldownSecondsFor(providerSlug: string): number {
  const configured = getSetting(`cooldown_seconds_default:${providerSlug}`)
  const parsed = configured ? Number(configured) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOLDOWN_SECONDS
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
  body?: unknown
  headers?: Record<string, string>
  stream?: ReadableStream<Uint8Array> | null
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
    const credential = pickNextCredential(provider)
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
    } catch {
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
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      // strip hop-by-hop / encoding headers — the body stream is already decoded
      if (!['transfer-encoding', 'content-encoding', 'content-length', 'connection'].includes(key)) {
        responseHeaders[key] = value
      }
    })
    return { status: response.status, headers: responseHeaders, stream: response.body }
  }

  return {
    status: 502,
    body: { error: 'all credentials exhausted', provider: provider.slug, triedCredentials: attempts },
  }
}
