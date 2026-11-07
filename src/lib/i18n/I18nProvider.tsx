import { useEffect, type ReactNode } from "react"
import { useSettings } from "@/hooks/settingsContext"
import { setLocale as setBackendLocale } from "@/hooks/useBloomBackend"
import { getMessages } from "./catalog"
import { setMessagesSync } from "./messagesSync"
import { I18nContext } from "./i18nContext"

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings()
  const messages = getMessages(settings.general.locale)

  useEffect(() => {
    setMessagesSync(messages)
    document.documentElement.lang = settings.general.locale
  }, [messages, settings.general.locale])

  setMessagesSync(messages)

  useEffect(() => {
    void setBackendLocale(settings.general.locale).catch(() => {
      /* Vite-only / non-Tauri */
    })
  }, [settings.general.locale])

  return <I18nContext.Provider value={messages}>{children}</I18nContext.Provider>
}
