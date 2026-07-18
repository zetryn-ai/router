'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TextInput, Button } from '@/components/ui'

type ApiKeyView = { id: number; label: string; keyPrefix: string; createdAt: string; lastUsedAt: string | null }

export function ApiKeysPanel({
  initialKeys,
  requireEnabled,
}: {
  initialKeys: ApiKeyView[]
  requireEnabled: boolean
}) {
  const [label, setLabel] = useState('')
  const [justCreated, setJustCreated] = useState<string | null>(null)
  const [require, setRequire] = useState(requireEnabled)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function createKey(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/apikeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      if (res.ok) {
        const body = await res.json()
        setJustCreated(body.plaintext)
        setLabel('')
        router.refresh()
      }
    })
  }

  function revoke(id: number) {
    if (!confirm('Revoke this API key? Clients using it will be rejected.')) return
    startTransition(async () => {
      await fetch(`/api/apikeys/${id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  function toggleRequire() {
    const next = !require
    setRequire(next)
    startTransition(async () => {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'require_api_key', enabled: next }),
      })
      router.refresh()
    })
  }

  return (
    <div className="glass-card space-y-5 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">🔑</span>
        <h2 className="font-semibold">API Keys</h2>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-bg-elevated/60 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium">Require API key</p>
          <p className="text-xs text-text-muted">Requests without a valid key will be rejected</p>
        </div>
        <button
          onClick={toggleRequire}
          disabled={isPending}
          aria-label="Toggle require API key"
          className={`relative h-6 w-11 rounded-full transition-colors ${require ? 'bg-accent-primary' : 'bg-border-default'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${require ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <AnimatePresence>
        {justCreated && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-border-glow bg-gradient-card p-3"
          >
            <p className="text-xs text-text-secondary">Copy this key now — it will not be shown again:</p>
            <code className="mt-1 block break-all font-mono text-sm text-accent-primary">{justCreated}</code>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={createKey} className="flex gap-2">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Key label (e.g. scanner-bot)" required />
        <Button type="submit" disabled={isPending} className="shrink-0 whitespace-nowrap">Create Key</Button>
      </form>

      <div className="space-y-2">
        {initialKeys.length === 0 && <p className="text-sm text-text-muted">No API keys yet.</p>}
        {initialKeys.map((k) => (
          <div key={k.id} className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5">
            <div>
              <span className="font-medium">{k.label}</span>
              <span className="ml-2 font-mono text-xs text-text-muted">{k.keyPrefix}…</span>
            </div>
            <Button variant="danger" onClick={() => revoke(k.id)} className="px-3 py-1.5 text-xs">Revoke</Button>
          </div>
        ))}
      </div>
    </div>
  )
}
