/** In-app documentation — mirrors docs/*.md in Slovak. */

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; headers: [string, string]; rows: [string, string][] }
  | { type: "kbd"; rows: { keys: string; label: string }[] }

export interface DocSection {
  id: string
  title: string
  blocks: DocBlock[]
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: "start",
    title: "Začíname",
    blocks: [
      {
        type: "p",
        text: "Bloom je desktopová appka na nahrávanie obrazovky, kameru a jednoduchú postprodukciu. Nahrávky sa ukladajú do knižnice s metadátami (.bloom.json).",
      },
      {
        type: "ul",
        items: [
          "Predvolená cesta: ~/Movies/Bloom (macOS) — zmeníš v Nastaveniach → Knižnica",
          "Import externého videa: tlačidlo Pridať video alebo pretiahni súbor do knižnice",
          "ffmpeg je voliteľný pre miniatúry, editor a export — nainštaluj z knižnice",
        ],
      },
    ],
  },
  {
    id: "record",
    title: "Nahrávanie",
    blocks: [
      {
        type: "p",
        text: "Vyber zdroj (obrazovka, kamera, oboje), displej a voliteľne mikrofón či systémový zvuk. Pri obrazovke potvrď zdieľanie v systémovom dialógu macOS.",
      },
      {
        type: "ul",
        items: [
          "Odpočítavanie 0 / 3 / 5 s v nastaveniach alebo pred štartom",
          "Počas nahrávania: kreslenie, pauza, HUD v tray menu",
          "Globálne skratky: ⌘⇧R štart, ⌘⇧P pauza, ⌘⇧S ukončenie",
        ],
      },
      {
        type: "kbd",
        rows: [
          { keys: "⌘⇧R", label: "Spustiť nahrávanie (tray)" },
          { keys: "⌘⇧P", label: "Pauza / pokračovať" },
          { keys: "⌘⇧S", label: "Ukončiť a uložiť" },
        ],
      },
    ],
  },
  {
    id: "draw",
    title: "Kreslenie",
    blocks: [
      {
        type: "p",
        text: "Počas nahrávania zapni režim kreslenia — čiary sa zapisujú priamo do videa.",
      },
      {
        type: "kbd",
        rows: [
          { keys: "P", label: "Pero" },
          { keys: "H", label: "Zvýrazňovač" },
          { keys: "L", label: "Čiara" },
          { keys: "A", label: "Šípka" },
          { keys: "R", label: "Obdĺžnik" },
          { keys: "C", label: "Kruh" },
          { keys: "E", label: "Guma" },
        ],
      },
    ],
  },
  {
    id: "library",
    title: "Knižnica",
    blocks: [
      {
        type: "table",
        headers: ["Akcia", "Popis"],
        rows: [
          ["Prehrať", "Vlastný prehrávač v modálnom okne"],
          ["Upraviť", "Editor — náhľad, orez, export, titulky"],
          ["Overiť", "Kontrola integrity súboru a metadát"],
          ["Finder", "Otvorí priečinok so súborom"],
          ["Zdieľať", "macOS share panel (AirDrop, Mail, …)"],
          ["Pridať video", "Import MP4/WebM/MOV/MKV do knižnice"],
        ],
      },
      {
        type: "ul",
        items: [
          "Obľúbené, priečinky, fulltextové hľadanie",
          "Dávkové mazanie a optimalizácia cez režim Výber",
        ],
      },
    ],
  },
  {
    id: "editor",
    title: "Editor a export",
    blocks: [
      {
        type: "p",
        text: "Editor má tri kroky: Náhľad (A/B porovnanie), Orez (filmstrip, I/O body, rozdelenie na klipy), Export (preset, formát, titulky).",
      },
      {
        type: "ul",
        items: [
          "Export sa pridá do fronty v sidebar-e — môžeš pokračovať v práci",
          "H.264 MP4 orez môže použiť rýchly stream copy",
          "Presety: small / medium / high, MP4 / WebM / GIF",
        ],
      },
    ],
  },
  {
    id: "troubleshoot",
    title: "Riešenie problémov",
    blocks: [
      {
        type: "table",
        headers: ["Problém", "Riešenie"],
        rows: [
          ["Prázdny náhľad pri nahrávaní", "Potvrď zdieľanie obrazovky; skontroluj klip v knižnici po ukončení"],
          ["Editor bez filmstripu", "Nainštaluj ffmpeg (Knižnica → banner)"],
          ["Zdieľanie nefunguje", "Vyžaduje macOS a hlavné okno Bloom"],
          ["Málo miesta na disku", "Uvoľni miesto na disku s knižnicou"],
          ["Export zlyhal", "Skontroluj ffmpeg; chyba je vo fronte exportov"],
        ],
      },
    ],
  },
]
