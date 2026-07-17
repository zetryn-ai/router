import Link from 'next/link'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <nav className="flex gap-6 border-b border-gray-800 px-6 py-4">
        <Link href="/" className="font-semibold">Zetryn Router</Link>
        <Link href="/logs" className="text-gray-400 hover:text-white">Logs</Link>
        <Link href="/settings" className="text-gray-400 hover:text-white">Settings</Link>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
