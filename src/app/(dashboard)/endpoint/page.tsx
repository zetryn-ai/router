import { listApiKeys } from '@/lib/apikeys.repo'
import { getSetting } from '@/lib/settings.repo'
import { ApiKeysPanel } from './api-keys-panel'

export const dynamic = 'force-dynamic'

export default function EndpointPage() {
  const keys = listApiKeys()
  const requireEnabled = getSetting('require_api_key') === '1'
  const port = process.env.PORT ?? '4790'
  const baseUrl = `http://127.0.0.1:${port}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">API Endpoint</h1>
        <p className="mt-1 text-sm text-text-secondary">Where your bot components send requests.</p>
      </div>

      <div className="glass-card space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">⧉</span>
          <h2 className="font-semibold">Local base URL</h2>
        </div>
        <code className="block rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 font-mono text-sm">
          {baseUrl}/proxy/&lt;provider&gt;/&lt;path&gt;
        </code>
        <p className="text-xs text-text-muted">
          Combos: <span className="font-mono">{baseUrl}/proxy/combo/&lt;name&gt;/&lt;path&gt;</span>. Bound to loopback only.
        </p>
      </div>

      <ApiKeysPanel initialKeys={keys} requireEnabled={requireEnabled} />
    </div>
  )
}
