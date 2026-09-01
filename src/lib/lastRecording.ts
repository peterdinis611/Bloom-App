import { idbGet, idbRemove, idbSet } from "@/lib/idb"

const LAST_RECORDING_KEY = "bloom-last-recording-id"

export async function setLastRecordingId(id: string): Promise<void> {
  await idbSet(LAST_RECORDING_KEY, id)
}

export async function getLastRecordingId(): Promise<string | null> {
  return idbGet(LAST_RECORDING_KEY)
}

export async function clearLastRecordingId(): Promise<void> {
  await idbRemove(LAST_RECORDING_KEY)
}
