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
  try {
    const provider = createProvider(parsed.data)
    return Response.json(provider, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to create provider'
    const isDuplicate = message.includes('UNIQUE constraint failed')
    return Response.json(
      { error: isDuplicate ? `provider slug "${parsed.data.slug}" already exists` : message },
      { status: isDuplicate ? 409 : 500 }
    )
  }
}
