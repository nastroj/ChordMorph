/* ChordMorph — pomůcky společné pro více formátů. */
(function (root) {
  'use strict';
  var M = root.CM.model;
  var C = root.CM.chords;

  var META_ALIASES = {
    title: 'title', t: 'title', nazev: 'title', název: 'title', song: 'title', skladba: 'title', píseň: 'title', pisen: 'title',
    subtitle: 'artist', artist: 'artist', st: 'artist', interpret: 'artist', autor: 'artist', author: 'artist', kapela: 'artist', band: 'artist',
    key: 'key', tonina: 'key', tónina: 'key',
    capo: 'capo', kapodastr: 'capo', kapo: 'capo',
    tempo: 'tempo', bpm: 'tempo'
  };

  var SECTION_WORDS = /^(ref(?:rén|ren|rain)?|chorus|verse|sloka|bridge|mezihra|intro|předehra|predehra|outro|dohra|coda|solo|instrumental|recitativ|vsuvka|pre-?chorus)\b/i;

  function metaKey(name) {
    var k = String(name || '').trim().toLowerCase();
    return META_ALIASES[k] || null;
  }

  function setMeta(song, name, value) {
    var k = metaKey(name);
    if (k) song.meta[k] = String(value).trim();
    else song.meta.extra.push({ name: String(name).trim(), value: String(value).trim() });
  }

  /** Vypadá řádek jako popisek sekce? */
  function looksLikeSectionLabel(line) {
    var t = line.trim();
    if (!t || t.length > 28) return false;
    if (/^\[.+\]$/.test(t)) return true;                 // [Verse 1]
    if (/^\d{1,2}[.)]$/.test(t)) return true;             // 1.
    if (/^[-+]\s*\S{1,6}$/.test(t)) return true;          // - Ref.
    if (/:$/.test(t) && SECTION_WORDS.test(t)) return true;
    if (SECTION_WORDS.test(t) && t.split(/\s+/).length <= 3) return true;
    if (/^(R|Ref|Refr)\s*[:.]?\s*\d?$/i.test(t)) return true;
    return false;
  }

  function cleanLabel(line) {
    return String(line).trim().replace(/^\[|\]$/g, '').replace(/^[-+]\s*/, '').replace(/:$/, '').trim();
  }

  var REPEAT_OPEN = /\|:/;
  var REPEAT_CLOSE = /:\|/;

  /** Vyjme z textu repetiční značky a uloží je do metadat řádku. */
  function extractRepeats(text, line) {
    var t = text;
    if (REPEAT_OPEN.test(t)) { line.repeatOpen = true; t = t.replace(/\|:\s?/g, ''); }
    var cnt = /:\|\s*(\d+)\s*x/i.exec(t);
    if (cnt) line.repeatCount = parseInt(cnt[1], 10);
    if (REPEAT_CLOSE.test(t)) { line.repeatClose = true; t = t.replace(/\s?:\|(\s*\d+\s*x)?/gi, ''); }
    return t;
  }

  function repeatPrefix(line) { return line.repeatOpen ? '|: ' : ''; }
  function repeatSuffix(line) {
    if (!line.repeatClose) return '';
    return ' :|' + (line.repeatCount && line.repeatCount > 1 ? ' ' + line.repeatCount + 'x' : '');
  }

  /**
   * Poskládá řádek se značkami akordů uvnitř textu (ChordPro, inline, Kytario).
   * Hlídá mezery kolem značek:
   *  - akord, na který se nic nezpívá (mezihra nebo dozvuk za koncem verše),
   *    se od okolí oddělí mezerou, aby značky nesplývaly v jeden shluk,
   *  - akord stojící ve vstupu před slovem se oddělí mezerou i zleva,
   *    aby nesplynul s předchozím slovem,
   *  - dvě a více mezer za sebou se smrskne na jednu,
   *  - koncová mezera zmizí.
   * Jedna mezera mezi značkou a slovem zůstane — akord tak zazní ještě
   * před slovem, přesně jak byl zapsaný na vstupu.
   */
  function buildInlineLine(line, wrap) {
    var segs = line.segments || [];
    var out = '';
    segs.forEach(function (seg) {
      var text = seg.text || '';
      if (seg.chord) {
        // akord, na který se nic nezpívá, nebo akord stojící před slovem
        var detached = !text.trim() || /^[ \t]/.test(text);
        if (detached && out && !/[ \t]$/.test(out)) out += ' ';
        out += wrap(seg.chord);
      }
      out += text;
    });
    return out.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '');
  }

  /** Rozdělí text s inline akordy v zadaných značkách na segmenty. */
  function parseInlineLine(text, open, close, notation, line) {
    var re = new RegExp(escapeRe(open) + '([^' + escapeRe(close) + ']*)' + escapeRe(close), 'g');
    var pos = 0, m;
    var pending = '';
    while ((m = re.exec(text)) !== null) {
      pending += text.slice(pos, m.index);
      var inner = m[1];
      if (inner === 'X' || inner === 'x') {
        line.noChords = true;
      } else if (/^-{1,3}$/.test(inner)) {
        pending += inner.length === 1 ? ' ' : inner.length === 2 ? '  ' : '   ';
      } else {
        var ch = C.parseChord(inner, notation);
        if (ch) {
          line.segments.push({ chord: ch, text: '' });
          // text patřící tomuto akordu doplní následující iterace
          if (pending) {
            // text před akordem připojíme k předchozímu segmentu
            var idx = line.segments.length - 2;
            if (idx >= 0) line.segments[idx].text += pending;
            else line.segments.unshift({ chord: null, text: pending });
            pending = '';
          }
        } else {
          pending += m[0];
        }
      }
      pos = m.index + m[0].length;
    }
    pending += text.slice(pos);
    if (pending) {
      if (line.segments.length) line.segments[line.segments.length - 1].text += pending;
      else line.segments.push({ chord: null, text: pending });
    }
    if (!line.segments.length) line.segments.push({ chord: null, text: '' });
    return line;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Vyskládá dvojici řádků (akordy nad textem) se správným zarovnáním. */
  function buildOverLines(line, opts, shift) {
    var chordLine = '';
    var lyricLine = '';
    (line.segments || []).forEach(function (seg) {
      if (seg.chord) {
        var label = C.formatChord(seg.chord, shift, opts);
        var col = lyricLine.length;
        if (chordLine.length > col) {
          lyricLine += repeat(' ', chordLine.length - col);
          col = chordLine.length;
        }
        chordLine += repeat(' ', col - chordLine.length) + label + ' ';
      }
      lyricLine += seg.text;
    });
    return { chords: chordLine.replace(/\s+$/, ''), lyrics: lyricLine.replace(/\s+$/, '') };
  }

  function repeat(s, n) { return n > 0 ? new Array(n + 1).join(s) : ''; }

  root.CM.common = {
    META_ALIASES: META_ALIASES,
    metaKey: metaKey,
    setMeta: setMeta,
    looksLikeSectionLabel: looksLikeSectionLabel,
    cleanLabel: cleanLabel,
    extractRepeats: extractRepeats,
    repeatPrefix: repeatPrefix,
    repeatSuffix: repeatSuffix,
    parseInlineLine: parseInlineLine,
    buildInlineLine: buildInlineLine,
    buildOverLines: buildOverLines,
    repeat: repeat
  };
})(window);
