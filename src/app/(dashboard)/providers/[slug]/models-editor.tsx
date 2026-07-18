'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TextInput, Button } from '@/components/ui'

export function ModelsEditor({ slug, models }: { slug: string; models: string[] }) {
  const [newModel, setNewModel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function addModel(e: React.FormEvent) {
    e.preventDefault()
    const model = newModel.trim()
    if (!model) return
    startTransition(async () => {
      const res = await fetch(`/api/providers/${slug}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      setError(null)
      setNewModel('')
      router.refresh()
    })
  }

  function removeModel(model: string) {
    startTransition(async () => {
      await fetch(`/api/providers/${slug}/models`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      router.refresh()
    })
  }

  return (
    <div className="glass-card space-y-3 p-5">
      <h3 className="font-semibold">Available Models</h3>

      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {models.map((m) => (
            <motion.span
              key={m}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-elevated px-2.5 py-1 font-mono text-xs"
            >
              {slug}/{m}
              <button
                type="button"
                onClick={() => removeModel(m)}
                disabled={isPending}
                aria-label={`Remove model ${m}`}
                className="text-text-muted hover:text-danger"
              >
                ×
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        {models.length === 0 && <p className="text-xs text-text-muted">No models added yet.</p>}
      </div>

      <form onSubmit={addModel} className="flex gap-2">
        <TextInput
          value={newModel}
          onChange={(e) => setNewModel(e.target.value)}
          placeholder="e.g. llama-3.3-70b-versatile"
          className="font-mono text-xs"
        />
        <Button type="submit" disabled={isPending || !newModel.trim()} className="shrink-0 whitespace-nowrap">
          Add model
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
