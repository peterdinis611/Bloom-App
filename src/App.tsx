import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/hooks/useToast"
import { SettingsProvider } from "@/hooks/useSettings"
import { TanStackRoot } from "@/components/TanStackRoot"
import { ExportQueueProvider } from "@/hooks/useExportQueue"
import { TitleBar } from "@/components/layout/TitleBar"
import { Sidebar, type AppView } from "@/components/layout/Sidebar"
import { RecordPage } from "@/pages/RecordPage"
import { LibraryPage } from "@/pages/LibraryPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { OnboardingModal } from "@/components/onboarding/OnboardingModal"
import { getBloomDir } from "@/hooks/useBloomBackend"
import { getLastRecordingId } from "@/lib/lastRecording"
import { isOnboardingDone } from "@/lib/onboarding"
import { useToast } from "@/hooks/useToast"
import { sk } from "@/lib/i18n/sk"

function AppShell() {
  const { info: toastInfo } = useToast()
  const [recording, setRecording] = useState(false)
  const [view, setView] = useState<AppView>("record")
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)
  const [onboardingDir, setOnboardingDir] = useState("")
  const [openRecordingId, setOpenRecordingId] = useState<string | null>(null)

  useEffect(() => {
    isOnboardingDone()
      .then((done) => setShowOnboarding(!done))
      .finally(() => setOnboardingReady(true))
  }, [])

  useEffect(() => {
    if (!showOnboarding) return
    getBloomDir()
      .then(setOnboardingDir)
      .catch(() => setOnboardingDir("~/Movies/Bloom"))
  }, [showOnboarding])

  useEffect(() => {
    const unsubs: Array<() => void> = []
    listen("open-last-recording", () => {
      void getLastRecordingId().then((id) => {
        if (!id) {
          toastInfo({ title: sk.toast.noLastRecording })
          return
        }
        setView("library")
        setOpenRecordingId(id)
      })
    }).then((fn) => unsubs.push(fn))
    return () => unsubs.forEach((fn) => fn())
  }, [toastInfo])

  const handleOpenRecording = (id: string) => {
    setView("library")
    setOpenRecordingId(id)
  }

  return (
    <>
      <div className="bloom-shell flex h-screen w-screen flex-col overflow-hidden bg-background">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar
            view={view}
            onChange={setView}
            locked={recording}
            recording={recording}
          />
          <main className="mac-main bloom-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className={view === "record" ? "flex h-full min-h-0 flex-1 flex-col" : "hidden"}>
              <RecordPage
                active={view === "record"}
                onRecordingChange={setRecording}
                onOpenRecording={handleOpenRecording}
              />
            </div>
            {view === "library" && (
              <LibraryPage
                active
                onStartRecording={() => setView("record")}
                openRecordingId={openRecordingId}
                onOpenRecordingHandled={() => setOpenRecordingId(null)}
              />
            )}
            {view === "settings" && <SettingsPage active />}
          </main>
        </div>
      </div>

      {onboardingReady && showOnboarding && (
        <OnboardingModal
          bloomDir={onboardingDir}
          onDone={() => setShowOnboarding(false)}
        />
      )}
    </>
  )
}

function App() {
  return (
    <TanStackRoot>
      <ToastProvider>
        <SettingsProvider>
          <ExportQueueProvider>
            <TooltipProvider delayDuration={300}>
              <AppShell />
            </TooltipProvider>
          </ExportQueueProvider>
        </SettingsProvider>
      </ToastProvider>
    </TanStackRoot>
  )
}

export default App
