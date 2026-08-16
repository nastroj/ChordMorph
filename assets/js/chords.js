/* ChordMorph — jádro pro práci s akordy
 * Parsování, transpozice a převod notací (německá/česká H–B vs. anglická B–Bb).
 */
(function (root) {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Suffix části akordu (kvality, přidané tóny, závorky…)
  var SUFFIX = '(?:maj|min|mi|m|M|aug|dim|sus|add|alt|dom|omit|no|o|ø|Δ|\\+|°|\\d+|[#b]|\\(|\\)|,|-)*';
  var CHORD_RE = new RegExp(
    '^([A-H])(#{1,2}|b{1,2}|)(' + SUFFIX + ')(?:\\/([A-H])(#{1,2}|b{1,2}|))?$'
  );

  /** Pitch class kořenu s ohledem na notaci. */
  function noteToPc(letter, acc, notation) {
    var base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
    var pc = base[letter];
    if (pc === undefined) return null;
    if (letter === 'B' && notation === 'de') pc = 10; // německé B = Bb
    for (var i = 0; i < acc.length; i++) pc += acc[i] === '#' ? 1 : -1;
    return ((pc % 12) + 12) % 12;
  }

  /**
   * Rozpozná a rozparsuje akord.
   * @returns {{root:string,acc:string,suffix:string,bassRoot:?string,bassAcc:?string,raw:string}|null}
   */
  function parseChord(raw, notation) {
    if (!raw) return null;
    var token = String(raw).trim();
    if (!token) return null;
    var m = CHORD_RE.exec(token);
    if (!m) return null;
    // "H" v anglické notaci neexistuje, ale přijmeme ji jako německou
    return {
      root: m[1],
      acc: m[2] || '',
      suffix: m[3] || '',
      bassRoot: m[4] || null,
      bassAcc: m[5] || '',
      raw: token,
      notation: notation || 'auto'
    };
  }

  function isChord(token, notation) {
    return parseChord(token, notation) !== null;
  }

  /** Zapíše pitch class jako název tónu v požadované notaci. */
  function pcToName(pc, opts) {
    pc = ((pc % 12) + 12) % 12;
    var prefer = (opts && opts.accidental) || 'sharp';
    var name = prefer === 'flat' ? FLAT[pc] : SHARP[pc];
    if ((opts && opts.notation) === 'de') {
      if (name === 'B') name = 'H';
      else if (name === 'A#' || name === 'Bb') name = 'B';
    } else {
      // anglická notace: raději Bb než A#
      if (name === 'A#' && prefer !== 'sharp') name = 'Bb';
    }
    return name;
  }

  /**
   * Určí posuvku pro jeden tón. Při volbě „zachovat původní" se řídí zápisem
   * na vstupu; u tónů bez posuvky převezme převažující posuvku celé písně.
   */
  function resolveAccidental(acc, opts) {
    var prefer = (opts && opts.accidental) || 'sharp';
    if (prefer !== 'keep') return prefer;
    if (acc) return acc.charAt(0) === 'b' ? 'flat' : 'sharp';
    return (opts && opts.fallbackAccidental) || 'sharp';
  }

  /** Kopie nastavení s konkrétní posuvkou (pro jeden tón). */
  function withAccidental(opts, prefer) {
    return {
      notation: opts && opts.notation,
      inputNotation: opts && opts.inputNotation,
      minorStyle: opts && opts.minorStyle,
      accidental: prefer
    };
  }

  /** Vrátí zápis akordu po transpozici a převodu notace. */
  function formatChord(chord, semitones, opts) {
    if (!chord) return '';
    var inNot = detectChordNotation(chord, opts);
    var shift = semitones || 0;
    var pc = noteToPc(chord.root, chord.acc, inNot);
    if (pc === null) return chord.raw;
    var rootOpts = withAccidental(opts, resolveAccidental(chord.acc, opts));
    var out = pcToName(pc + shift, rootOpts) + normalizeSuffix(chord.suffix, opts);
    if (chord.bassRoot) {
      var bpc = noteToPc(chord.bassRoot, chord.bassAcc, inNot);
      var bassOpts = withAccidental(opts, resolveAccidental(chord.bassAcc, opts));
      if (bpc !== null) out += '/' + pcToName(bpc + shift, bassOpts);
    }
    return out;
  }

  /**
   * Zjistí, jaká posuvka v písni převažuje. Slouží jako záloha pro režim
   * „zachovat původní" u tónů, které samy posuvku nemají (např. C po transpozici).
   */
  function dominantAccidental(song) {
    var sharps = 0, flats = 0;
    (song && song.sections || []).forEach(function (sec) {
      (sec.lines || []).forEach(function (line) {
        (line.segments || []).forEach(function (seg) {
          var ch = seg.chord;
          if (!ch) return;
          [ch.acc, ch.bassAcc].forEach(function (a) {
            if (!a) return;
            if (a.charAt(0) === 'b') flats++; else sharps++;
          });
        });
      });
    });
    return flats > sharps ? 'flat' : 'sharp';
  }

  function detectChordNotation(chord, opts) {
    var n = (opts && opts.inputNotation) || 'auto';
    if (n === 'de' || n === 'en') return n;
    return chord.notation === 'de' ? 'de' : 'en';
  }

  /** Sjednotí zápis mollového akordu podle nastavení (m / mi / min). */
  function normalizeSuffix(suffix, opts) {
    var style = (opts && opts.minorStyle) || 'keep';
    if (style === 'keep' || !suffix) return suffix;
    var target = style === 'mi' ? 'mi' : style === 'min' ? 'min' : 'm';
    return suffix.replace(/^(min|mi|m)(?![a-jA-J])/, function (mt) {
      return mt === 'maj' ? mt : target;
    });
  }

  /** Odhadne notaci celého textu — přítomnost akordu H značí německou/českou notaci. */
  function detectNotation(text) {
    if (/(^|[\s\[{(|])H(?:[#b]?)(?:m|mi|min|maj|dim|sus|add|\d|\/|\b)/.test(text)) return 'de';
    if (/(^|[\s\[{(|])Bb/.test(text)) return 'en';
    return 'auto';
  }

  /** Odhadne tóninu z prvního akordu skladby. */
  function guessKey(song, opts) {
    var first = null;
    (song.sections || []).some(function (sec) {
      return (sec.lines || []).some(function (line) {
        return (line.segments || []).some(function (seg) {
          if (seg.chord) { first = seg.chord; return true; }
          return false;
        });
      });
    });
    if (!first) return '';
    return formatChord(first, (opts && opts.shift) || 0, opts);
  }

  root.CM = root.CM || {};
  root.CM.chords = {
    parseChord: parseChord,
    isChord: isChord,
    formatChord: formatChord,
    detectNotation: detectNotation,
    noteToPc: noteToPc,
    pcToName: pcToName,
    guessKey: guessKey,
    dominantAccidental: dominantAccidental,
    CHORD_RE: CHORD_RE
  };
})(window);
