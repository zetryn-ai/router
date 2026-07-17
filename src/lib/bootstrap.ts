import { seedDefaultProviders } from './providers.repo'
import { getSetting, setSetting } from './settings.repo'
import { hashPassword, DEFAULT_PASSWORD } from './auth'

export function runBootstrap(): void {
  seedDefaultProviders()
  if (!getSetting('dashboard_password_hash')) {
    setSetting('dashboard_password_hash', hashPassword(DEFAULT_PASSWORD))
  }
}
