import { notFound } from 'next/navigation'
import { getProviderBySlug } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { CredentialForm } from './credential-form'
import { CredentialRow } from './credential-row'

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{provider.name}</h1>
      <p className="text-sm text-gray-500">
        inject: {provider.defaultInjectLocation}
        {provider.defaultInjectKeyName ? ` (${provider.defaultInjectKeyName})` : ''} · base URL:{' '}
        {provider.defaultBaseUrl ?? 'per-credential (set base URL override on each credential)'}
      </p>
      <div className="space-y-2">
        {credentials.map((cred) => (
          <CredentialRow key={cred.id} credential={cred} />
        ))}
        {credentials.length === 0 && <p className="text-gray-500">No credentials yet.</p>}
      </div>
      <CredentialForm providerId={provider.id} />
    </div>
  )
}
