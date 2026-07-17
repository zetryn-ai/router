'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'

const PROVIDER_ICONS: Record<string, string> = {
  helius: '◆',
  quicknode: '⬢',
  birdeye: '◈',
  dexscreener: '▣',
  jupiter: '✦',
}

export type ProviderCardData = {
  slug: string
  name: string
  active: number
  cooldown: number
  disabled: number
  error: number
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  if (value === 0) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
    >
      {value} {label}
    </span>
  )
}

export function ProviderCard({ provider, index }: { provider: ProviderCardData; index: number }) {
  const total = provider.active + provider.cooldown + provider.disabled + provider.error
  const healthPct = total > 0 ? Math.round((provider.active / total) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
    >
      <Link
        href={`/providers/${provider.slug}`}
        className="group glass-card relative block overflow-hidden p-5 transition-shadow hover:shadow-glow-primary"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-card opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-hero text-lg text-white shadow-sm">
              {PROVIDER_ICONS[provider.slug] ?? '●'}
            </span>
            <div>
              <h2 className="font-semibold text-text-primary">{provider.name}</h2>
              <p className="text-xs text-text-muted">{total} credential{total === 1 ? '' : 's'}</p>
            </div>
          </div>
          <span className="font-mono text-xs text-text-muted transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </div>

        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${healthPct}%` }}
              transition={{ duration: 0.6, delay: 0.1 + index * 0.05, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-hero"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatPill label="active" value={provider.active} tone="var(--success)" />
          <StatPill label="cooldown" value={provider.cooldown} tone="var(--warning)" />
          <StatPill label="error" value={provider.error} tone="var(--danger)" />
          <StatPill label="disabled" value={provider.disabled} tone="var(--text-muted)" />
          {total === 0 && <span className="text-xs text-text-muted">No credentials yet</span>}
        </div>
      </Link>
    </motion.div>
  )
}
