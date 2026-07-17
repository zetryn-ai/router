import { listProviders } from '@/lib/providers.repo'
import { getSetting } from '@/lib/settings.repo'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const providers = listProviders().map((p) => ({ slug: p.slug, name: p.name }))
  const cooldownDefaults: Record<string, number> = {}
  for (const p of providers) {
    const value = getSetting(`cooldown_seconds_default:${p.slug}`)
    if (value) cooldownDefaults[p.slug] = Number(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-text-secondary">Dashboard access and per-provider rotation behavior.</p>
      </div>
      <SettingsForm providers={providers} cooldownDefaults={cooldownDefaults} />
    </div>
  )
}
