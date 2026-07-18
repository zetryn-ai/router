'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { TextInput, Select, FieldLabel, Button } from '@/components/ui'

type ComboView = { name: string; strategy: string; models: string[] }
type ModelOption = { value: string; label: string }
type MergedOption = ModelOption & { stale: boolean }

const STRATEGIES = [
  { value: 'fallback', label: 'Fallback — try in order' },
  { value: 'round_robin', label: 'Round Robin — spread load' },
  { value: 'fusion', label: 'Fusion — query all, judge picks (degrades to fallback)' },
  { value: 'capacity', label: 'Capacity auto-switch (degrades to fallback)' },
]

export function ComboEditor({
  existing,
  modelOptions,
  onClose,
}: {
  existing: ComboView | null
  modelOptions: ModelOption[]
  onClose: () => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [strategy, setStrategy] = useState(existing?.strategy ?? 'fallback')
  const [models, setModels] = useState<string[]>(existing?.models ?? [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Show every selectable model (LLM providers with an active key), plus any
  // model already saved on this combo whose provider no longer has an active
  // key — flagged "no active key" so the user can still see and remove it.
  const mergedOptions = useMemo<MergedOption[]>(() => {
    const active = modelOptions.map((o) => ({ ...o, stale: false }))
    const activeValues = new Set(active.map((o) => o.value))
    const staleSelected = (existing?.models ?? [])
      .filter((m) => !activeValues.has(m))
      .map((m) => ({ value: m, label: m, stale: true }))
    return [...active, ...staleSelected]
  }, [modelOptions, existing])

  function toggleModel(v: string) {
    setModels((prev) => (prev.includes(v) ? prev.filter((m) => m !== v) : [...prev, v]))
  }

  function submit() {
    startTransition(async () => {
      const isEdit = existing !== null
      const res = await fetch(isEdit ? `/api/combos/${existing!.name}` : '/api/combos', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { strategy, models } : { name, strategy, models }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-overlay p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card w-full max-w-lg space-y-4 p-6"
      >
        <h2 className="text-lg font-semibold">{existing ? 'Edit Combo' : 'Create Combo'}</h2>

        {!existing && (
          <div className="space-y-1.5">
            <FieldLabel>Combo name</FieldLabel>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="combo1" required />
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel>Strategy</FieldLabel>
          <Select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Models (AI providers with an active key)</FieldLabel>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border-default p-2">
            {mergedOptions.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-text-muted">
                No LLM providers with an active credential yet — add a key on the provider page first.
              </p>
            )}
            {mergedOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleModel(opt.value)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left font-mono text-xs transition-colors ${
                  models.includes(opt.value) ? 'bg-gradient-hero text-white' : 'hover:bg-bg-elevated'
                }`}
              >
                <span>
                  {models.includes(opt.value) ? '✓ ' : ''}
                  {opt.label}
                </span>
                {opt.stale && (
                  <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-sans text-warning">
                    no active key
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={isPending || models.length === 0 || (!existing && !name)}>
            {existing ? 'Save' : 'Create'}
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
