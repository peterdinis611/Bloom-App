/** In-app “What’s new” — version news for Bloom releases. */

export interface NewsItem {
  version: string
  date: string
  title: string
  highlights: string[]
  /** Optional longer body paragraphs */
  body?: string[]
}

export const WHATS_NEW: NewsItem[] = [
  {
    version: "1.0.0",
    date: "2026-09-20",
    title: "Bloom 1.0 — produkčný release",
    highlights: [
      "Region / area capture a akcie po nahrávke",
      "Upraviteľné globálne skratky",
      "GIF export a kopírovanie do schránky",
      "Onboarding s oprávneniami a súkromím",
      "Auto-updater a CI pre signed DMG",
      "Integrácie: webhooky, otvoriť po exporte",
    ],
    body: [
      "Bloom 1.0 je pripravený na každodenné nahrávanie tutoriálov a dema. Všetko ostáva lokálne — tvoje klipy neputujú do cloudu, pokiaľ ich sám neodošleš.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-02",
    title: "Knižnica, témy a dokumentácia",
    highlights: [
      "30 vizuálnych tém",
      "In-app dokumentácia",
      "Import videa a vlastný priečinok knižnice",
      "IndexedDB pre nastavenia",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-28",
    title: "Prvý build",
    highlights: [
      "Nahrávanie obrazovky / kamery / PiP",
      "Editor s trimom a exportom",
      "Tray menu a základné skratky",
    ],
  },
]

export const CURRENT_NEWS_VERSION = WHATS_NEW[0]?.version ?? "1.0.0"
