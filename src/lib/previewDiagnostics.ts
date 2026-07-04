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

const READY_STATE = [
  "HAVE_NOTHING",
  "HAVE_METADATA",
  "HAVE_CURRENT_DATA",
  "HAVE_FUTURE_DATA",
  "HAVE_ENOUGH_DATA",
]

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
      steps: ["Klikni Record a vyber monitor v macOS okne."],
      recordingMayWork: false,
    }
  }

  if (!expectsPreviewStream(source, status)) return null

  if (!details.hasStream || details.videoTracks === 0) {
    if (source === "camera" || (source === "both" && status === "idle")) {
      return {
        kind: "camera_missing",
        title: "Kamera nie je dostupná",
        body: "Preview nemá prístup ku kamere.",
        steps: [
          "Povoľ prístup ku kamere v Systémové nastavenia → Súkromie → Kamera.",
          "Skontroluj, či nie je kamera používaná inou aplikáciou.",
          "Klikni Allow camera & microphone v Record stránke.",
        ],
        recordingMayWork: false,
      }
    }
    return {
      kind: "no_stream",
      title: "Video stream chýba",
      body: "Capture sa spustil, ale preview nedostalo žiadny video track.",
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
    return {
      kind: "play_blocked",
      title: "Video sa nepodarilo prehrať",
      body: details.playError,
      steps: ["Reštartuj Bloom a skús znova."],
      recordingMayWork: true,
    }
  }

  const noElementFrames = details.videoElementSize === "0×0" || details.videoElementSize.startsWith("0×")
  if (noElementFrames && details.hasStream && details.videoTracks > 0 && details.trackState !== "ended") {
    const screenLike = source === "screen" || source === "both"
    return {
      kind: "no_frames",
      title: "Preview je čierne",
      body: screenLike
        ? "Stream beží, ale prehliadač nezobrazuje snímky. Na macOS sa to stáva, keď nahrávaš monitor, na ktorom beží Bloom."
        : "Stream beží, ale prehliadač nezobrazuje snímky z kamery.",
      steps: screenLike
        ? [
            "V macOS pickeri vyber iný monitor (nie ten, kde je Bloom).",
            "Zapni Minimize on record v Nastaveniach — Bloom sa skryje pred nahrávaním.",
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
    readyState: video ? READY_STATE[video.readyState] ?? String(video.readyState) : "—",
    playError,
    streamId: stream?.id?.slice(0, 8) ?? "—",
  }
}
