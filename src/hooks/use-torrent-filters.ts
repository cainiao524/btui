"use client"
import { useMemo } from "react"
import { useI18n } from "@/lib/i18n-context"
import { useTorrentOverview } from "@/lib/torrent-overview-context"
import type { Torrent } from "@/lib/rpc-types"
import {
  filterTorrents,
  getAvailableDownloadDirs,
  getAvailableLabels,
  getAvailableTrackers,
} from "@/lib/torrent-list-utils"

export function useTorrentFilters(
  torrents: Torrent[],
  statusFilter: string | undefined,
  searchQuery: string
) {
  const { t } = useI18n()
  const { trackerFilter, dirFilter, labelFilter, toggleFacet, clearFilters } = useTorrentOverview()

  const trackers = useMemo(() => getAvailableTrackers(torrents), [torrents])

  const downloadDirs = useMemo(() => getAvailableDownloadDirs(torrents), [torrents])

  const availableLabels = useMemo(() => getAvailableLabels(torrents), [torrents])

  const filteredTorrents = useMemo(() => filterTorrents(torrents, {
    statusFilter,
    searchQuery,
    trackerFilter,
    dirFilter,
    labelFilter,
    translateStatus: (statusKey) => t(statusKey),
  }), [torrents, statusFilter, trackerFilter, dirFilter, labelFilter, searchQuery, t])

  const toggleTracker = (host: string) => toggleFacet("tracker", host)
  const toggleDir = (path: string) => toggleFacet("dir", path)
  const toggleLabel = (label: string) => toggleFacet("label", label)

  return {
    trackerFilter,
    dirFilter,
    labelFilter,
    toggleTracker,
    toggleDir,
    toggleLabel,
    clearFilters,
    trackers,
    downloadDirs,
    availableLabels,
    filteredTorrents,
  }
}
