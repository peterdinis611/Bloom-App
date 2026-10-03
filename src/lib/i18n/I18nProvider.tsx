import { createContext, useContext, useEffect, type ReactNode } from "react"
import { useSettings } from "@/hooks/useSettings"
import { setLocale as setBackendLocale } from "@/hooks/useBloomBackend"
import { getMessages } from "./catalog"
import type { Messages } from "./types"

const I18nContext = createContext<Messages | null>(null)

/** Mutable sync handle for non-React modules (localizeError, updater, …). */
let syncMessages: Messages = getMessages("sk")

export function getMessagesSync(): Messages {
  return syncMessages
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const messages = getMessages(settings.general.locale)

  useEffect(() => {
    syncMessages = messages
    document.documentElement.lang = settings.general.locale
  }, [messages, settings.general.locale])

  // Keep sync handle current during render (before effects) for same-tick callers.
  syncMessages = messages

  // Sync tray + backend error strings with the UI locale.
  useEffect(() => {
    void setBackendLocale(settings.general.locale).catch(() => {
      /* Vite-only / non-Tauri */
    })
  }, [settings.general.locale])

  return <I18nContext.Provider value={messages}>{children}</I18nContext.Provider>
}

export function useMessages(): Messages {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useMessages must be used within I18nProvider")
  return ctx
}
