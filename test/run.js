/* Testy převodní logiky bez prohlížeče */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const base = path.join(__dirname, '..', 'assets', 'js');
const files = [
  'chords.js', 'model.js', 'formats/common.js',
  'formats/chords-over.js', 'formats/chordpro.js', 'formats/inline.js', 'formats/kytario.js',
  'detect.js', 'render.js'
];
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(base, f), 'utf8'), sandbox, { filename: f });
}
const CM = sandbox.CM;

const OPTS = { shift: 0, notation: 'de', inputNotation: 'auto', accidental: 'sharp', minorStyle: 'keep' };

const samples = {
  over: [
    'Ranní tramvaj',
    '— ukázka',
    '',
    '[1.]',
    'D              A            Bm         G',
    'Ráno v tramvaji svítí lampy do tmy,',
    '',
    '[Ref.]',
    'Bm         G        D          A',
    'Pojedeme dál, dokud město spí,',
    '',
    '[Solo]',
    'D  A  Bm  G'
  ].join('\n'),
  chordpro: [
    '{title: Ranní tramvaj}',
    '{subtitle: ukázka}',
    '',
    '{comment: 1.}',
    '[D]Ráno v tram[A]vaji svítí [Bm]lampy do [G]tmy,',
    '',
    '{start_of_chorus}',
    '[Bm]Pojedeme [G]dál, dokud [D]město [A]spí,',
    '{end_of_chorus}'
  ].join('\n'),
  inline: [
    'Ranní tramvaj',
    '',
    '1.:',
    '[D]Ráno v tram[A]vaji svítí [Bm]lampy do [G]tmy,',
    '',
    'Ref.:',
    '[Bm]Pojedeme [G]dál, dokud [D]město [A]spí,'
  ].join('\n'),
  kytario: [
    '- 1.',
    '{D}Ráno v tram{A}vaji svítí {Bm}lampy do {G}tmy,',
    '',
    '- Ref.',
    '|: {Bm}Pojedeme {G}dál, dokud {D}město {A}spí, :| 2x',
    '',
    '|: {D}{A}{Bm}{G} :|',
    '[Ref.]'
  ].join('\n')
};

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ok   ' + name);
  else { fails++; console.log('  FAIL ' + name + (extra ? '\n' + extra : '')); }
}

console.log('\n== Autodetekce ==');
for (const [id, text] of Object.entries(samples)) {
  const d = CM.detect(text);
  check(`detekce ${id} -> ${d.best}`, d.best === id,
    '       ranking: ' + JSON.stringify(d.ranking));
}

console.log('\n== Křížové převody (16 kombinací) ==');
const ids = ['over', 'chordpro', 'inline', 'kytario'];
for (const from of ids) {
  for (const to of ids) {
    const song = CM.formats.get(from).parse(samples[from], OPTS);
    const out = CM.formats.get(to).serialize(song, OPTS);
    const ok = out.trim().length > 0 && /Ráno/.test(out) && /D/.test(out);
    check(`${from} -> ${to}`, ok, out);
  }
}

console.log('\n== Round-trip (formát -> IR -> formát -> IR) ==');
for (const id of ids) {
  const f = CM.formats.get(id);
  const s1 = f.parse(samples[id], OPTS);
  const t1 = f.serialize(s1, OPTS);
  const s2 = f.parse(t1, OPTS);
  const t2 = f.serialize(s2, OPTS);
  check(`${id} stabilní`, t1 === t2, 'A:\n' + t1 + '\nB:\n' + t2);
}

console.log('\n== Transpozice ==');
const tsong = CM.formats.get('chordpro').parse('[C]a [Am]b [F]c [G7]d [Bb]e [H]f [F#m7/A]g', OPTS);
function ser(shift, o) {
  return CM.formats.get('inline').serialize(tsong, Object.assign({}, OPTS, { shift }, o || {}));
}
check('+2 půltónu (česká notace)', /\[D\]a \[Hm\]b \[G\]c \[A7\]d/.test(ser(2)), ser(2));
check('+2 půltónu (anglická notace)', /\[D\]a \[Bm\]b \[G\]c \[A7\]d/.test(ser(2, { notation: 'en' })), ser(2, { notation: 'en' }));
check('H se zachová v de notaci', /\[H\]f/.test(ser(0)), ser(0));
check('H -> B v en notaci', /\[B\]f/.test(ser(0, { notation: 'en' })), ser(0, { notation: 'en' }));
check('Bb -> B v de notaci', /\[B\]e/.test(ser(0)), ser(0));
check('Bb -> Bb v en+flat', /\[Bb\]e/.test(ser(0, { notation: 'en', accidental: 'flat' })), ser(0, { notation: 'en', accidental: 'flat' }));
check('basový tón se transponuje', /\[G#m7\/B\]g/.test(ser(2, { notation: 'en' })), ser(2, { notation: 'en' }));
check('zápis moll jako mi', /\[Ami\]b/.test(ser(0, { minorStyle: 'mi' })), ser(0, { minorStyle: 'mi' }));
check('-12 = oktáva dolů, stejné názvy', ser(-12) === ser(0), ser(-12));

console.log('\n== Posuvky: zachovat původní ==');
const keepOpts = { notation: 'en', accidental: 'keep', inputNotation: 'en' };
const mixed = CM.formats.get('chordpro').parse('[Db]a [C#]b [Eb/Gb]c [F#m]d', OPTS);
const keepOut = CM.formats.get('inline').serialize(mixed, Object.assign({}, OPTS, keepOpts));
check('bé i křížky zůstanou tak, jak byly', keepOut.includes('[Db]a') && keepOut.includes('[C#]b') &&
  keepOut.includes('[Eb/Gb]c') && keepOut.includes('[F#m]d'), keepOut);
check('vynucené křížky přepisují vstup',
  CM.formats.get('inline').serialize(mixed, Object.assign({}, OPTS, keepOpts, { accidental: 'sharp' })).includes('[C#]a'),
  CM.formats.get('inline').serialize(mixed, Object.assign({}, OPTS, keepOpts, { accidental: 'sharp' })));
check('zachovat + transpozice použije převažující posuvku písně',
  CM.formats.get('inline').serialize(
    CM.formats.get('chordpro').parse('[C]a [Eb]b [Ab]c', OPTS),
    Object.assign({}, OPTS, keepOpts, { shift: 1, fallbackAccidental: CM.chords.dominantAccidental(CM.formats.get('chordpro').parse('[C]a [Eb]b [Ab]c', OPTS)) })
  ).includes('[Db]a'),
  CM.formats.get('inline').serialize(
    CM.formats.get('chordpro').parse('[C]a [Eb]b [Ab]c', OPTS),
    Object.assign({}, OPTS, keepOpts, { shift: 1, fallbackAccidental: 'flat' })));

console.log('\n== Mezery kolem značek akordů ==');
function conv(txt, id, o) {
  return CM.formats.get(id).serialize(CM.formats.get('over').parse(txt, OPTS), Object.assign({}, OPTS, o || {}));
}
const wide = 'D                A       Hm\nRáno v tramvaji  svítí   lampy';
check('zbytky po zarovnání se smrsknou na jednu mezeru',
  conv(wide, 'chordpro').includes('[D]Ráno v tramvaji [A]svítí [Hm]lampy'), conv(wide, 'chordpro'));
check('totéž v Kytariu',
  conv(wide, 'kytario').includes('{D}Ráno v tramvaji {A}svítí {Hm}lampy'), conv(wide, 'kytario'));

const before = '       Gdim\nwe sing and play';  // Gdim stojí nad mezerou před "and"
check('akord před slovem dostane mezeru z obou stran (ChordPro)',
  conv(before, 'chordpro').includes('we sing [Gdim] and play'), conv(before, 'chordpro'));
check('akord před slovem dostane mezeru z obou stran (Kytario)',
  conv(before, 'kytario').includes('we sing {Gdim} and play'), conv(before, 'kytario'));

const tail = 'D       A        Hm     G\nRáno v tramvaji';
check('akordy za koncem verše se nelepí na sebe',
  conv(tail, 'chordpro').includes('ramvaji [Hm] [G]'), conv(tail, 'chordpro'));
check('mezihra má akordy oddělené mezerou',
  conv('D    A    Hm   G', 'kytario').includes('{D} {A} {Hm} {G}'), conv('D    A    Hm   G', 'kytario'));
check('žádné dvojité mezery ve výstupu ChordPro',
  !/\S  +\S/.test(conv(wide, 'chordpro')), conv(wide, 'chordpro'));

const indent = '    D        A\nRáno v tramvaji';
check('odsazení prvního řádku akordů se neztratí',
  conv(indent, 'over').split('\n')[0] === '    D        A', JSON.stringify(conv(indent, 'over')));

console.log('\n== Zarovnání akordů nad textem ==');
const al = CM.formats.get('over').serialize(
  CM.formats.get('chordpro').parse('[D]Ráno v tram[A]vaji svítí [Bm]lampy', OPTS), OPTS);
const lines = al.trim().split('\n');
const cIdx = lines.findIndex(l => /^\s*D\s+A/.test(l));
check('akordy jsou na řádku nad textem', cIdx >= 0, al);
if (cIdx >= 0) {
  const c = lines[cIdx], t = lines[cIdx + 1];
  check('A stojí nad "vaji"', t[c.indexOf('A')] === 'v', `${c}\n${t}`);
  check('třetí akord stojí nad "lampy"', t.slice(c.indexOf('Hm')).startsWith('lampy'), `${c}\n${t}`);
}

console.log('\n== Specifika Kytaria ==');
const kOut = CM.formats.get('kytario').serialize(CM.formats.get('kytario').parse(samples.kytario, OPTS), OPTS);
check('popisky sekcí "- Ref."', /^- Ref\./m.test(kOut), kOut);
check('repetice |: :| 2x', /\|:.*:\| 2x/.test(kOut), kOut);
check('odkaz na sekci [Ref.]', /^\[Ref\.\]$/m.test(kOut), kOut);
check('popisek max 4 znaky', kOut.split('\n').filter(l => /^[-+] /.test(l)).every(l => l.slice(2).length <= 4), kOut);
const kNoChord = CM.formats.get('kytario').serialize(
  CM.formats.get('over').parse('[1.]\nřádek bez akordů', OPTS), OPTS);
check('řádek bez akordů dostane {X}', /\{X\}řádek bez akordů/.test(kNoChord), kNoChord);
const kLong = CM.formats.get('kytario').serialize(
  CM.formats.get('over').parse('[Chorus]\nC\nnějaký text\n\n[Bridge]\nG\ndalší text', OPTS), OPTS);
check('Chorus -> Ref., Bridge -> Brid', /- Ref\./.test(kLong) && /- Brid/.test(kLong), kLong);

console.log('\n== Vstup z volného textu (bez sekcí) ==');
const raw = 'C       G      Am     F\nDobré ráno, dobrý den\nC      G       C\nzase je tu nový den';
const rsong = CM.formats.get('over').parse(raw, OPTS);
check('2 řádky s akordy', rsong.sections.reduce((a, s) => a + s.lines.length, 0) === 2, JSON.stringify(rsong, null, 1));
check('8 akordů celkem', rsong.sections.reduce((a, s) => a + s.lines.reduce((b, l) => b + CM.model.chordsOf(l).length, 0), 0) === 7,
  String(rsong.sections.reduce((a, s) => a + s.lines.reduce((b, l) => b + CM.model.chordsOf(l).length, 0), 0)));

console.log('\n== Render náhledu ==');
const html = CM.render.renderSong(CM.formats.get('kytario').parse(samples.kytario, OPTS), OPTS);
check('náhled obsahuje páry akord/text', /pair-chord/.test(html) && /pair-text/.test(html));
check('náhled neobsahuje undefined', !/undefined/.test(html), html.slice(0, 500));

console.log('\n== Odolnost ==');
for (const id of ids) {
  const f = CM.formats.get(id);
  for (const junk of ['', '   ', '\n\n\n', 'jen text bez akordů', '{{{}}}[[[]]]', 'C', '|: :|', '{X}']) {
    try {
      f.serialize(f.parse(junk, OPTS), OPTS);
    } catch (e) {
      fails++; console.log(`  FAIL ${id} spadl na ${JSON.stringify(junk)}: ${e.message}`);
    }
  }
}
console.log('  ok   žádný formát nespadl na nevalidním vstupu');

console.log('\n' + (fails ? `${fails} test(ů) selhalo` : 'Všechny testy prošly'));
process.exit(fails ? 1 : 0);
