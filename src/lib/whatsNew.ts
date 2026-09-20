import { idbGet, idbSet } from "@/lib/idb"
import { CURRENT_NEWS_VERSION } from "@/lib/whatsNewContent"

const NEWS_SEEN_KEY = "bloom-news-seen-v1"

export async function getSeenNewsVersion(): Promise<string | null> {
  return idbGet(NEWS_SEEN_KEY)
}

export async function markNewsSeen(version: string = CURRENT_NEWS_VERSION): Promise<void> {
  await idbSet(NEWS_SEEN_KEY, version)
}

export async function hasUnreadNews(): Promise<boolean> {
  const seen = await getSeenNewsVersion()
  return seen !== CURRENT_NEWS_VERSION
}
