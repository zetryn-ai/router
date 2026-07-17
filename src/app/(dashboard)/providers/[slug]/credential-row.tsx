'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { StatusBadge, type CredentialStatus } from '@/components/status-badge'
import { Button } from '@/components/ui'

type CredentialView = {
  id: number
  label: string
  status: CredentialStatus
  cooldownUntil: string | null
  lastError: string | null
  baseUrlOverride: string | null
  priority: number
}

export function CredentialRow({
  credential,
  showPriority,
}: {
  credential: CredentialView
  showPriority: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function act(action: 'reactivate' | 'disable') {
    startTransition(async () => {
      await fetch(`/api/credentials/${credential.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      router.refresh()
    })
  }

  function remove() {
    if (!confirm(`Delete credential "${credential.label}"? This cannot be undone.`)) return
    startTransition(async () => {
      await fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isPending ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="glass-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={credential.status} />
          <span className="font-medium">{credential.label}</span>
          {showPriority && (
            <span className="rounded-md bg-bg-elevated px-2 py-0.5 font-mono text-xs text-text-muted">
              prio {credential.priority}
            </span>
          )}
        </div>
        {credential.baseUrlOverride && (
          <p className="truncate font-mono text-xs text-text-muted">{credential.baseUrlOverride}</p>
        )}
        {credential.status === 'cooldown' && credential.cooldownUntil && (
          <p className="font-mono text-xs text-warning">cooldown until {credential.cooldownUntil} UTC</p>
        )}
        {credential.lastError && <p className="font-mono text-xs text-danger">{credential.lastError}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="ghost" disabled={isPending} onClick={() => act('reactivate')} className="px-3 py-1.5 text-xs">
          Reactivate
        </Button>
        <Button variant="ghost" disabled={isPending} onClick={() => act('disable')} className="px-3 py-1.5 text-xs">
          Disable
        </Button>
        <Button variant="danger" disabled={isPending} onClick={remove} className="px-3 py-1.5 text-xs">
          Delete
        </Button>
      </div>
    </motion.div>
  )
}
