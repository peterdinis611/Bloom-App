import { useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ToastProvider } from "@/hooks/useToast"
import { SettingsProvider } from "@/hooks/useSettings"
import { TanStackRoot } from "@/components/TanStackRoot"
import { TitleBar } from "@/components/layout/TitleBar"
import { Sidebar, type AppView } from "@/components/layout/Sidebar"
import { RecordPage } from "@/pages/RecordPage"
import { LibraryPage } from "@/pages/LibraryPage"
import { SettingsPage } from "@/pages/SettingsPage"

function App() {
  const [recording, setRecording] = useState(false)
  const [view, setView] = useState<AppView>("record")

  return (
    <TanStackRoot>
      <ToastProvider>
      <SettingsProvider>
        <TooltipProvider delayDuration={300}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <TitleBar />
          <div className="flex min-h-0 flex-1">
            <Sidebar
              view={view}
              onChange={setView}
              locked={recording}
              recording={recording}
            />
            <main className="mac-main min-w-0 flex-1 overflow-hidden">
              <div className={view === "record" ? "h-full" : "hidden"}>
                <RecordPage onRecordingChange={setRecording} />
              </div>
              {view === "library" && (
                <LibraryPage onStartRecording={() => setView("record")} />
              )}
              {view === "settings" && <SettingsPage />}
            </main>
          </div>
        </div>
        </TooltipProvider>
      </SettingsProvider>
      </ToastProvider>
    </TanStackRoot>
  )
}

export default App
