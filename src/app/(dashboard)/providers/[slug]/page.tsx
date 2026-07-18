import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProviderBySlug } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { CredentialForm } from './credential-form'
import { CredentialList } from './credential-list'
import { RotationStrategyControl } from './rotation-strategy-control'
import { StickyControl } from './sticky-control'
import { FreeBadge } from '../../provider-card'

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
    priority: c.priority,
  }))

  const active = credentials.filter((c) => c.status === 'active').length
  const showPriority = provider.rotationStrategy === 'priority'

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-text-muted transition-colors hover:text-text-primary">
          ← Providers
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{provider.name}</h1>
            {provider.isFree && <FreeBadge />}
          </div>
          <p className="mt-1 font-mono text-xs text-text-muted">
            inject: {provider.defaultInjectLocation}
            {provider.defaultInjectKeyName ? ` (${provider.defaultInjectKeyName})` : ''} · base URL:{' '}
            {provider.defaultBaseUrl ?? 'per-credential'}
            {provider.defaultInjectValueTemplate ? ` · value: ${provider.defaultInjectValueTemplate}` : ''}
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

      <RotationStrategyControl slug={provider.slug} current={provider.rotationStrategy} />
      <StickyControl slug={provider.slug} current={provider.stickyLimit} />
      {provider.isLlm && provider.models.length > 0 && (
        <div className="glass-card space-y-3 p-5">
          <h3 className="font-semibold">Available Models</h3>
          <div className="flex flex-wrap gap-2">
            {provider.models.map((m) => (
              <span key={m} className="rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1 font-mono text-xs">
                {provider.slug}/{m}
              </span>
            ))}
          </div>
        </div>
      )}
      <CredentialList credentials={credentials} showPriority={showPriority} />
      <CredentialForm providerId={provider.id} showPriority={showPriority} />
    </div>
  )
}
