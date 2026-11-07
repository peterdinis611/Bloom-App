import { createContext, useContext } from "react"
import { getMessagesSync } from "./messagesSync"
import type { Messages } from "./types"

export const I18nContext = createContext<Messages | null>(null)

export function useMessages(): Messages {
  const ctx = useContext(I18nContext)
  return ctx ?? getMessagesSync()
}
