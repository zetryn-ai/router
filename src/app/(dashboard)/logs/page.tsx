import Link from 'next/link'
import { listLogs } from '@/lib/logs.repo'
import { listProviders } from '@/lib/providers.repo'
import { LogsTable } from './logs-table'

export const dynamic = 'force-dynamic'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ providerSlug?: string }>
}) {
  const { providerSlug } = await searchParams
  const logs = listLogs({ providerSlug, limit: 100 })
  const providers = listProviders()

  const filters = [{ slug: undefined, label: 'All' }, ...providers.map((p) => ({ slug: p.slug, label: p.slug }))]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Request Logs</h1>
        <p className="mt-1 text-sm text-text-secondary">Latest 100 proxy requests across all providers.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = providerSlug === f.slug
          return (
            <Link
              key={f.label}
              href={f.slug ? `/logs?providerSlug=${f.slug}` : '/logs'}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-gradient-hero text-white shadow-glow-primary'
                  : 'border border-border-default text-text-secondary hover:text-text-primary'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <LogsTable logs={logs} />
    </div>
  )
}
