# ChordMorph

Webový konvertor akordů a textů písní. Celý běží v prohlížeči — žádný backend, žádné odesílání dat.

## Podporované formáty

| ID | Formát | Zápis akordů | Poznámka |
|----|--------|--------------|----------|
| `over` | Akordy nad textem | samostatný řádek nad textem | zarovnání po sloupcích |
| `chordpro` | ChordPro | `[C]` | direktivy `{title}`, `{start_of_chorus}`, … |
| `inline` | Inline hranaté závorky | `[C]` | bez direktiv, běžné na českých webech |
| `kytario` | [Kytario](https://kytario.com/cs/dokumentace) | `{C}` | sekce `- Ref.`, odkazy `[Ref.]`, repetice `\|: :\|`, `{X}`, pevné mezery `{-}` |

Každá dvojice formátů je převoditelná oběma směry (16 kombinací).

## Funkce

- **Autodetekce vstupu** — každý formát vrací skóre, vybere se nejvyšší
- **Transpozice** ±11 půltónů, klávesové zkratky Ctrl/Cmd + ↑ / ↓
- **Kapodastr** 0–11 pražců (odečítá se od transpozice)
- **Notace** česká/německá (H, B) ↔ anglická (B, Bb), včetně basových tónů za lomítkem
- **Posuvky** — zachovat původní (výchozí) / křížky / bé, **zápis moll** `m` / `mi` / `min`
- **Čištění mezer** — zbytky po zarovnání se smrsknou na jednu mezeru; akord, který ve
  vstupu stojí před slovem nebo se na něj nic nezpívá, se oddělí mezerou z obou stran
- **Přetažení souboru** rovnou do vstupního pole
- **Náhled** s akordy vysázenými nad text
- **Export** — kopírování, uložení souboru, tisk / PDF (A5 na šířku)
- Sbalitelná lišta nastavení nahoře — transpozice zůstává vždy po ruce
- Světlý i tmavý režim, plná responzivita

## Architektura

Vše stojí na společném mezijazyce (IR), takže formáty se nepřevádějí mezi sebou přímo:

```
vstupní text → parse() → Song (IR) → serialize() → výstupní text
```

```
Song
 └── meta { title, artist, key, capo, tempo, extra[] }
 └── sections[]
      └── Section { label, kind }
           └── lines[]
                └── Line { kind, segments[], refs[], repeatOpen/Close/Count, noChords }
                     └── Segment { chord: Chord|null, text }
```

Transpozice ani převod notace se nedělají nad textem, ale nad objekty `Chord`
(`root`, `acc`, `suffix`, `bassRoot`, `bassAcc`) — proto fungují stejně ve všech formátech.

### Soubory

```
index.html
assets/css/app.css
assets/js/
  chords.js              parsování akordů, transpozice, notace
  model.js               IR + registr formátů
  detect.js              autodetekce
  render.js              HTML náhled
  formats/
    common.js            sdílené pomůcky (meta, sekce, repetice, zarovnání)
    chords-over.js
    chordpro.js
    inline.js
    kytario.js
test/run.js              testy bez prohlížeče
```

## Přidání dalšího formátu

1. Vytvoř `assets/js/formats/<id>.js` a zavolej `CM.formats.register({ … })`:

```js
CM.formats.register({
  id: 'muj-format',
  name: 'Můj formát',
  short: 'Můj',
  ext: 'txt',
  mono: true,                       // vykreslit výstup monospace fontem
  description: 'Krátký popis do patičky panelu.',
  parse: function (text, opts) { /* → Song */ },
  serialize: function (song, opts) { /* → string */ },
  detect: function (text) { /* → 0..1 */ }
});
```

2. Přidej `<script>` do `index.html` před `detect.js`.

Do nabídek ve vstupu i výstupu se formát doplní sám, autodetekce ho začne
zvažovat a přibudou všechny nové kombinace převodů.

`opts` obsahuje `{ shift, notation, inputNotation, accidental, minorStyle }` —
předej je do `CM.chords.formatChord(chord, opts.shift, opts)` a transpozice
i notace budou fungovat automaticky.

## Testy

```bash
node test/run.js
```

Pokrývají autodetekci, všech 16 křížových převodů, stabilitu round-tripu,
transpozici a notace, zarovnání akordů nad textem, specifika Kytaria
a odolnost proti nevalidnímu vstupu.

## Lokální spuštění

```bash
python3 -m http.server 4173
```

Stačí statické soubory, žádný build.
