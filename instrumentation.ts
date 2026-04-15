export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logProductionEnvHints } = await import('./lib/env');
    logProductionEnvHints();
  }
}
