import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/hooks/useToast"
import { SettingsProvider, useSettings } from "@/hooks/useSettings"
import { I18nProvider } from "@/lib/i18n/I18nProvider"
import { TanStackRoot } from "@/components/TanStackRoot"
import { ExportQueueProvider } from "@/hooks/useExportQueue"
import { TitleBar } from "@/components/layout/TitleBar"
import { Sidebar, type AppView } from "@/components/layout/Sidebar"
import { RecordPage } from "@/pages/RecordPage"
import { LibraryPage } from "@/pages/LibraryPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { DocsPage } from "@/pages/DocsPage"
import { WhatsNewPage } from "@/pages/WhatsNewPage"
import { OnboardingModal } from "@/components/onboarding/OnboardingModal"
import { getBloomDir } from "@/hooks/useBloomBackend"
import { getLastRecordingId } from "@/lib/lastRecording"
import { isOnboardingDone } from "@/lib/onboarding"
import { hasUnreadNews, markNewsSeen } from "@/lib/whatsNew"
import { useToast } from "@/hooks/useToast"
import { getSafeWebviewWindow } from "@/lib/windowControl"
import { useMessages } from "@/lib/i18n/I18nProvider"

function AppShell() {
  const sk = useMessages()
  const { info: toastInfo } = useToast()
  const { settings, ready } = useSettings()
  const [recording, setRecording] = useState(false)
  const [view, setView] = useState<AppView>("record")
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingReady, setOnboardingReady] = useState(false)
  const [onboardingDir, setOnboardingDir] = useState("")
  const [openRecordingId, setOpenRecordingId] = useState<string | null>(null)
  const [editRecordingId, setEditRecordingId] = useState<string | null>(null)
  const [newsBadge, setNewsBadge] = useState(false)

  useEffect(() => {
    isOnboardingDone()
      .then((done) => setShowOnboarding(!done))
      .finally(() => setOnboardingReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    if (settings.general.startMaximized) {
      const win = getSafeWebviewWindow()
      void win?.maximize().catch(() => {})
    }
  }, [ready, settings.general.startMaximized])

  useEffect(() => {
    if (!settings.general.showNewsBadge) {
      setNewsBadge(false)
      return
    }
    void hasUnreadNews().then(setNewsBadge)
  }, [settings.general.showNewsBadge])

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
    listen<string>("open-recording", (ev) => {
      const id = ev.payload
      if (!id) return
      setView("library")
      setOpenRecordingId(id)
    }).then((fn) => unsubs.push(fn))
    listen("open-library", () => {
      setView("library")
    }).then((fn) => unsubs.push(fn))
    return () => unsubs.forEach((fn) => fn())
  }, [toastInfo, sk.toast.noLastRecording])

  const handleViewChange = (next: AppView) => {
    setView(next)
    if (next === "news") {
      setNewsBadge(false)
      void markNewsSeen()
    }
  }

  const handleOpenRecording = (id: string) => {
    setView("library")
    setOpenRecordingId(id)
  }

  const handleEditRecording = (id: string) => {
    setView("library")
    setEditRecordingId(id)
  }

  const handleRecordingSaved = () => {
    if (settings.general.openLibraryAfterRecord) {
      setView("library")
    }
    void import("@/hooks/useBloomBackend").then(({ refreshTray }) => {
      refreshTray().catch(() => {})
    })
  }

  return (
    <>
      <div className="bloom-shell flex h-screen w-screen flex-col overflow-hidden bg-background">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar
            view={view}
            onChange={handleViewChange}
            locked={recording}
            recording={recording}
            newsBadge={newsBadge}
          />
          <main className="mac-main bloom-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className={view === "record" ? "flex h-full min-h-0 flex-1 flex-col" : "hidden"}>
              <RecordPage
                active={view === "record"}
                onRecordingChange={setRecording}
                onOpenRecording={handleOpenRecording}
                onEditRecording={handleEditRecording}
                onRecordingSaved={handleRecordingSaved}
              />
            </div>
            {view === "library" && (
              <LibraryPage
                active
                onStartRecording={() => setView("record")}
                openRecordingId={openRecordingId}
                onOpenRecordingHandled={() => setOpenRecordingId(null)}
                editRecordingId={editRecordingId}
                onEditRecordingHandled={() => setEditRecordingId(null)}
              />
            )}
            {view === "news" && <WhatsNewPage active />}
            {view === "settings" && <SettingsPage active />}
            {view === "docs" && <DocsPage active />}
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
          <I18nProvider>
            <ExportQueueProvider>
              <TooltipProvider delayDuration={300}>
                <AppShell />
              </TooltipProvider>
            </ExportQueueProvider>
          </I18nProvider>
        </SettingsProvider>
      </ToastProvider>
    </TanStackRoot>
  )
}

export default App
