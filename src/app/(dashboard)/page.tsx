import { listProviders } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'
import { AddProviderForm } from './add-provider-form'
import { ProviderCard } from './provider-card'

export const dynamic = 'force-dynamic'

export default function ProvidersOverviewPage() {
  const providers = listProviders()

  const cards = providers.map((provider) => {
    const creds = listCredentialsByProvider(provider.id)
    return {
      slug: provider.slug,
      name: provider.name,
      active: creds.filter((c) => c.status === 'active').length,
      cooldown: creds.filter((c) => c.status === 'cooldown').length,
      disabled: creds.filter((c) => c.status === 'disabled').length,
      error: creds.filter((c) => c.status === 'error').length,
    }
  })

  const totalActive = cards.reduce((sum, c) => sum + c.active, 0)
  const totalCredentials = cards.reduce((sum, c) => sum + c.active + c.cooldown + c.disabled + c.error, 0)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Providers</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage credential pools and rotation for every upstream provider.
          </p>
        </div>
        <div className="glass-card flex gap-6 px-5 py-3">
          <div>
            <p className="text-xs text-text-muted">Providers</p>
            <p className="font-mono text-lg font-semibold">{providers.length}</p>
          </div>
          <div className="border-l border-border-subtle pl-6">
            <p className="text-xs text-text-muted">Active keys</p>
            <p className="font-mono text-lg font-semibold text-success">{totalActive}</p>
          </div>
          <div className="border-l border-border-subtle pl-6">
            <p className="text-xs text-text-muted">Total keys</p>
            <p className="font-mono text-lg font-semibold">{totalCredentials}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => (
          <ProviderCard key={card.slug} provider={card} index={index} />
        ))}
      </div>

      <AddProviderForm />
    </div>
  )
}
