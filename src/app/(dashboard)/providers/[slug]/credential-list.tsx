'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { CredentialRow } from './credential-row'
import type { CredentialStatus } from '@/components/status-badge'

type CredentialView = {
  id: number
  label: string
  status: CredentialStatus
  cooldownUntil: string | null
  lastError: string | null
  baseUrlOverride: string | null
  priority: number
}

export function CredentialList({
  credentials,
  showPriority,
}: {
  credentials: CredentialView[]
  showPriority: boolean
}) {
  if (credentials.length === 0) {
    return (
      <div className="glass-card px-5 py-10 text-center text-sm text-text-muted">
        No credentials yet — add one below to start rotating keys for this provider.
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <AnimatePresence initial={false}>
        {credentials.map((cred, index) => (
          <motion.div
            key={cred.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
          >
            <CredentialRow credential={cred} showPriority={showPriority} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
