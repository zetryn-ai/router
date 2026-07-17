'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

type CredentialView = {
  id: number
  label: string
  status: 'active' | 'cooldown' | 'disabled' | 'error'
  cooldownUntil: string | null
  lastError: string | null
  baseUrlOverride: string | null
}

const STATUS_COLORS: Record<CredentialView['status'], string> = {
  active: 'bg-green-600',
  cooldown: 'bg-yellow-600',
  disabled: 'bg-gray-600',
  error: 'bg-red-600',
}

export function CredentialRow({ credential }: { credential: CredentialView }) {
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
    startTransition(async () => {
      await fetch(`/api/credentials/${credential.id}`, { method: 'DELETE' })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-between rounded border border-gray-800 bg-gray-900 p-3">
      <div>
        <span className={`mr-2 rounded px-2 py-0.5 text-xs ${STATUS_COLORS[credential.status]}`}>
          {credential.status}
        </span>
        <span className="font-medium">{credential.label}</span>
        {credential.baseUrlOverride && (
          <p className="text-xs text-gray-500">{credential.baseUrlOverride}</p>
        )}
        {credential.status === 'cooldown' && credential.cooldownUntil && (
          <p className="text-xs text-yellow-400">cooldown until {credential.cooldownUntil} UTC</p>
        )}
        {credential.lastError && (
          <p className="text-xs text-red-400">{credential.lastError}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button disabled={isPending} onClick={() => act('reactivate')} className="text-sm text-blue-400">
          Reactivate
        </button>
        <button disabled={isPending} onClick={() => act('disable')} className="text-sm text-gray-400">
          Disable
        </button>
        <button disabled={isPending} onClick={remove} className="text-sm text-red-400">
          Delete
        </button>
      </div>
    </div>
  )
}
