import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProviderBySlug } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { CredentialForm } from './credential-form'
import { CredentialList } from './credential-list'

export const dynamic = 'force-dynamic'

export default async function ProviderDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const provider = getProviderBySlug(slug)
  if (!provider) notFound()

  // map to a view object WITHOUT secretValue — never serialize secrets to the client
  const credentials = listCredentialsByProvider(provider.id).map((c) => ({
    id: c.id,
    label: c.label,
    status: c.status,
    cooldownUntil: c.cooldownUntil,
    lastError: c.lastError,
    baseUrlOverride: c.baseUrlOverride,
  }))

  const active = credentials.filter((c) => c.status === 'active').length

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-text-muted transition-colors hover:text-text-primary">
          ← Providers
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{provider.name}</h1>
          <p className="mt-1 font-mono text-xs text-text-muted">
            inject: {provider.defaultInjectLocation}
            {provider.defaultInjectKeyName ? ` (${provider.defaultInjectKeyName})` : ''} · base URL:{' '}
            {provider.defaultBaseUrl ?? 'per-credential'}
          </p>
        </div>
        <div className="glass-card px-4 py-2.5">
          <p className="text-xs text-text-muted">Active / Total</p>
          <p className="font-mono text-lg font-semibold">
            <span className="text-success">{active}</span>
            <span className="text-text-muted"> / {credentials.length}</span>
          </p>
        </div>
      </div>

      <CredentialList credentials={credentials} />
      <CredentialForm providerId={provider.id} />
    </div>
  )
}
