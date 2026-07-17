import Link from 'next/link'
import { listLogs } from '@/lib/logs.repo'
import { listProviders } from '@/lib/providers.repo'

export const dynamic = 'force-dynamic'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ providerSlug?: string }>
}) {
  const { providerSlug } = await searchParams
  const logs = listLogs({ providerSlug, limit: 100 })
  const providers = listProviders()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Request Logs</h1>
      <div className="flex gap-3 text-sm">
        <Link href="/logs" className={!providerSlug ? 'text-white' : 'text-gray-500'}>
          all
        </Link>
        {providers.map((p) => (
          <Link
            key={p.slug}
            href={`/logs?providerSlug=${p.slug}`}
            className={providerSlug === p.slug ? 'text-white' : 'text-gray-500'}
          >
            {p.slug}
          </Link>
        ))}
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-gray-500">
          <tr>
            <th className="py-2">Time (UTC)</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-t border-gray-800">
              <td className="py-2">{log.createdAt}</td>
              <td>{log.providerSlug}</td>
              <td className={log.statusCode && log.statusCode < 400 ? 'text-green-400' : 'text-red-400'}>
                {log.statusCode ?? 'network error'}
              </td>
              <td>{log.durationMs}ms</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-gray-500">
                No requests logged yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
