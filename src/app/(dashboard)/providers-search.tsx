'use client'

import { useMemo, useState } from 'react'
import { ProviderCard, type ProviderCardData } from './provider-card'

const CATEGORY_LABELS: Record<string, string> = {
  rpc: 'RPC Nodes',
  data: 'Market Data',
  swap: 'Swap',
  llm: 'AI / LLM',
  other: 'Other',
}
const ORDER = ['rpc', 'data', 'swap', 'llm', 'other']

export function ProvidersSearch({ cards }: { cards: ProviderCardData[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return cards
    return cards.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    )
  }, [cards, query])

  const grouped = useMemo(
    () =>
      ORDER.map((cat) => ({ cat, items: filtered.filter((c) => c.category === cat) })).filter(
        (g) => g.items.length > 0
      ),
    [filtered]
  )

  return (
    <div className="space-y-8">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search providers by name or slug..."
          className="w-full rounded-lg border border-border-default bg-bg-elevated py-2.5 pl-10 pr-3.5 text-sm outline-none transition-colors placeholder:text-text-muted focus:border-border-glow"
        />
      </div>

      {grouped.length === 0 && (
        <div className="glass-card px-5 py-10 text-center text-sm text-text-muted">
          No providers match &quot;{query}&quot;.
        </div>
      )}

      {grouped.map((group) => (
        <section key={group.cat} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            {CATEGORY_LABELS[group.cat]}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {group.items.map((card, index) => (
              <ProviderCard key={card.slug} provider={card} index={index} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
