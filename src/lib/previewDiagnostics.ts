import type { RecordingSource, RecordingStatus } from "@/types"

export type PreviewFaultKind =
  | "none"
  | "idle_screen"
  | "camera_missing"
  | "no_stream"
  | "track_ended"
  | "no_frames"
  | "play_blocked"

export interface PreviewFault {
  kind: PreviewFaultKind
  title: string
  body: string
  steps: string[]
  /** Recording may still produce a valid file despite missing preview. */
  recordingMayWork: boolean
}

export interface PreviewTechDetails {
  status: RecordingStatus
  source: RecordingSource
  hasStream: boolean
  videoTracks: number
  trackLabel: string
  trackState: string
  trackMuted: boolean
  displaySurface: string
  trackSize: string
  videoElementSize: string
  readyState: string
  playError: string
  streamId: string
}

const READY_STATE: Record<string, string> = {
  HAVE_NOTHING: "Žiadne dáta",
  HAVE_METADATA: "Metadáta",
  HAVE_CURRENT_DATA: "Aktuálny snímok",
  HAVE_FUTURE_DATA: "Pripravuje sa",
  HAVE_ENOUGH_DATA: "Pripravené",
}

/** Preloží bežné chyby prehrávania z WebKit do slovenčiny. */
export function localizePlayError(message: string): string {
  const lower = message.trim().toLowerCase()
  if (!lower) return ""

  if (lower.includes("aborted") || lower.includes("interrupted")) {
    return "Prehrávanie bolo prerušené. Náhľad nemusí bežať, ale nahrávanie môže pokračovať."
  }
  if (lower.includes("notallowed") || lower.includes("permission")) {
    return "Prehrávanie nie je povolené. Skontroluj oprávnenia v Systémových nastaveniach."
  }
  if (lower.includes("not supported")) {
    return "Tento formát videa nie je podporovaný v náhľade."
  }
  if (lower.includes("autoplay")) {
    return "Automatické prehrávanie bolo zablokované."
  }
  return "Náhľad sa nepodarilo spustiť. Nahrávanie môže stále fungovať."
}

const READY_STATE_KEYS = [
  "HAVE_NOTHING",
  "HAVE_METADATA",
  "HAVE_CURRENT_DATA",
  "HAVE_FUTURE_DATA",
  "HAVE_ENOUGH_DATA",
] as const

const STATUS_LABELS: Record<RecordingStatus, string> = {
  idle: "Nečinný",
  preparing: "Pripravuje sa",
  countdown: "Odpočítavanie",
  recording: "Nahráva sa",
  paused: "Pozastavené",
  processing: "Spracováva sa",
  done: "Hotovo",
}

const SOURCE_LABELS: Record<RecordingSource, string> = {
  screen: "Obrazovka",
  camera: "Kamera",
  both: "Obrazovka + kamera",
}

export function localizeRecordingStatus(status: RecordingStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function localizeRecordingSource(source: RecordingSource): string {
  return SOURCE_LABELS[source] ?? source
}

export function localizeReadyState(state: string): string {
  return READY_STATE[state] ?? state
}

export function expectsPreviewStream(source: RecordingSource, status: RecordingStatus): boolean {
  if (status === "idle") return source === "camera" || source === "both"
  return status === "preparing" || status === "countdown" || status === "recording" || status === "paused"
}

export function buildPreviewFault(
  source: RecordingSource,
  status: RecordingStatus,
  details: PreviewTechDetails,
): PreviewFault | null {
  if (status === "idle" && source === "screen") {
    return {
      kind: "idle_screen",
      title: "Náhľad sa spustí pri nahrávaní",
      body: "macOS neumožňuje ukázať obrazovku skôr, než potvrdíš zdieľanie v systémovom dialógu.",
      steps: ["Klikni Nahrať a vyber monitor v systémovom okne macOS."],
      recordingMayWork: false,
    }
  }

  if (!expectsPreviewStream(source, status)) return null

  if (!details.hasStream || details.videoTracks === 0) {
    if (source === "camera" || (source === "both" && status === "idle")) {
      return {
        kind: "camera_missing",
        title: "Kamera nie je dostupná",
        body: "Náhľad nemá prístup ku kamere.",
        steps: [
          "Povoľ prístup ku kamere v Systémové nastavenia → Súkromie → Kamera.",
          "Skontroluj, či nie je kamera používaná inou aplikáciou.",
          "Klikni „Povoliť prístup ku kamere a mikrofónu“ na stránke Nahrávanie.",
        ],
        recordingMayWork: false,
      }
    }
    return {
      kind: "no_stream",
      title: "Video stream chýba",
      body: "Zachytenie sa spustilo, ale náhľad nedostal žiadnu video stopu.",
      steps: [
        "Skús nahrávanie znova.",
        "Reštartuj Bloom ak problém pretrváva.",
      ],
      recordingMayWork: false,
    }
  }

  if (details.trackState === "ended") {
    return {
      kind: "track_ended",
      title: "Zdieľanie bolo ukončené",
      body: "Systém ukončil screen capture (Stop sharing alebo prerušenie).",
      steps: ["Spusti nahrávanie znova a neukončuj zdieľanie v macOS paneli."],
      recordingMayWork: false,
    }
  }

  if (details.playError) {
    const transientDuringCapture =
      (status === "recording" || status === "paused")
      && details.hasStream
      && details.videoTracks > 0
      && details.trackState !== "ended"

    if (!transientDuringCapture) {
      return {
        kind: "play_blocked",
        title: "Náhľad sa nepodarilo spustiť",
        body: localizePlayError(details.playError),
        steps: ["Reštartuj Bloom a skús znova."],
        recordingMayWork: false,
      }
    }
  }

  const noElementFrames = details.videoElementSize === "0×0" || details.videoElementSize.startsWith("0×")
  if (noElementFrames && details.hasStream && details.videoTracks > 0 && details.trackState !== "ended") {
    const screenLike = source === "screen" || source === "both"
    return {
      kind: "no_frames",
      title: "Náhľad je čierny",
      body: screenLike
        ? "Stream beží, ale prehliadač nezobrazuje snímky. Na macOS sa to stáva, keď nahrávaš monitor, na ktorom beží Bloom."
        : "Stream beží, ale prehliadač nezobrazuje snímky z kamery.",
      steps: screenLike
        ? [
            "V systémovom výbere vyber iný monitor (nie ten, kde beží Bloom).",
            "Zapni „Skryť okno pri nahrávaní“ v Nastaveniach — Bloom sa skryje pred nahrávaním.",
            "Presuň Bloom na druhý monitor a nahrávaj ten prvý.",
          ]
        : [
            "Skontroluj oprávnenia kamery v Systémové nastavenia.",
            "Odpoj a pripoj kameru, potom reštartuj Bloom.",
          ],
      recordingMayWork: screenLike,
    }
  }

  return null
}

export function collectPreviewTechDetails(
  source: RecordingSource,
  status: RecordingStatus,
  stream: MediaStream | null,
  video: HTMLVideoElement | null,
  playError: string,
): PreviewTechDetails {
  const vt = stream?.getVideoTracks()[0]
  const settings = vt?.getSettings() ?? {}
  const w = video?.videoWidth ?? 0
  const h = video?.videoHeight ?? 0

  return {
    status,
    source,
    hasStream: !!stream,
    videoTracks: stream?.getVideoTracks().length ?? 0,
    trackLabel: vt?.label || "—",
    trackState: vt?.readyState ?? "—",
    trackMuted: vt?.muted ?? false,
    displaySurface: String(settings.displaySurface ?? "—"),
    trackSize: settings.width && settings.height ? `${settings.width}×${settings.height}` : "—",
    videoElementSize: `${w}×${h}`,
    readyState: video
      ? localizeReadyState(READY_STATE_KEYS[video.readyState] ?? String(video.readyState))
      : "—",
    playError,
    streamId: stream?.id?.slice(0, 8) ?? "—",
  }
}
