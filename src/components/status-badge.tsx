export type CredentialStatus = 'active' | 'cooldown' | 'disabled' | 'error'

const STATUS_STYLE: Record<CredentialStatus, { bg: string; dot: string; label: string }> = {
  active: { bg: 'color-mix(in srgb, var(--success) 16%, transparent)', dot: 'var(--success)', label: 'Active' },
  cooldown: { bg: 'color-mix(in srgb, var(--warning) 16%, transparent)', dot: 'var(--warning)', label: 'Cooldown' },
  disabled: { bg: 'color-mix(in srgb, var(--text-muted) 16%, transparent)', dot: 'var(--text-muted)', label: 'Disabled' },
  error: { bg: 'color-mix(in srgb, var(--danger) 16%, transparent)', dot: 'var(--danger)', label: 'Error' },
}

export function StatusBadge({ status }: { status: CredentialStatus }) {
  const style = STATUS_STYLE[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.dot }}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: style.dot }}
      />
      {style.label}
    </span>
  )
}
