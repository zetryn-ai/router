'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { ThemeToggle } from '@/components/theme-toggle'

const NAV_ITEMS = [
  { href: '/endpoint', label: 'API Endpoint', icon: '⧉' },
  { href: '/', label: 'Providers', icon: '◈' },
  { href: '/combos', label: 'Combos AI', icon: '❋' },
  { href: '/logs', label: 'Logs', icon: '≡' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLink({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href: string
  label: string
  icon: string
  active: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
        active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      {active && (
        <motion.span
          layoutId="active-nav-pill"
          className="absolute inset-0 rounded-xl bg-gradient-hero shadow-glow-primary"
          style={{ opacity: 0.14 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      <span className="relative w-5 text-center text-base" style={{ color: active ? 'var(--accent-primary)' : undefined }}>
        {icon}
      </span>
      <span className="relative">{label}</span>
    </Link>
  )
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border-subtle bg-bg-surface/60 px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero text-lg font-bold text-white shadow-glow-primary">
            Z
          </span>
          <div className="leading-tight">
            <p className="font-bold tracking-tight">Zetryn</p>
            <p className="text-xs text-text-muted">Router</p>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(pathname, item.href)} />
          ))}
        </nav>

        <div className="mt-auto flex items-center justify-between border-t border-border-subtle pt-4">
          <span className="text-xs text-text-muted">Theme</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* Right column: mobile top bar + main content, stacked vertically */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="glass-nav sticky top-0 z-40 flex items-center justify-between border-b border-border-subtle px-4 py-3 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-hero text-sm font-bold text-white">
              Z
            </span>
            <span className="font-bold">Zetryn Router</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default text-lg"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass-nav sticky top-[57px] z-30 overflow-hidden border-b border-border-subtle lg:hidden"
            >
              <div className="flex flex-col gap-1 p-3">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    active={isActive(pathname, item.href)}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-6xl">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}
