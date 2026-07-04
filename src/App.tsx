import { useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SettingsProvider } from "@/hooks/useSettings"
import { TitleBar } from "@/components/layout/TitleBar"
import { NavBar, type AppView } from "@/components/layout/NavBar"
import { RecordPage } from "@/pages/RecordPage"
import { LibraryPage } from "@/pages/LibraryPage"
import { SettingsPage } from "@/pages/SettingsPage"

function App() {
  const [recording, setRecording] = useState(false)
  const [view, setView] = useState<AppView>("record")

  return (
    <SettingsProvider>
      <TooltipProvider delayDuration={200}>
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
          <TitleBar recording={recording} />
          <NavBar view={view} onChange={setView} locked={recording} />
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className={view === "record" ? "h-full" : "hidden"}>
              <RecordPage onRecordingChange={setRecording} />
            </div>
            {view === "library" && (
              <LibraryPage onStartRecording={() => setView("record")} />
            )}
            {view === "settings" && <SettingsPage />}
          </div>
        </div>
      </TooltipProvider>
    </SettingsProvider>
  )
}

export default App
