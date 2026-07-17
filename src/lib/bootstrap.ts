import { seedDefaultProviders } from './providers.repo'
import { getSetting, setSetting } from './settings.repo'
import { hashPassword, DEFAULT_PASSWORD } from './auth'
import { pruneLogsOlderThan } from './logs.repo'

const LOG_RETENTION_DAYS = 30

export function runBootstrap(): void {
  seedDefaultProviders()
  if (!getSetting('dashboard_password_hash')) {
    setSetting('dashboard_password_hash', hashPassword(DEFAULT_PASSWORD))
  }
  pruneLogsOlderThan(LOG_RETENTION_DAYS)
}
