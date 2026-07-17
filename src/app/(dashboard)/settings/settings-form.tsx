'use client'

import { useState, useTransition } from 'react'

type ProviderView = { slug: string; name: string }

export function SettingsForm({
  providers,
  cooldownDefaults,
}: {
  providers: ProviderView[]
  cooldownDefaults: Record<string, number>
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', currentPassword, newPassword }),
      })
      const body = await res.json()
      setPasswordMessage(res.ok ? 'Password updated' : JSON.stringify(body.error))
      if (res.ok) {
        setCurrentPassword('')
        setNewPassword('')
      }
    })
  }

  function submitCooldownChange(providerSlug: string, seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return
    startTransition(async () => {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cooldown', providerSlug, seconds }),
      })
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submitPasswordChange} className="max-w-sm space-y-3">
        <h2 className="font-semibold">Change password</h2>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          required
          minLength={8}
        />
        {passwordMessage && <p className="text-sm text-gray-400">{passwordMessage}</p>}
        <button disabled={isPending} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">
          Update password
        </button>
      </form>

      <div className="max-w-sm space-y-3">
        <h2 className="font-semibold">Cooldown defaults (seconds)</h2>
        {providers.map((p) => (
          <div key={p.slug} className="flex items-center justify-between gap-3">
            <span>{p.name}</span>
            <input
              type="number"
              defaultValue={cooldownDefaults[p.slug] ?? 60}
              min={1}
              className="w-24 rounded border border-gray-700 bg-gray-800 px-2 py-1"
              onBlur={(e) => submitCooldownChange(p.slug, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
