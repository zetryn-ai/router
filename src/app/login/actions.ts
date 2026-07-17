'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSetting } from '@/lib/settings.repo'
import { verifyPassword, createSessionToken } from '@/lib/auth'

export async function loginAction(formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get('password') ?? '')
  const storedHash = getSetting('dashboard_password_hash')

  if (!storedHash || !verifyPassword(password, storedHash)) {
    return { error: 'Password salah' }
  }

  const token = await createSessionToken()
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect('/')
}
