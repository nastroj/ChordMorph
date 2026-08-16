/* ChordMorph — společný mezijazyk (IR) a registr formátů.
 *
 * Každý formát implementuje:
 *   { id, name, ext, parse(text, opts) -> Song, serialize(song, opts) -> string, detect(text) -> score }
 *
 * Song {
 *   meta: { title, artist, key, capo, tempo, extra: [{name,value}] },
 *   sections: [ Section ]
 * }
 * Section { label: string|null, kind: 'named'|'unnamed', lines: [ Line ] }
 * Line {
 *   kind: 'lyric' | 'chords' | 'comment' | 'ref',
 *   segments: [ { chord: Chord|null, text: string } ],
 *   refs: [string],           // pouze kind === 'ref'
 *   text: string,             // pouze kind === 'comment'
 *   repeatOpen: bool, repeatClose: bool, repeatCount: number|null,
 *   noChords: bool            // {X} — na řádku se akordy nehrají
 * }
 */
(function (root) {
  'use strict';

  function newSong() {
    return { meta: { title: '', artist: '', key: '', capo: '', tempo: '', extra: [] }, sections: [] };
  }

  function newSection(label) {
    return { label: label || null, kind: label ? 'named' : 'unnamed', lines: [] };
  }

  function newLine(kind) {
    return {
      kind: kind || 'lyric',
      segments: [],
      refs: [],
      text: '',
      repeatOpen: false,
      repeatClose: false,
      repeatCount: null,
      noChords: false
    };
  }

  /**
   * Sjednotí mezery v řádku:
   *  - více mezer za sebou (typicky zbytek po zarovnání akordů nad textem)
   *    se smrskne na jednu,
   *  - úvodní a koncové mezery řádku zmizí.
   * Jedna mezera před slovem se ale zachová — nese informaci, že akord
   * zazní ještě před tím slovem, a ne přesně na něm.
   */
  function normalizeSpacing(line) {
    var segs = line.segments || [];
    var prevSpace = true; // začátek řádku se chová jako by mezera už byla
    segs.forEach(function (seg) {
      var t = (seg.text || '').replace(/\t/g, ' ');
      var out = '';
      for (var i = 0; i < t.length; i++) {
        var ch = t.charAt(i);
        if (ch === ' ') {
          if (prevSpace) continue;
          prevSpace = true;
        } else {
          prevSpace = false;
        }
        out += ch;
      }
      seg.text = out;
    });
    for (var j = segs.length - 1; j >= 0; j--) {
      if (!segs[j].text) continue;
      segs[j].text = segs[j].text.replace(/[ \t]+$/, '');
      break;
    }
    return line;
  }

  /** Odstraní prázdné sekce a prázdné řádky na konci sekcí. */
  function cleanup(song) {
    (song.sections || []).forEach(function (sec) {
      (sec.lines || []).forEach(function (line) {
        if (line.kind === 'lyric') normalizeSpacing(line);
      });
    });
    song.sections = (song.sections || []).filter(function (sec) {
      while (sec.lines.length && isEmptyLine(sec.lines[sec.lines.length - 1])) sec.lines.pop();
      while (sec.lines.length && isEmptyLine(sec.lines[0])) sec.lines.shift();
      return sec.lines.length > 0;
    });
    return song;
  }

  function isEmptyLine(line) {
    if (!line) return true;
    if (line.kind === 'comment') return !line.text.trim();
    if (line.kind === 'ref') return line.refs.length === 0;
    if (!line.segments.length) return true;
    return line.segments.every(function (s) {
      return !s.chord && !s.text.trim();
    });
  }

  function lineText(line) {
    return (line.segments || []).map(function (s) { return s.text; }).join('');
  }

  function hasLyrics(line) {
    return lineText(line).trim().length > 0;
  }

  function chordsOf(line) {
    return (line.segments || []).map(function (s) { return s.chord; }).filter(Boolean);
  }

  /** Vloží segment, sousední texty bez akordu spojí. */
  function pushSegment(line, chord, text) {
    if (!chord && line.segments.length && !line.segments[line.segments.length - 1].chord === false) {
      // pokračování textu za posledním akordem
    }
    if (!chord && line.segments.length) {
      var last = line.segments[line.segments.length - 1];
      last.text += text || '';
      return;
    }
    line.segments.push({ chord: chord || null, text: text || '' });
  }

  /** Zkrátí popisek sekce na max. N znaků (Kytario vyžaduje ≤ 4). */
  function shortLabel(label, max) {
    if (!label) return null;
    var l = String(label).trim().replace(/[:\]\[]/g, '');
    var map = {
      chorus: 'Ref.', refrain: 'Ref.', refrén: 'Ref.', refren: 'Ref.', ref: 'Ref.',
      verse: '1.', sloka: '1.', bridge: 'Brid', mezihra: 'Brid', intro: 'Intr',
      outro: 'Coda', coda: 'Coda', solo: 'Solo', predehra: 'Intr', dohra: 'Coda'
    };
    var key = l.toLowerCase().replace(/\s+\d+$/, '').replace(/\.$/, '');
    if (map[key]) l = map[key];
    var num = /(\d+)\s*$/.exec(String(label));
    if (map[key] && num && /^(verse|sloka)$/.test(key)) l = num[1] + '.';
    if (max && l.length > max) l = l.slice(0, max);
    return l;
  }

  var registry = [];
  function register(fmt) { registry.push(fmt); return fmt; }
  function all() { return registry.slice(); }
  function get(id) {
    for (var i = 0; i < registry.length; i++) if (registry[i].id === id) return registry[i];
    return null;
  }

  root.CM = root.CM || {};
  root.CM.model = {
    newSong: newSong,
    newSection: newSection,
    newLine: newLine,
    cleanup: cleanup,
    isEmptyLine: isEmptyLine,
    lineText: lineText,
    hasLyrics: hasLyrics,
    chordsOf: chordsOf,
    pushSegment: pushSegment,
    shortLabel: shortLabel,
    normalizeSpacing: normalizeSpacing
  };
  root.CM.formats = { register: register, all: all, get: get };
})(window);
