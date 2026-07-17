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
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsForm providers={providers} cooldownDefaults={cooldownDefaults} />
    </div>
  )
}
