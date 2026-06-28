import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"

const root = document.getElementById("root") as HTMLElement

if (window.location.hash === "#annotate") {
  // Transparent fullscreen annotation overlay window
  document.documentElement.style.background  = "transparent"
  document.body.style.background = "transparent"
  document.body.style.setProperty("--background", "transparent")

  import("./pages/AnnotationPage").then(({ AnnotationPage }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <AnnotationPage />
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
