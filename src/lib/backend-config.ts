/**
 * Contract every backend's `@backend/config` must satisfy. Values that end up in
 * localStorage, exported files or DOM events stay per-backend so existing users
 * keep their saved locale and settings backups.
 */
export interface BackendConfig {
  version: string
  githubUrl: string
  name: string
  backendName: string
  storageKeys: {
    locale: string
  }
  events: {
    addTorrent: string
    authLogout: string
  }
  settingsBackup: {
    format: string
    key: string
  }
}
