import { getMessagesSync } from "@/lib/i18n/I18nProvider"
import type { Messages } from "@/lib/i18n/types"

interface BloomErrorPayload {
  code: string
  message: string
}

function tryParseBloomError(text: string): BloomErrorPayload | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{")) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as BloomErrorPayload).code === "string" &&
      typeof (parsed as BloomErrorPayload).message === "string"
    ) {
      return parsed as BloomErrorPayload
    }
  } catch {
    /* plain string */
  }
  return null
}

function messageForCode(code: string, sk: Messages): string | null {
  const map: Record<string, string> = {
    ffmpeg_missing: sk.errors.ffmpegMissing,
    session_missing: sk.errors.sessionMissing,
    write_failed: sk.errors.writeFailed,
    delete_failed: sk.errors.deleteFailed,
    create_failed: sk.errors.createFailed,
    video_missing: sk.errors.videoMissing,
    export_temp_missing: sk.errors.exportTempMissing,
    thumbnail_failed: sk.errors.thumbnailFailed,
    probe_failed: sk.errors.probeFailed,
    remux_failed: sk.errors.remuxFailed,
    window_missing: sk.errors.windowMissing,
    serialize_failed: sk.errors.serializeFailed,
    permission_denied: sk.errors.permissionDenied,
    recording_not_found: sk.errors.recordingNotFound,
    disk_low: sk.errors.diskLow,
    invalid_options: sk.errors.invalidOptions,
    cancelled: sk.errors.cancelled,
    unknown: sk.errors.unknown,
  }
  return map[code] ?? null
}

/** Map backend / DOM error text to a localized user-facing message. */
export function localizeError(err: unknown): string {
  const sk = getMessagesSync()
  const raw = err instanceof Error ? err.message : String(err ?? "")
  const text = raw.trim()
  if (!text) return sk.errors.unknown

  const bloom = tryParseBloomError(text)
  if (bloom) {
    const mapped = messageForCode(bloom.code, sk)
    if (mapped) return mapped
    // Prefer structured message when code is unknown / already localized.
    if (bloom.message.trim()) return bloom.message
  }

  // Bare code string from older call sites.
  const bare = messageForCode(text, sk)
  if (bare) return bare

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
    { test: /recording .+ not found|nahrávka sa nenašla/i, message: sk.errors.recordingNotFound },
    { test: /no session/i, message: sk.errors.sessionMissing },
    { test: /write error|cannot write/i, message: sk.errors.writeFailed },
    { test: /cannot delete/i, message: sk.errors.deleteFailed },
    { test: /cannot create|cannot open/i, message: sk.errors.createFailed },
    { test: /video file is missing|video file does not exist|input video does not exist|video súbor chýba/i, message: sk.errors.videoMissing },
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
