/** Open macOS System Settings privacy panes. */

export type PrivacyPane = "screen" | "camera" | "microphone"

const PANE_URL: Record<PrivacyPane, string> = {
  screen: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
}

export async function openPrivacySettings(pane: PrivacyPane): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener")
  await openUrl(PANE_URL[pane])
}
