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
    version: "2.0.0",
    date: "2026-10-30",
    title: "Editor, čistý hlas a nový shell",
    body: [
      "Bloom 2.0 je plná striháreň — editor hub, demo klip, silnejšie exporty a jemnejší Apple shell. Stále všetko lokálne.",
    ],
    highlights: [
      "Editor hub — vybrať, importovať alebo upraviť nahrávku",
      "Balené demo video na vyskúšanie editora",
      "Flip, rotácia, fade, volume a aspect presetty",
      "Čistý hlas — odstránenie šumu z pozadia",
      "Export zvuku (WAV/MP3) a waveform v editore",
      "Preskočiť ticho — len rečové úseky",
      "Batch optimalizácia v Rusti",
      "Nový layout Noviniek a Dokumentácie",
    ],
  },
  {
    version: "1.1.1",
    date: "2026-10-30",
    title: "Jemnejší shell a feedback",
    body: [
      "Svetlá téma, tichšie notifikácie a nastavenie priehľadnosti — Bloom sa správa bližšie k natívnemu macOS.",
    ],
    highlights: [
      "Svetlá téma so system blue",
      "Tichšie toast notifikácie a focus ringy",
      "Znížiť priehľadnosť — bez frosted skla",
      "Ľahký haptic feedback pri úspechu a chybe",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-10-29",
    title: "Kliky, obnova a poriadok",
    body: [
      "Po nahrávke rýchle akcie — upraviť, zdieľať, spotlight a GIF. Všetko ostáva lokálne.",
    ],
    highlights: [
      "Spotlight kurzora a záznam kliknutí",
      "Obnova nedokončených nahrávok po páde",
      "Nedávne nahrávky v tray menu",
      "Priečinky, filtre a uložené pohľady",
      "Spájanie viacerých nahrávok",
      "Auto-optimalizácia a snímka počas pauzy",
      "Voliteľné zdieľanie hneď po exporte",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-09-20",
    title: "Produkčný release",
    body: [
      "Pripravený na každodenné tutoriály a demá. Klipy neputujú do cloudu, pokiaľ ich sám neodošleš.",
    ],
    highlights: [
      "Region capture a akcie po nahrávke",
      "Upraviteľné globálne skratky",
      "GIF export a kopírovanie do schránky",
      "Onboarding s oprávneniami",
      "Auto-updater a signed DMG",
      "Webhooky a otvoriť po exporte",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-02",
    title: "Knižnica a témy",
    highlights: [
      "30 vizuálnych tém",
      "In-app dokumentácia",
      "Import videa a vlastný priečinok",
      "IndexedDB pre nastavenia",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-28",
    title: "Prvý build",
    highlights: [
      "Nahrávanie obrazovky, kamery a PiP",
      "Editor s trimom a exportom",
      "Tray menu a základné skratky",
    ],
  },
]

export const CURRENT_NEWS_VERSION = WHATS_NEW[0]?.version ?? "2.0.0"
