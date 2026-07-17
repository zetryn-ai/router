'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { TextInput, Select, FieldLabel, Button } from '@/components/ui'

export function AddProviderForm() {
  const [open, setOpen] = useState(false)
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [injectLocation, setInjectLocation] = useState<'query' | 'header' | 'path'>('header')
  const [injectKeyName, setInjectKeyName] = useState('')
  const [defaultBaseUrl, setDefaultBaseUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          name,
          defaultInjectLocation: injectLocation,
          defaultInjectKeyName: injectKeyName || null,
          defaultBaseUrl: defaultBaseUrl || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(typeof body.error === 'string' ? body.error : JSON.stringify(body.error))
        return
      }
      setError(null)
      setSlug('')
      setName('')
      setInjectKeyName('')
      setDefaultBaseUrl('')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm text-white">
            +
          </span>
          <span className="font-semibold">Add custom provider</span>
        </div>
        <motion.span animate={{ rotate: open ? 45 : 0 }} className="text-xl text-text-muted">
          +
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmit} className="grid gap-3.5 border-t border-border-subtle p-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <FieldLabel>Slug</FieldLabel>
                <TextInput
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="lowercase-with-dashes"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Display name</FieldLabel>
                <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="My Provider" required />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Key injection</FieldLabel>
                <Select
                  value={injectLocation}
                  onChange={(e) => setInjectLocation(e.target.value as 'query' | 'header' | 'path')}
                >
                  <option value="header">Header</option>
                  <option value="query">Query param</option>
                  <option value="path">Path (baked into per-credential base URL)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Inject key name</FieldLabel>
                <TextInput
                  value={injectKeyName}
                  onChange={(e) => setInjectKeyName(e.target.value)}
                  placeholder="e.g. X-API-KEY (blank for path-based)"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <FieldLabel>Default base URL</FieldLabel>
                <TextInput
                  value={defaultBaseUrl}
                  onChange={(e) => setDefaultBaseUrl(e.target.value)}
                  placeholder="Optional if set per-credential"
                />
              </div>

              {error && (
                <p className="text-sm text-danger sm:col-span-2">{error}</p>
              )}

              <div className="sm:col-span-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Adding…' : 'Add provider'}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
