/* Formát: akordy nad textem (plain text) */
(function (root) {
  'use strict';
  var M = root.CM.model, C = root.CM.chords, K = root.CM.common;

  function isChordLine(raw, notation) {
    var t = raw.trim();
    if (!t) return false;
    if (K.looksLikeSectionLabel(raw) && !/^[A-H]/.test(t)) return false;
    var tokens = t.split(/\s+/);
    var real = 0;
    for (var i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      if (/^(\|:|:\||\|)$/.test(tk) || /^\d+x$/i.test(tk) || tk === '-' || tk === '/' || /^%+$/.test(tk)) continue;
      var bare = tk.replace(/^\|:/, '').replace(/:\|$/, '').replace(/,$/, '');
      if (C.isChord(bare, notation)) { real++; continue; }
      return false;
    }
    return real > 0;
  }

  function parse(text, opts) {
    var notation = (opts && opts.inputNotation) || C.detectNotation(text);
    var song = M.newSong();
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var section = null;
    var i = 0;

    // Hlavička: "Klíč: hodnota" nebo samostatný název na prvním řádku
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }
      var mm = /^([A-Za-zÁ-Žá-ž ]{2,14})\s*:\s*(.+)$/.exec(l.trim());
      if (mm && K.metaKey(mm[1])) { K.setMeta(song, mm[1], mm[2]); i++; continue; }
      if (!song.meta.title && !isChordLine(l, notation) && !K.looksLikeSectionLabel(l) &&
          (i + 1 >= lines.length || !lines[i + 1].trim() || /^[-–—]/.test(lines[i + 1].trim()))) {
        song.meta.title = l.trim();
        i++;
        if (lines[i] && /^[-–—]\s*\S/.test(lines[i].trim()) && !isChordLine(lines[i], notation)) {
          song.meta.artist = lines[i].trim().replace(/^[-–—]\s*/, '');
          i++;
        }
        continue;
      }
      break;
    }

    function ensure() { if (!section) { section = M.newSection(null); song.sections.push(section); } return section; }

    for (; i < lines.length; i++) {
      var raw = lines[i];
      if (!raw.trim()) { if (section && section.lines.length) section = null; continue; }

      if (K.looksLikeSectionLabel(raw) && !isChordLine(raw, notation)) {
        section = M.newSection(K.cleanLabel(raw));
        song.sections.push(section);
        continue;
      }

      if (/^\s*(#|\/\/)/.test(raw)) {
        var cl = M.newLine('comment');
        cl.text = raw.replace(/^\s*(#|\/\/)\s?/, '');
        ensure().lines.push(cl);
        continue;
      }

      if (isChordLine(raw, notation)) {
        var next = lines[i + 1];
        var line = M.newLine('lyric');
        var chordTokens = tokenize(raw, notation, line);
        if (next && next.trim() && !isChordLine(next, notation) && !K.looksLikeSectionLabel(next)) {
          mergeIntoSegments(line, chordTokens, next);
          i++;
        } else {
          line.kind = 'chords';
          chordTokens.forEach(function (t) { line.segments.push({ chord: t.chord, text: '' }); });
          if (!line.segments.length) line.segments.push({ chord: null, text: raw.trim() });
        }
        ensure().lines.push(line);
        continue;
      }

      var ll = M.newLine('lyric');
      var txt = K.extractRepeats(raw.replace(/\s+$/, ''), ll);
      ll.segments.push({ chord: null, text: txt });
      ensure().lines.push(ll);
    }
    return M.cleanup(song);
  }

  function tokenize(raw, notation, line) {
    var out = [];
    var re = /\S+/g, m;
    while ((m = re.exec(raw)) !== null) {
      var tk = m[0];
      if (/^\|:$/.test(tk)) { line.repeatOpen = true; continue; }
      if (/^:\|$/.test(tk)) { line.repeatClose = true; continue; }
      if (/^(\d+)x$/i.test(tk)) { line.repeatCount = parseInt(tk, 10); continue; }
      if (tk === '-' || tk === '/' || /^%+$/.test(tk)) continue;
      var bare = tk.replace(/^\|:/, '').replace(/:\|$/, '').replace(/,$/, '');
      var ch = C.parseChord(bare, notation);
      if (ch) out.push({ chord: ch, col: m.index });
    }
    return out;
  }

  function mergeIntoSegments(line, tokens, lyricRaw) {
    var lyric = lyricRaw.replace(/\s+$/, '');
    if (!tokens.length) { line.segments.push({ chord: null, text: lyric }); return; }
    var head = lyric.slice(0, Math.min(tokens[0].col, lyric.length));
    if (head) line.segments.push({ chord: null, text: head });
    for (var j = 0; j < tokens.length; j++) {
      var start = Math.min(tokens[j].col, lyric.length);
      var end = j + 1 < tokens.length ? Math.min(tokens[j + 1].col, lyric.length) : lyric.length;
      line.segments.push({ chord: tokens[j].chord, text: lyric.slice(start, end) });
    }
  }

  function serialize(song, opts) {
    var shift = opts.shift || 0;
    var out = [];
    if (song.meta.title) out.push(song.meta.title);
    if (song.meta.artist) out.push('— ' + song.meta.artist);
    var head = [];
    if (song.meta.key || opts.showKey) head.push('Tónina: ' + (C.guessKey(song, opts) ? shiftedKey(song, opts) : song.meta.key));
    if (song.meta.capo) head.push('Kapodastr: ' + song.meta.capo);
    if (song.meta.tempo) head.push('Tempo: ' + song.meta.tempo);
    if (head.length) out.push(head.join('   '));
    if (out.length) out.push('');

    song.sections.forEach(function (sec, si) {
      if (si > 0) out.push('');
      if (sec.label) out.push('[' + sec.label + ']');
      sec.lines.forEach(function (line) {
        if (line.kind === 'comment') { out.push('# ' + line.text); return; }
        if (line.kind === 'ref') { out.push(K.repeatPrefix(line) + line.refs.join(' - ') + K.repeatSuffix(line)); return; }
        if (line.kind === 'chords') {
          var names = line.segments.map(function (s) {
            return s.chord ? C.formatChord(s.chord, shift, opts) : s.text.trim();
          }).filter(Boolean);
          out.push(K.repeatPrefix(line) + names.join('  ') + K.repeatSuffix(line));
          return;
        }
        var built = K.buildOverLines(line, opts, shift);
        var pre = K.repeatPrefix(line), suf = K.repeatSuffix(line);
        if (built.chords) out.push(K.repeat(' ', pre.length) + built.chords);
        out.push(pre + built.lyrics + suf);
      });
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  }

  function shiftedKey(song, opts) { return C.guessKey(song, opts); }

  function detect(text) {
    var notation = C.detectNotation(text);
    var lines = String(text).split(/\r?\n/);
    var chordLines = 0, total = 0;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      total++;
      if (isChordLine(lines[i], notation)) chordLines++;
    }
    if (!total) return 0;
    var score = chordLines / total;
    if (/\[[A-H][^\]]{0,8}\]/.test(text) || /\{[A-H][^}]{0,8}\}/.test(text)) score *= 0.35;
    return score > 0.12 ? 0.55 + score * 0.4 : score;
  }

  root.CM.formats.register({
    id: 'over',
    name: 'Akordy nad textem',
    short: 'Nad textem',
    ext: 'txt',
    mono: true,
    description: 'Klasický zápis, kde akordy stojí na samostatném řádku nad textem.',
    parse: parse,
    serialize: serialize,
    detect: detect
  });
})(window);
