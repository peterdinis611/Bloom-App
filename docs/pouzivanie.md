# Používanie Bloom

Príručka pre koncového používateľa. Všetky texty v aplikácii sú po slovensky.

## Kam sa ukladajú nahrávky

- **macOS:** `~/Movies/Bloom`
- Každé video má sidecar metadata: `názov.bloom.json` (titulok, dĺžka, štítky, priečinok, …)
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
| **Upraviť** | Otvorí editor videa (orez, export, titulky) |
| **Overiť** | Skontroluje, či video a `.bloom.json` existujú a nie sú prázdne |
| **Finder** | Otvorí priečinok so zvýrazneným súborom |
| **Zdieľať** | Otvorí macOS panel zdieľania (AirDrop, Mail, Správy, …) |
| **Vymazať** | Natrvalo odstráni video aj metadata |

### Organizácia

- **Obľúbené** — filter hviezdičkovaných záznamov
- **Priečinky** — filter podľa vlastného priečinka (text v meta poli)
- **Hľadať** — fulltext v titulku a meta údajoch
- **Vybrať** — dávkové mazanie alebo dávková optimalizácia

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
- **Rozdeliť tu** — až 3 segmenty; export každého zvlášť

### 3. Export

- Preset (small / medium / high), rozlíšenie, formát, rýchlosť
- **Uložiť kópiu** vs **Nahradiť originál** (nahradenie len MP4)
- Titulky: cesta k `.srt` alebo manuálne textové karty (max. 2)
- Voliteľne: redukcia šumu, normalizácia zvuku, HEVC, bez zvuku
- Odhad veľkosti a dĺžky; pri orezaní H.264 MP4 môže byť **rýchly export (stream copy)**

Po spustení sa úloha pridá do **Fronty exportov** v sidebar-e — modal sa zavrie a môžete pokračovať v práci.

## Fronta exportov

Panel v ľavom sidebar-e zobrazuje bežiace a dokončené exporty. Môžete:

- sledovať percentá priebehu,
- zrušiť bežiacu úlohu,
- vymazať hotové záznamy z fronty.

Knižnica sa po dokončení exportu automaticky obnoví.

## Nastavenia

- **Vzhľad** — témy (Darkroom, Svetlý, Oranžový, …)
- **Nahrávanie** — predvolená kvalita, odpočítavanie, skrytie okna pri nahrávaní
- **Predvoľby** — uložené kombinácie zdroja a zariadení pre rýchly štart

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
| Málo miesta na disku | Uvoľnite miesto na disku s `~/Movies/Bloom`; varovanie sa zobrazí pred nahrávaním |
| Export zlyhal | Skontrolujte ffmpeg; v fronte uvidíte chybovú hlášku |
