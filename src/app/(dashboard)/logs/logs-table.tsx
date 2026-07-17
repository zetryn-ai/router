'use client'

import { motion } from 'framer-motion'

type LogEntry = {
  id: number
  providerSlug: string
  statusCode: number | null
  durationMs: number | null
  createdAt: string
}

function StatusChip({ statusCode }: { statusCode: number | null }) {
  if (statusCode === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger">
        network error
      </span>
    )
  }
  const ok = statusCode < 400
  const tone = ok ? 'var(--success)' : statusCode === 429 ? 'var(--warning)' : 'var(--danger)'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
    >
      {statusCode}
    </span>
  )
}

export function LogsTable({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="glass-card px-5 py-12 text-center text-sm text-text-muted">
        No requests logged yet.
      </div>
    )
  }

  return (
    <div className="glass-card overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border-subtle text-text-muted">
            <th className="px-4 py-3 font-medium">Time (UTC)</th>
            <th className="px-4 py-3 font-medium">Provider</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => (
            <motion.tr
              key={log.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(index * 0.015, 0.3) }}
              className="border-b border-border-subtle last:border-0 hover:bg-bg-elevated/60"
            >
              <td className="px-4 py-2.5 font-mono text-xs text-text-secondary">{log.createdAt}</td>
              <td className="px-4 py-2.5">
                <span className="rounded-md bg-bg-elevated px-2 py-0.5 text-xs font-medium">
                  {log.providerSlug}
                </span>
              </td>
              <td className="px-4 py-2.5">
                <StatusChip statusCode={log.statusCode} />
              </td>
              <td className="px-4 py-2.5 font-mono text-xs text-text-secondary">{log.durationMs}ms</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
