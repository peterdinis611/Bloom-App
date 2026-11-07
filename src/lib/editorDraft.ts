import { idbGet, idbRemove, idbSet } from "@/lib/idb"
import type { EditorCrop, EditorSegment } from "@/lib/editorSegments"

export interface EditorDraftChapter {
  id: string
  time: number
  title: string
}

export interface EditorDraft {
  segments: EditorSegment[]
  crop: EditorCrop | null
  chapters: EditorDraftChapter[]
  updatedAt: string
}

function draftKey(recordingId: string): string {
  return `editor-draft:${recordingId}`
}

export async function loadEditorDraft(recordingId: string): Promise<EditorDraft | null> {
  const raw = await idbGet(draftKey(recordingId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as EditorDraft
    if (!parsed || !Array.isArray(parsed.segments) || !Array.isArray(parsed.chapters)) return null
    return parsed
  } catch {
    return null
  }
}

export async function saveEditorDraft(recordingId: string, draft: Omit<EditorDraft, "updatedAt">): Promise<void> {
  const payload: EditorDraft = { ...draft, updatedAt: new Date().toISOString() }
  await idbSet(draftKey(recordingId), JSON.stringify(payload))
}

export async function clearEditorDraft(recordingId: string): Promise<void> {
  await idbRemove(draftKey(recordingId))
}
