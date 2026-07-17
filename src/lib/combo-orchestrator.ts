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
  // NOTE: fusion (parallel query + judge synthesis) and capacity (route by
  // media capability) are not yet distinct — they degrade to fallback order
  // for now. The UI still lets users pick them so combos can be upgraded later
  // without a data migration.
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
