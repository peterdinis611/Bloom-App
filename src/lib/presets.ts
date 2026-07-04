import type { RecordingSource } from "@/types"
import type { PipPosition, PipSize } from "@/lib/capture"

export interface RecordingPreset {
  id: string
  name: string
  description: string
  source: RecordingSource
  quality: "720p" | "1080p"
  countdown: 0 | 3 | 5
  microphone: boolean
  systemAudio: boolean
  cursorHighlight: boolean
  cameraBlur: boolean
  pipSize: PipSize
  pipPosition: PipPosition
}

export const BUILTIN_PRESETS: RecordingPreset[] = [
  {
    id: "demo",
    name: "Demo",
    description: "1080p screen, mic, 3s countdown",
    source: "screen",
    quality: "1080p",
    countdown: 3,
    microphone: true,
    systemAudio: false,
    cursorHighlight: true,
    cameraBlur: false,
    pipSize: "medium",
    pipPosition: "bottom-right",
  },
  {
    id: "meeting",
    name: "Meeting",
    description: "Screen + cam, mic & system audio",
    source: "both",
    quality: "1080p",
    countdown: 0,
    microphone: true,
    systemAudio: true,
    cursorHighlight: false,
    cameraBlur: true,
    pipSize: "small",
    pipPosition: "bottom-right",
  },
  {
    id: "tutorial",
    name: "Tutorial",
    description: "Screen, spotlight clicks, 5s countdown",
    source: "screen",
    quality: "1080p",
    countdown: 5,
    microphone: true,
    systemAudio: false,
    cursorHighlight: true,
    cameraBlur: false,
    pipSize: "medium",
    pipPosition: "bottom-right",
  },
]

export function findPreset(id: string): RecordingPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id)
}
