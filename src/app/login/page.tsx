'use client'

import { useState, useTransition } from 'react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <form
        className="w-full max-w-sm space-y-4 rounded-lg bg-gray-900 p-8"
        action={(formData) => {
          startTransition(async () => {
            const result = await loginAction(formData)
            if (result?.error) setError(result.error)
          })
        }}
      >
        <h1 className="text-xl font-semibold text-white">Zetryn Router</h1>
        <input
          type="password"
          name="password"
          placeholder="Password"
          className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-white"
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {isPending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
