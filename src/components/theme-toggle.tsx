'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { motion } from 'framer-motion'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-9 w-16 rounded-full border border-border-default bg-bg-surface" />
  }

  const isDark = theme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label="Toggle theme"
      className="relative flex h-9 w-16 items-center rounded-full border border-border-default bg-bg-surface px-1 transition-colors hover:border-border-glow"
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-hero text-xs shadow-glow-primary"
        style={{ marginLeft: isDark ? 'auto' : 0 }}
      >
        {isDark ? '🌙' : '☀️'}
      </motion.span>
    </button>
  )
}
