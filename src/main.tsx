import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"

const root = document.getElementById("root") as HTMLElement

if (window.location.hash === "#annotate") {
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  document.body.style.setProperty("--background", "transparent")
  document.body.style.pointerEvents = "auto"

  import("./pages/AnnotationPage").then(({ AnnotationPage }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <AnnotationPage />
      </React.StrictMode>
    )
  })
} else if (window.location.hash === "#monitor-highlight") {
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  document.body.style.setProperty("--background", "transparent")

  import("./pages/MonitorHighlightPage").then(({ MonitorHighlightPage }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <MonitorHighlightPage />
      </React.StrictMode>
    )
  })
} else if (window.location.hash === "#recording-hud") {
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  document.body.style.setProperty("--background", "transparent")

  import("./pages/RecordingHudPage").then(({ RecordingHudPage }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <RecordingHudPage />
      </React.StrictMode>
    )
  })
} else if (window.location.hash === "#cursor-overlay") {
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  document.body.style.setProperty("--background", "transparent")
  document.body.style.pointerEvents = "none"

  import("./pages/CursorOverlayPage").then(({ CursorOverlayPage }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <CursorOverlayPage />
      </React.StrictMode>
    )
  })
} else {
  import("./App").then(({ default: App }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
}
