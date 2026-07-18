import { NextRequest } from 'next/server'
import { createCredential } from '@/lib/credentials.repo'
import { getProviderById } from '@/lib/providers.repo'
import { NewCredentialSchema } from '@/lib/schemas'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = NewCredentialSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const provider = getProviderById(parsed.data.providerId)
  if (!provider) {
    return Response.json({ error: `unknown providerId ${parsed.data.providerId}` }, { status: 400 })
  }

  // Path-injected providers (and any provider with no shared default base URL,
  // e.g. QuickNode / Jupiter-paid) embed the key in the URL itself. Without an
  // override every request silently hits the wrong or keyless default URL.
  const baseUrlRequired = provider.defaultInjectLocation === 'path' || provider.defaultBaseUrl === null
  if (baseUrlRequired && !parsed.data.baseUrlOverride) {
    return Response.json(
      {
        error: `base URL override is required for provider "${provider.slug}" — it embeds the key directly in the URL`,
      },
      { status: 400 }
    )
  }

  const credential = createCredential(parsed.data)
  return Response.json({ ...credential, secretValue: '••••••••' }, { status: 201 })
}
