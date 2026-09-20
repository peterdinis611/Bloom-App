/** In-app documentation — mirrors docs/*.md in Slovak. */

export type DocBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; headers: [string, string]; rows: [string, string][] }
  | { type: "kbd"; rows: { keys: string; label: string }[] }
  | { type: "example"; title: string; steps: string[] }

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
          "Zelené tlačidlo v titlebare (alebo dvojklik na lištu) zväčší okno na celú obrazovku",
        ],
      },
      {
        type: "example",
        title: "Príklad: prvá nahrávka za 1 minútu",
        steps: [
          "Sidebar → Nahrávanie → zdroj Obrazovka",
          "Zapni mikrofón, odpočítavanie 3 s",
          "Nahrať → potvrď zdieľanie v macOS → Stop",
          "Toast → Otvoriť editor alebo Knižnica → prehrať",
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
        text: "Vyber zdroj (obrazovka, kamera, oboje), displej a voliteľne mikrofón či systémový zvuk. Pri obrazovke potvrď zdieľanie v systémovom dialógu macOS. Zapni „Nahrať len vybranú oblasť“ a po zdieľaní potiahni obdĺžnik na náhľade.",
      },
      {
        type: "ul",
        items: [
          "Odpočítavanie 0 / 3 / 5 s v nastaveniach alebo pred štartom",
          "Počas nahrávania: kreslenie, pauza, HUD v tray menu",
          "Globálne skratky: ⌘⇧R štart, ⌘⇧P pauza, ⌘⇧S ukončenie",
          "PiP veľkosť/pozícia a spotlight kurzora nastavíš v Nastaveniach",
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
      {
        type: "example",
        title: "Príklad: tutoriál s kamerou a kreslením",
        steps: [
          "Zdroj Oboje, PiP vpravo dole, zapni Spotlight kurzora",
          "Predvoľba „Tutorial“ (alebo vlastná v Nastaveniach → Predvoľby)",
          "Počas nahrávky stlač Kresliť → P (pero) → zvýrazni UI",
          "Stop → v knižnici pridaj poznámku k nahrávke",
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
          ["Zdieľať", "macOS share panel, Slack/Discord, kópia cesty"],
          ["Poznámky", "Textové poznámky pri nahrávke (meta)"],
          ["Pridať video", "Import MP4/MOV/MKV/AVI/WebM a ďalších"],
        ],
      },
      {
        type: "ul",
        items: [
          "Obľúbené, priečinky, fulltextové hľadanie",
          "Dávkové mazanie a optimalizácia cez režim Výber",
          "Potvrdenie pred zmazaním vypneš v Nastaveniach → Všeobecné",
        ],
      },
      {
        type: "example",
        title: "Príklad: zdieľanie do Slacku",
        steps: [
          "Nastavenia → Integrácie → vlož Slack Incoming Webhook URL",
          "Zapni „Oznámiť export cez webhook“",
          "V knižnici → Zdieľať na nahrávke, alebo exportuj z editora",
          "Po exporte príde správa s názvom a cestou súboru",
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
        text: "Editor má tri kroky: Náhľad (A/B porovnanie), Orez (filmstrip, I/O body, rozdelenie na klipy, priestorový crop), Export (preset, formát, titulky).",
      },
      {
        type: "ul",
        items: [
          "Export sa pridá do fronty v sidebar-e — môžeš pokračovať v práci",
          "H.264 MP4 orez môže použiť rýchly stream copy (predvoľba v Nastaveniach)",
          "Presety: small / medium / high; formáty MP4, MOV, M4V, MKV, AVI, MPEG, TS, FLV, 3GP, OGV, WebM, GIF",
          "Až 3 segmenty — export zvlášť alebo spojiť do jedného súboru",
        ],
      },
      {
        type: "example",
        title: "Príklad: orež intro a skomprimuj",
        steps: [
          "Knižnica → Upraviť → krok Orez",
          "Playhead na koniec intro → Nastaviť začiatok (I)",
          "Voliteľne Rozdeliť tu / Crop rámčekom",
          "Export → medium + original (alebo predvoľby z Nastavení) → Uložiť kópiu",
        ],
      },
      {
        type: "example",
        title: "Príklad: tri klipy z jednej nahrávky",
        steps: [
          "V Oreze nastav 2 rezy (Rozdeliť tu) → max. 3 segmenty",
          "Režim „Samostatné časti“ → Export spustí 3 úlohy vo fronte",
          "Alebo „Spojiť“ — jeden výstup s keep-ranges",
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "Nastavenia",
    blocks: [
      {
        type: "table",
        headers: ["Sekcia", "Čo nastavíš"],
        rows: [
          ["Všeobecné", "Štart na celé okno, knižnica po nahrávke, badge Noviniek, potvrdenie mazania"],
          ["Nahrávanie", "Kvalita, odpočítavanie, PiP, spotlight, skrytie okna"],
          ["Predvolby exportu", "Preset, rozlíšenie, stream copy, HW encode"],
          ["Integrácie", "Slack/Discord webhook, otvoriť/kopírovať po exporte"],
          ["Predvoľby", "Rýchle profily demo / meeting / tutorial"],
        ],
      },
      {
        type: "example",
        title: "Príklad: rýchly workflow pre demá",
        steps: [
          "Všeobecné → Spustiť na celé okno + Po nahrávke otvoriť knižnicu",
          "Predvolby exportu → medium + original + stream copy",
          "Integrácie → kopírovať cestu po exporte",
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
          ["Okno nejde zväčšiť", "Zelené tlačidlo / dvojklik na titlebar; Nastavenia → Spustiť na celé okno"],
          ["Málo miesta na disku", "Uvoľni miesto na disku s knižnicou"],
          ["Export zlyhal", "Skontroluj ffmpeg; chyba je vo fronte exportov"],
        ],
      },
    ],
  },
]
