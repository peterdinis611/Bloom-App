export type RecordingStatus = "idle" | "countdown" | "recording" | "paused" | "processing" | "done"

export type RecordingSource = "screen" | "camera" | "both"

export interface ScreenTarget {
  id: string
  label: string
  type: "screen" | "window"
  /** index 1-based for screens */
  index?: number
  appName?: string
}

export interface RecordingSettings {
  source: RecordingSource
  screenTarget: ScreenTarget
  microphone: boolean
  systemAudio: boolean
  quality: "720p" | "1080p"
  countdown: 0 | 3 | 5
}
