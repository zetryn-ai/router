export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { runBootstrap } = await import('@/lib/bootstrap')
    runBootstrap()
  }
}
