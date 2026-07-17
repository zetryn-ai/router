'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'

type Strategy = 'round_robin' | 'lru' | 'priority'

const OPTIONS: { value: Strategy; label: string; desc: string }[] = [
  { value: 'round_robin', label: 'Round-robin', desc: 'Cycle through keys evenly, one after another.' },
  { value: 'lru', label: 'Least recently used', desc: 'Always pick the key idle the longest — spreads load.' },
  { value: 'priority', label: 'Priority', desc: 'Try lowest priority number first (premium before free).' },
]

export function RotationStrategyControl({
  slug,
  current,
}: {
  slug: string
  current: Strategy
}) {
  const [strategy, setStrategy] = useState<Strategy>(current)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function change(next: Strategy) {
    setStrategy(next)
    startTransition(async () => {
      await fetch(`/api/providers/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotationStrategy: next }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      router.refresh()
    })
  }

  return (
    <div className="glass-card space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">
            ⇄
          </span>
          <h3 className="font-semibold">Rotation strategy</h3>
        </div>
        <AnimatePresence>
          {saved && (
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
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const active = strategy === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              disabled={isPending}
              onClick={() => change(opt.value)}
              className={`rounded-xl border p-3 text-left transition-all disabled:opacity-60 ${
                active
                  ? 'border-border-glow bg-gradient-card shadow-glow-primary'
                  : 'border-border-default hover:border-border-glow'
              }`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="mt-1 text-xs text-text-muted">{opt.desc}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
