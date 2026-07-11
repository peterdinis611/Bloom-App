import type { OptimizeSpeed } from "@/lib/i18n/sk"

export type RecordingQuality = "480p" | "720p" | "1080p"

export const RECORDING_QUALITIES: RecordingQuality[] = ["480p", "720p", "1080p"]

export const OPTIMIZE_SPEEDS: OptimizeSpeed[] = ["1", "1.25", "1.5", "2", "3"]

export function speedToNumber(speed: OptimizeSpeed): number {
  return Number(speed)
}
