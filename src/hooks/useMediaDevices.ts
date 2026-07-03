/**
 * useMediaDevices
 *
 * Enumerates the machine's real cameras and microphones via the WebRTC
 * `navigator.mediaDevices.enumerateDevices()` API, plus the real physical
 * displays via the Rust `list_monitors` command.
 *
 * Device labels are only exposed by the browser/webview once the user has
 * granted camera/microphone permission at least once, so `requestPermission()`
 * triggers a one-shot getUserMedia to unlock the labels, then re-enumerates.
 */

import { useCallback, useEffect, useState } from "react"
import type { MediaInputDevice, MonitorInfo } from "@/types"
import { listMonitors } from "@/hooks/useBloomBackend"

interface MediaDevicesState {
  cameras: MediaInputDevice[]
  microphones: MediaInputDevice[]
  monitors: MonitorInfo[]
  /** True once at least one device exposes a real label (permission granted). */
  hasLabels: boolean
  loading: boolean
  error: string | null
}

function fallbackLabel(kind: MediaDeviceKind, index: number): string {
  if (kind === "videoinput") return `Camera ${index + 1}`
  if (kind === "audioinput") return `Microphone ${index + 1}`
  return `Device ${index + 1}`
}

export function useMediaDevices() {
  const [state, setState] = useState<MediaDevicesState>({
    cameras: [],
    microphones: [],
    monitors: [],
    hasLabels: false,
    loading: true,
    error: null,
  })

  const enumerate = useCallback(async () => {
    try {
      const [devices, monitors] = await Promise.all([
        navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([]),
        listMonitors().catch(() => [] as MonitorInfo[]),
      ])

      let camIdx = 0
      let micIdx = 0
      const cameras: MediaInputDevice[] = []
      const microphones: MediaInputDevice[] = []
      let hasLabels = false

      for (const d of devices) {
        if (d.label) hasLabels = true
        if (d.kind === "videoinput") {
          cameras.push({
            deviceId: d.deviceId,
            label: d.label || fallbackLabel("videoinput", camIdx++),
            kind: "videoinput",
          })
        } else if (d.kind === "audioinput") {
          microphones.push({
            deviceId: d.deviceId,
            label: d.label || fallbackLabel("audioinput", micIdx++),
            kind: "audioinput",
          })
        }
      }

      setState({ cameras, microphones, monitors, hasLabels, loading: false, error: null })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e) }))
    }
  }, [])

  /** Prompt for camera + mic access so device labels become available. */
  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch {
      // Even a partial/denied grant may unlock some labels — re-enumerate anyway.
    }
    await enumerate()
  }, [enumerate])

  useEffect(() => {
    enumerate()
    const handler = () => enumerate()
    navigator.mediaDevices?.addEventListener?.("devicechange", handler)
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler)
  }, [enumerate])

  return { ...state, refresh: enumerate, requestPermission }
}
