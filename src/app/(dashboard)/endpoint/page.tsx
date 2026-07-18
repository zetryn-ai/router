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

        {requireEnabled ? (
          <div className="rounded-lg border border-border-glow bg-gradient-card p-3">
            <p className="text-xs font-medium text-text-primary">
              🔒 Require API key is <span className="text-success">ON</span> — every request must include:
            </p>
            <code className="mt-1.5 block break-all rounded border border-border-default bg-bg-elevated px-2.5 py-1.5 font-mono text-xs">
              Authorization: Bearer zr_...
            </code>
            <p className="mt-1.5 text-xs text-text-muted">
              Requests without a valid key are rejected with <span className="font-mono">401</span>{' '}
              before any provider credential is touched. Create a key below and pass it in your bot&apos;s HTTP
              client headers.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-bg-elevated/60 p-3">
            <p className="text-xs text-text-muted">
              🔓 Require API key is <span className="font-medium text-text-secondary">OFF</span> — the endpoint
              accepts requests without an <span className="font-mono">Authorization</span> header. Turn it on below
              to require every request to send <span className="font-mono">Authorization: Bearer zr_...</span>.
            </p>
          </div>
        )}
      </div>

      <ApiKeysPanel initialKeys={keys} requireEnabled={requireEnabled} />
    </div>
  )
}
