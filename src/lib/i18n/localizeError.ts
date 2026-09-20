import { sk } from "@/lib/i18n/sk"

/** Map backend / DOM error text to a Slovak user-facing message. */
export function localizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "")
  const text = raw.trim()
  if (!text) return sk.errors.unknown

  const lower = text.toLowerCase()

  const rules: Array<{ test: RegExp | string; message: string }> = [
    { test: /ffmpeg not found/i, message: sk.errors.ffmpegMissing },
    { test: /ffprobe not found/i, message: sk.errors.ffmpegMissing },
    { test: /install ffmpeg with homebrew/i, message: sk.errors.ffmpegHintBrew },
    { test: /install ffmpeg with winget/i, message: sk.errors.ffmpegHintWinget },
    { test: /sudo apt install ffmpeg/i, message: sk.errors.ffmpegHintApt },
    { test: /automatic ffmpeg install is not supported/i, message: sk.errors.ffmpegNoAutoInstall },
    { test: /winget is not available/i, message: sk.errors.ffmpegNoWinget },
    { test: /ffmpeg is already installed/i, message: sk.errors.ffmpegAlreadyInstalled },
    { test: /install finished but ffmpeg was not detected/i, message: sk.errors.ffmpegInstallNotDetected },
    { test: /install failed/i, message: sk.errors.ffmpegInstallFailed },
    { test: /recording .+ not found/i, message: sk.errors.recordingNotFound },
    { test: /no session/i, message: sk.errors.sessionMissing },
    { test: /write error|cannot write/i, message: sk.errors.writeFailed },
    { test: /cannot delete/i, message: sk.errors.deleteFailed },
    { test: /cannot create|cannot open/i, message: sk.errors.createFailed },
    { test: /video file is missing|video file does not exist|input video does not exist/i, message: sk.errors.videoMissing },
    { test: /temporary export file missing/i, message: sk.errors.exportTempMissing },
    { test: /could not generate thumbnail/i, message: sk.errors.thumbnailFailed },
    { test: /ffprobe could not read/i, message: sk.errors.probeFailed },
    { test: /faststart remux failed/i, message: sk.errors.remuxFailed },
    { test: /main window not found/i, message: sk.errors.windowMissing },
    { test: /seriali[sz]e error/i, message: sk.errors.serializeFailed },
    { test: /notallowederror|permission|denied/i, message: sk.errors.permissionDenied },
    { test: /notfounderror/i, message: sk.errors.deviceNotFound },
    { test: /aborterror/i, message: sk.errors.cancelled },
  ]

  for (const rule of rules) {
    if (typeof rule.test === "string") {
      if (lower.includes(rule.test.toLowerCase())) return rule.message
    } else if (rule.test.test(text)) {
      return rule.message
    }
  }

  // Already Slovak (backend or UI) — pass through.
  if (/[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(text)) return text

  return sk.errors.generic(text)
}

export function errorDescription(err: unknown): string {
  return localizeError(err)
}
