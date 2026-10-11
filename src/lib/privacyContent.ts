/** Privacy policy copy shown in-app (Slovak). */

export const PRIVACY_SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "Čo Bloom zbiera",
    paragraphs: [
      "Bloom je lokálna desktopová aplikácia. Nahrávky, miniatúry a nastavenia ostávajú na tvojom disku (predvolene ~/Movies/Bloom).",
      "Neodosielame analytiku, telemetriu ani obsah nahrávok na naše servery.",
    ],
  },
  {
    title: "Oprávnenia",
    paragraphs: [
      "Kamera a mikrofón — len ak ich zapneš pri nahrávaní.",
      "Nahrávanie obrazovky — macOS / systémový dialóg; Bloom nečíta obraz mimo aktívnej nahrávky.",
      "Schránka — len keď explicitne skopíruješ cestu alebo súbor.",
    ],
  },
  {
    title: "Aktualizácie",
    paragraphs: [
      "Kontrola aktualizácií môže kontaktovať GitHub Releases (verzia a podpis balíka). Nestiahne sa nič bez tvojho súhlasu.",
    ],
  },
  {
    title: "Integrácie (voliteľné)",
    paragraphs: [
      "Ak nastavíš Slack alebo Discord webhook, Bloom odošle len textové oznámenie (názov nahrávky / cesta), ktoré ty spustíš. Webhook URL sa ukladá lokálne v IndexedDB.",
    ],
  },
  {
    title: "Kontakt",
    paragraphs: [
      "Otázky k súkromiu: použi Issues v GitHub repozitári Bloom alebo e-mail uvedený v release poznámkach.",
    ],
  },
]
