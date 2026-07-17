'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function AddProviderForm() {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [injectLocation, setInjectLocation] = useState<'query' | 'header' | 'path'>('header')
  const [injectKeyName, setInjectKeyName] = useState('')
  const [defaultBaseUrl, setDefaultBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          defaultInjectLocation: injectLocation,
          defaultInjectKeyName: injectKeyName || null,
          defaultBaseUrl: defaultBaseUrl || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      setError(null)
      setSlug('')
      setName('')
      setInjectKeyName('')
      setDefaultBaseUrl('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-3 rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">Add custom provider</h3>
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug (lowercase-with-dashes)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display name"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
        required
      />
      <select
        value={injectLocation}
        onChange={(e) => setInjectLocation(e.target.value as 'query' | 'header' | 'path')}
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      >
        <option value="header">Header</option>
        <option value="query">Query param</option>
        <option value="path">Path (key baked into base URL per credential)</option>
      </select>
      <input
        value={injectKeyName}
        onChange={(e) => setInjectKeyName(e.target.value)}
        placeholder="Inject key name (e.g. X-API-KEY) — leave blank for path-based"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      <input
        value={defaultBaseUrl}
        onChange={(e) => setDefaultBaseUrl(e.target.value)}
        placeholder="Default base URL (optional if set per-credential)"
        className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={isPending} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">
        {isPending ? 'Adding...' : 'Add provider'}
      </button>
    </form>
  )
}
