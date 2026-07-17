'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function CredentialForm({ providerId }: { providerId: number }) {
  const [label, setLabel] = useState('')
  const [secretValue, setSecretValue] = useState('')
  const [baseUrlOverride, setBaseUrlOverride] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId,
          label,
          secretValue,
          baseUrlOverride: baseUrlOverride || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(JSON.stringify(body.error))
        return
      }
      setError(null)
      setLabel('')
      setSecretValue('')
      setBaseUrlOverride('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">Add credential</h3>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (e.g. acc-1)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={secretValue}
        onChange={(e) => setSecretValue(e.target.value)}
        placeholder="API key / secret"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={baseUrlOverride}
        onChange={(e) => setBaseUrlOverride(e.target.value)}
        placeholder="Base URL override (optional — required for QuickNode/Jupiter-paid)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50"
      >
        {isPending ? 'Adding...' : 'Add credential'}
      </button>
    </form>
  )
}
