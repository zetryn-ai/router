'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TextInput, FieldLabel, Button } from '@/components/ui'

export function CredentialForm({
  providerId,
  showPriority,
  injectLocation,
  hasDefaultBaseUrl,
}: {
  providerId: number
  showPriority: boolean
  injectLocation: 'query' | 'header' | 'path'
  hasDefaultBaseUrl: boolean
}) {
  const [label, setLabel] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [baseUrlOverride, setBaseUrlOverride] = useState('')
  const [priority, setPriority] = useState('100')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // The key is only ever injected into the base URL for path-based providers,
  // or when the provider has no shared default base URL at all (QuickNode,
  // Jupiter-paid, etc). In both cases an empty override silently sends every
  // request to the wrong (or missing) endpoint without the key attached.
  const baseUrlRequired = injectLocation === 'path' || !hasDefaultBaseUrl

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (baseUrlRequired && !baseUrlOverride.trim()) {
      setError('Base URL override is required for this provider — the key is embedded in the URL itself.')
      return
    }
    startTransition(async () => {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          label,
          secretValue,
          baseUrlOverride: baseUrlOverride || null,
          priority: showPriority ? Number(priority) : undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      setError(null)
      setLabel('')
      setSecretValue('')
      setBaseUrlOverride('')
      setPriority('100')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card space-y-4 p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">
          +
        </span>
        <h3 className="font-semibold">Add credential</h3>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel>Label</FieldLabel>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. acc-1" required />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>API key / secret</FieldLabel>
          <TextInput
            type="password"
            value={secretValue}
            onChange={(e) => setSecretValue(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div className={`space-y-1.5 ${showPriority ? '' : 'sm:col-span-2'}`}>
          <FieldLabel>
            Base URL override{baseUrlRequired ? ' (required)' : ''}
          </FieldLabel>
          <TextInput
            value={baseUrlOverride}
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            placeholder={
              baseUrlRequired
                ? 'Required — this provider embeds the key in the URL itself'
                : 'Optional — leave blank to use the provider default'
            }
            required={baseUrlRequired}
          />
          {baseUrlRequired && (
            <p className="text-xs text-warning">
              This provider injects the key as part of the URL path — paste the full endpoint URL including your key.
            </p>
          )}
        </div>
        {showPriority && (
          <div className="space-y-1.5">
            <FieldLabel>Priority (lower = tried first)</FieldLabel>
            <TextInput
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="100"
            />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Adding…' : 'Add credential'}
      </Button>
    </form>
  )
}
