'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loginAction } from './actions'
import { ThemeToggle } from '@/components/theme-toggle'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-base px-4">
      {/* ambient glow backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-glow opacity-70" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-gradient-hero opacity-20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-gradient-hero opacity-20 blur-3xl" />

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <motion.form
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="glass-card relative w-full max-w-sm space-y-5 p-8"
        action={(formData) => {
          startTransition(async () => {
            const result = await loginAction(formData)
            if (result?.error) setError(result.error)
          })
        }}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-hero text-2xl font-bold text-white shadow-glow-primary">
            Z
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Zetryn Router</h1>
            <p className="text-sm text-text-muted">API key &amp; provider rotation gateway</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-medium text-text-secondary">
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            placeholder="••••••••"
            autoFocus
            className="w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-glow"
            required
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-danger"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-gradient-hero px-3.5 py-2.5 text-sm font-semibold text-white shadow-glow-primary transition-opacity disabled:opacity-50"
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </motion.button>
      </motion.form>
    </div>
  )
}
