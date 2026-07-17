'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TextInput, FieldLabel, Button } from '@/components/ui'

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
  const [passwordOk, setPasswordOk] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  function submitPasswordChange(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', currentPassword, newPassword }),
      })
      const body = await res.json()
      setPasswordOk(res.ok)
      setPasswordMessage(res.ok ? 'Password updated successfully' : JSON.stringify(body.error))
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
      setSavedSlug(providerSlug)
      setTimeout(() => setSavedSlug((s) => (s === providerSlug ? null : s)), 1500)
    })
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submitPasswordChange} className="glass-card space-y-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">
            🔒
          </span>
          <h2 className="font-semibold">Change password</h2>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Current password</FieldLabel>
          <TextInput
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel>New password</FieldLabel>
          <TextInput
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            required
            minLength={8}
          />
        </div>

        <AnimatePresence>
          {passwordMessage && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`text-sm ${passwordOk ? 'text-success' : 'text-danger'}`}
            >
              {passwordMessage}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" disabled={isPending}>
          Update password
        </Button>
      </form>

      <div className="glass-card space-y-4 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">
            ⏱
          </span>
          <h2 className="font-semibold">Cooldown defaults</h2>
        </div>
        <p className="-mt-2 text-xs text-text-muted">
          Seconds a credential rests after hitting a rate limit before it becomes active again.
        </p>

        <div className="space-y-2.5">
          {providers.map((p) => (
            <div
              key={p.slug}
              className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-elevated/60 px-3.5 py-2.5"
            >
              <span className="text-sm font-medium">{p.name}</span>
              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {savedSlug === p.slug && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="text-xs text-success"
                    >
                      saved ✓
                    </motion.span>
                  )}
                </AnimatePresence>
                <input
                  type="number"
                  defaultValue={cooldownDefaults[p.slug] ?? 60}
                  min={1}
                  className="w-20 rounded-lg border border-border-default bg-bg-surface px-2.5 py-1.5 text-right font-mono text-sm outline-none focus:border-border-glow"
                  onBlur={(e) => submitCooldownChange(p.slug, Number(e.target.value))}
                />
                <span className="text-xs text-text-muted">sec</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
