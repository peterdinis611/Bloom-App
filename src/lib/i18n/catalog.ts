import { sk } from "./sk"
import { en } from "./locales/en"
import { cs } from "./locales/cs"
import { de } from "./locales/de"
import { pl } from "./locales/pl"
import { hu } from "./locales/hu"
import type { LocaleId, Messages } from "./types"

export const LOCALES: { id: LocaleId; nativeLabel: string; englishLabel: string }[] = [
  { id: "sk", nativeLabel: "Slovenčina", englishLabel: "Slovak" },
  { id: "en", nativeLabel: "English", englishLabel: "English" },
  { id: "cs", nativeLabel: "Čeština", englishLabel: "Czech" },
  { id: "de", nativeLabel: "Deutsch", englishLabel: "German" },
  { id: "pl", nativeLabel: "Polski", englishLabel: "Polish" },
  { id: "hu", nativeLabel: "Magyar", englishLabel: "Hungarian" },
]

export const CATALOG: Record<LocaleId, Messages> = {
  sk: sk as unknown as Messages,
  en,
  cs,
  de,
  pl,
  hu,
}

export function isLocaleId(v: unknown): v is LocaleId {
  return typeof v === "string" && v in CATALOG
}

export function getMessages(locale: LocaleId): Messages {
  return CATALOG[locale] ?? sk
}
