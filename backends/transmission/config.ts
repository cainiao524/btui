import type { BackendConfig } from "@/lib/backend-config"

export const APP_CONFIG = {
  version: "v1.19.0-baka⑨",
  githubUrl: "https://github.com/cainiao524/transmission-next-vibemod",
  name: "Transmission VibeMod",
  backendName: "Transmission",
  storageKeys: {
    locale: "transmission-vibemod-locale",
  },
  events: {
    addTorrent: "transmission:add-torrent",
    authLogout: "transmission-auth-logout",
  },
  settingsBackup: {
    format: "transmission-next-vibemod-settings",
    key: "transmission",
  },
} satisfies BackendConfig
