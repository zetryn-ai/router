import Link from 'next/link'
import { listProviders } from '@/lib/providers.repo'
import { listCredentialsByProvider } from '@/lib/credentials.repo'

export const dynamic = 'force-dynamic'

export default function ProvidersOverviewPage() {
  const providers = listProviders()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Providers</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => {
          const creds = listCredentialsByProvider(provider.id)
          const active = creds.filter((c) => c.status === 'active').length
          const cooldown = creds.filter((c) => c.status === 'cooldown').length
          const error = creds.filter((c) => c.status === 'error').length
          return (
            <Link
              key={provider.id}
              href={`/providers/${provider.slug}`}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-600"
            >
              <h2 className="font-semibold">{provider.name}</h2>
              <p className="mt-2 text-sm text-gray-400">
                {active} active · {cooldown} cooldown · {error} error
              </p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
