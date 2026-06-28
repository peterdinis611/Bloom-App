import { useState } from "react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TitleBar } from "@/components/layout/TitleBar"
import { RecordPage } from "@/pages/RecordPage"

function App() {
  const [recording, setRecording] = useState(false)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <TitleBar recording={recording} />
        <div className="flex-1 min-h-0 overflow-hidden">
          <RecordPage onRecordingChange={setRecording} />
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
