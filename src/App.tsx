import { useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TitleBar } from "@/components/layout/TitleBar"
import { NavBar, type AppView } from "@/components/layout/NavBar"
import { RecordPage } from "@/pages/RecordPage"
import { LibraryPage } from "@/pages/LibraryPage"

function App() {
  const [recording, setRecording] = useState(false)
  const [view, setView] = useState<AppView>("record")

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <TitleBar recording={recording} />
        <NavBar view={view} onChange={setView} locked={recording} />
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Keep RecordPage mounted so an active recording survives tab switches. */}
          <div className={view === "record" ? "h-full" : "hidden"}>
            <RecordPage onRecordingChange={setRecording} />
          </div>
          {view === "library" && (
            <LibraryPage onStartRecording={() => setView("record")} />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
