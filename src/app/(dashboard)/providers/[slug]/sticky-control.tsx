'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function StickyControl({ slug, current }: { slug: string; current: number }) {
  const [value, setValue] = useState(String(current))
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function save(n: number) {
    if (!Number.isFinite(n) || n < 1) return
    startTransition(async () => {
      await fetch(`/api/providers/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stickyLimit: n }),
      })
      router.refresh()
    })
  }

  return (
    <div className="glass-card flex items-center justify-between p-5">
      <div>
        <h3 className="font-semibold">Sticky</h3>
        <p className="text-xs text-text-muted">Reuse the same key for N requests before rotating (round-robin only).</p>
      </div>
      <input
        type="number"
        min={1}
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => save(Number(e.target.value))}
        className="w-20 rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1.5 text-right font-mono text-sm outline-none focus:border-border-glow"
      />
    </div>
  )
}
