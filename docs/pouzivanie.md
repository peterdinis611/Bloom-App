# Používanie Bloom

Príručka pre koncového používateľa. Všetky texty v aplikácii sú po slovensky.
V sidebar-e otvor **Dokumentácia** — rovnaký obsah aj s praktickými príkladmi.

## Okno aplikácie

- Zelené tlačidlo v titlebare (alebo **dvojklik** na lištu) zväčší Bloom na celú pracovnú plochu
- V **Nastavenia → Všeobecné** zapni **Spustiť na celé okno**

## Kam sa ukladajú nahrávky

- **macOS:** `~/Movies/Bloom`
- Každé video má sidecar metadata: `názov.bloom.json` (titulok, dĺžka, štítky, priečinok, poznámky, …)
- Miniatúry a filmstrip cache: skryté súbory v tom istom priečinku

## Nahrávanie

1. Otvorte **Nahrávanie** v sidebar-e.
2. Vyberte zdroj: **Obrazovka**, **Kamera** alebo **Oboje**.
3. Pri obrazovke zvoľte displej — pri spustení macOS zobrazí systémový dialóg na zdieľanie obrazovky (toto musíte potvrdiť).
4. Voliteľne zapnite mikrofón, systémový zvuk, kurzor, PiP kameru alebo rozmazanie pozadia.
5. Stlačte **Nahrať** (prípadne s odpočítavaním 3 / 5 s).

Počas nahrávania môžete:
- kresliť na obrazovku (nástroje v docku),
- pozastaviť a pokračovať,
- ukončiť — súbor sa finalizuje na pozadí (faststart, presná dĺžka, miniatúra).

Ak náhľad neukazuje obraz, ale nahrávanie beží, skontrolujte klip v **Knižnici** po ukončení — diagnostika vysvetlí typický problém (prístup, WebKit, zrušené zdieľanie).

### Príklad: tutoriál s kamerou

1. Zdroj **Oboje**, PiP vpravo dole, zapnite Spotlight kurzora.
2. Použite predvoľbu **Tutorial** (Nastavenia → Predvoľby).
3. Počas nahrávky **Kresliť** → `P` (pero) → zvýraznite UI.
4. Stop → v knižnici pridajte poznámku k nahrávke.

### Klávesové skratky (kreslenie)

| Kláves | Nástroj |
|--------|---------|
| P | Pero |
| H | Zvýrazňovač |
| L | Čiara |
| A | Šípka |
| R | Obdĺžnik |
| C | Kruh |
| E | Guma |

## Knižnica

Každý záznam zobrazuje miniatúru, zdroj, kvalitu, veľkosť a akcie:

| Akcia | Čo robí |
|-------|---------|
| **Prehrať** | Vlastný prehrávač v modálnom okne |
| **Upraviť** | Otvorí editor videa (orez, crop, export, titulky) |
| **Overiť** | Skontroluje, či video a `.bloom.json` existujú a nie sú prázdne |
| **Finder** | Otvorí priečinok so zvýrazneným súborom |
| **Zdieľať** | macOS panel, Slack/Discord webhook, kópia cesty/súboru |
| **Poznámky** | Textové poznámky uložené v meta |
| **Vymazať** | Natrvalo odstráni video aj metadata (potvrdenie voliteľné) |

### Organizácia

- **Obľúbené** — filter hviezdičkovaných záznamov
- **Priečinky** — filter podľa vlastného priečinka (text v meta poli)
- **Hľadať** — fulltext v titulku a meta údajoch
- **Vybrať** — dávkové mazanie alebo dávková optimalizácia

### Príklad: zdieľanie do Slacku

1. **Nastavenia → Integrácie** → Slack Incoming Webhook URL.
2. Zapnite **Oznámiť export cez webhook**.
3. V knižnici **Zdieľať**, alebo dokončite export z editora.
4. Po exporte príde správa s názvom a cestou.

## Editor videa

Spustíte cez **Upraviť** v knižnici. Postup v troch krokoch:

### 1. Náhľad

- Prehranie originálu
- **Porovnanie pred/po** — posuvník odhaduje vzhľad po kompresii
- Pokračovanie na orez

### 2. Orez

- Filmstrip s miniatúrami z ffmpeg
- Úchyty začiatku/konca alebo polia **Začiatok / Koniec** (`mm:ss.ms`)
- **Nastaviť začiatok / koniec** — nastaví bod podľa playheadu (I/O)
- **Rozdeliť tu** — až 3 segmenty; export každého zvlášť alebo spojiť
- **Crop** — priestorový výrez rámčekom na náhľade

### 3. Export

- Preset (small / medium / high), rozlíšenie, formát (**MP4 / MOV / M4V / MKV / AVI / MPEG / TS / FLV / 3GP / OGV / WebM / GIF**), rýchlosť
- Predvolby berie z **Nastavenia → Predvolby exportu**
- **Uložiť kópiu** vs **Nahradiť originál** (nahradenie len MP4)
- Titulky: cesta k `.srt` alebo manuálne textové karty (max. 2)
- Voliteľne: redukcia šumu, normalizácia zvuku, HEVC, bez zvuku
- Odhad veľkosti a dĺžky; pri orezaní H.264 MP4/MOV/M4V môže byť **rýchly export (stream copy)**

Import do knižnice podporuje aj ďalšie kontajnery: `wmv`, `asf`, `f4v`, `mts`, `m2ts`, `vob`, `mxf`, `divx` a pod.

Po spustení sa úloha pridá do **Fronty exportov** v sidebar-e — modal sa zavrie a môžete pokračovať v práci.

### Príklad: orež intro a skomprimuj

1. Knižnica → **Upraviť** → krok Orez.
2. Playhead na koniec intro → **Nastaviť začiatok**.
3. Export → medium + original (alebo vaše predvolby) → **Uložiť kópiu**.

### Príklad: tri klipy

1. V Oreze dva rezy (**Rozdeliť tu**) → max. 3 segmenty.
2. **Samostatné časti** → tri úlohy vo fronte, alebo **Spojiť** → jeden výstup.

## Fronta exportov

Panel v ľavom sidebar-e zobrazuje bežiace a dokončené exporty. Môžete:

- sledovať percentá priebehu,
- zrušiť bežiacu úlohu,
- vymazať hotové záznamy z fronty.

Knižnica sa po dokončení exportu automaticky obnoví.

## Nastavenia

| Sekcia | Čo nastavíte |
|--------|----------------|
| **Všeobecné** | Štart na celé okno, knižnica po nahrávke, badge Noviniek, potvrdenie mazania |
| **Vzhľad** | 30 tém (Darkroom, Svetlý, Kino, …) |
| **Nahrávanie** | Kvalita, odpočítavanie, PiP veľkosť/pozícia, spotlight, skrytie okna |
| **Predvolby exportu** | Preset, rozlíšenie, preferencia stream copy / HW encode |
| **Integrácie** | Slack/Discord webhook, otvoriť súbor / kopírovať cestu po exporte |
| **Predvoľby** | Uložené kombinácie zdroja a zariadení |
| **Knižnica** | Priečinok úložiska, vymazať všetko |

### Príklad: rýchly workflow pre demá

1. Všeobecné → Spustiť na celé okno + Po nahrávke otvoriť knižnicu.
2. Predvolby exportu → medium + original + stream copy.
3. Integrácie → kopírovať cestu po exporte.

## ffmpeg

Bez ffmpeg funguje nahrávanie a knižnica, ale nie:

- miniatúry a filmstrip,
- editor a export,
- dávková optimalizácia.

V knižnici sa zobrazí upozornenie s možnosťou **nainštalovať cez Homebrew** alebo skopírovať príkaz do terminálu.

## Riešenie problémov

| Problém | Riešenie |
|---------|----------|
| Prázdny náhľad pri nahrávaní | Potvrďte zdieľanie obrazovky v macOS; po nahrávaní skontrolujte súbor v knižnici |
| Editor neotvorí filmstrip | Nainštalujte ffmpeg |
| Zdieľanie nič neukáže | Reštartujte app; vyžaduje macOS a hlavné okno Bloom |
| Okno nejde zväčšiť | Zelené tlačidlo / dvojklik na titlebar; Nastavenia → Spustiť na celé okno |
| Málo miesta na disku | Uvoľnite miesto na disku s `~/Movies/Bloom`; varovanie sa zobrazí pred nahrávaním |
| Export zlyhal | Skontrolujte ffmpeg; v fronte uvidíte chybovú hlášku |
