'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'
import { ComboEditor } from './combo-editor'

type ComboView = { name: string; strategy: string; models: string[] }
type ModelOption = { value: string; label: string }

export default function CombosPage() {
  const [combos, setCombos] = useState<ComboView[]>([])
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [editing, setEditing] = useState<ComboView | null>(null)
  const [creating, setCreating] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function load() {
    const [combosRes, providersRes] = await Promise.all([fetch('/api/combos'), fetch('/api/providers')])
    setCombos(await combosRes.json())
    const providers = await providersRes.json()
    const opts: ModelOption[] = []
    for (const p of providers) {
      if (!p.isLlm) continue
      for (const m of p.models ?? []) opts.push({ value: `${p.slug}/${m}`, label: `${p.slug}/${m}` })
    }
    setModelOptions(opts)
  }

  useEffect(() => {
    load()
  }, [])

  function remove(name: string) {
    if (!confirm(`Delete combo "${name}"?`)) return
    startTransition(async () => {
      await fetch(`/api/combos/${name}`, { method: 'DELETE' })
      load()
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Combos AI</h1>
          <p className="mt-1 text-sm text-text-secondary">Group AI models under one name with a fallback strategy.</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Create Combo</Button>
      </div>

      <div className="glass-card space-y-1 p-5 text-sm text-text-secondary">
        <p><span className="font-semibold text-text-primary">Fallback</span> — tries models in order (next on failure)</p>
        <p><span className="font-semibold text-text-primary">Round Robin</span> — rotates models across requests to spread load</p>
        <p><span className="font-semibold text-text-primary">Fusion</span> — query all in parallel, a judge synthesizes (currently degrades to fallback)</p>
        <p><span className="font-semibold text-text-primary">Capacity auto-switch</span> — route by media capability (currently degrades to fallback)</p>
      </div>

      <div className="space-y-2.5">
        {combos.length === 0 && (
          <div className="glass-card px-5 py-10 text-center text-sm text-text-muted">
            No combos yet — create one to route across multiple AI models.
          </div>
        )}
        {combos.map((c) => (
          <div key={c.name} className="glass-card flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="font-mono font-medium">{c.name}</p>
              <p className="truncate font-mono text-xs text-text-muted">{c.models.join(' · ')}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-xs">{c.strategy}</span>
              <Button variant="ghost" onClick={() => setEditing(c)} className="px-3 py-1.5 text-xs">Edit</Button>
              <Button variant="danger" onClick={() => remove(c.name)} className="px-3 py-1.5 text-xs">Delete</Button>
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <ComboEditor
          existing={editing}
          modelOptions={modelOptions}
          onClose={() => {
            setCreating(false)
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}
