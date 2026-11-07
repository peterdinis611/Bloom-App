import { getMessages } from "./catalog"
import type { Messages } from "./types"

/** Mutable sync handle for non-React modules (localizeError, updater, …). */
let syncMessages: Messages = getMessages("sk")

export function getMessagesSync(): Messages {
  return syncMessages
}

export function setMessagesSync(messages: Messages): void {
  syncMessages = messages
}
