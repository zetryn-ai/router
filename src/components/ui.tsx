import type { InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from 'react'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      {...rest}
      className={`w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-glow ${className ?? ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props
  return (
    <select
      {...rest}
      className={`w-full rounded-lg border border-border-default bg-bg-elevated px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-border-glow ${className ?? ''}`}
    />
  )
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-text-secondary">{children}</label>
}

type ButtonVariant = 'primary' | 'ghost' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-hero text-white shadow-glow-primary disabled:shadow-none',
  ghost: 'border border-border-default bg-bg-surface text-text-secondary hover:text-text-primary hover:border-border-glow',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
}

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }
) {
  const { className, variant = 'primary', ...rest } = props
  return (
    <button
      {...rest}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className ?? ''}`}
    />
  )
}
