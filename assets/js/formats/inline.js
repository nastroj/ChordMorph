/* Formát: inline hranaté závorky (zjednodušený zápis bez direktiv) */
(function (root) {
  'use strict';
  var M = root.CM.model, C = root.CM.chords, K = root.CM.common;

  function parse(text, opts) {
    var notation = (opts && opts.inputNotation) || C.detectNotation(text);
    var song = M.newSong();
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var section = null;
    var i = 0;

    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { i++; continue; }
      var mm = /^([A-Za-zÁ-Žá-ž ]{2,14})\s*:\s*(.+)$/.exec(l.trim());
      if (mm && K.metaKey(mm[1]) && !/\[/.test(l)) { K.setMeta(song, mm[1], mm[2]); i++; continue; }
      if (!song.meta.title && !/\[/.test(l) && !K.looksLikeSectionLabel(l) && (!lines[i + 1] || !lines[i + 1].trim())) {
        song.meta.title = l.trim(); i++; continue;
      }
      break;
    }

    function ensure() { if (!section) { section = M.newSection(null); song.sections.push(section); } return section; }

    for (; i < lines.length; i++) {
      var raw = lines[i].replace(/\s+$/, '');
      if (!raw.trim()) { section = null; continue; }
      var withoutChords = raw.replace(/\[[^\]]*\]/g, '').trim();
      if (!withoutChords && K.looksLikeSectionLabel(raw)) { /* jen akordy */ }
      if (K.looksLikeSectionLabel(raw) && !/\[[A-H]/.test(raw)) {
        section = M.newSection(K.cleanLabel(raw));
        song.sections.push(section);
        continue;
      }
      var line = M.newLine('lyric');
      var body = K.extractRepeats(raw, line);
      K.parseInlineLine(body, '[', ']', notation, line);
      if (!M.hasLyrics(line) && M.chordsOf(line).length) line.kind = 'chords';
      ensure().lines.push(line);
    }
    return M.cleanup(song);
  }

  function serialize(song, opts) {
    var shift = opts.shift || 0;
    var out = [];
    if (song.meta.title) out.push(song.meta.title);
    if (song.meta.artist) out.push(song.meta.artist);
    if (out.length) out.push('');
    song.sections.forEach(function (sec, si) {
      if (si > 0) out.push('');
      if (sec.label) out.push(sec.label + ':');
      sec.lines.forEach(function (line) {
        if (line.kind === 'comment') { out.push('# ' + line.text); return; }
        if (line.kind === 'ref') { out.push(K.repeatPrefix(line) + line.refs.join(' - ') + K.repeatSuffix(line)); return; }
        var s = K.repeatPrefix(line) + K.buildInlineLine(line, function (ch) {
          return '[' + C.formatChord(ch, shift, opts) + ']';
        });
        out.push((s + K.repeatSuffix(line)).replace(/\s+$/, ''));
      });
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  }

  function detect(text) {
    var inline = text.match(/\[[A-H][#b]?[^\]\s]{0,10}\]/g);
    if (!inline || inline.length < 2) return 0;
    if (/\{\s*[a-z_]+\s*[:}]/i.test(text)) return 0.3; // spíš ChordPro
    return 0.8;
  }

  root.CM.formats.register({
    id: 'inline',
    name: 'Inline hranaté závorky',
    short: 'Inline []',
    ext: 'txt',
    mono: false,
    description: 'Akordy v hranatých závorkách přímo v textu, bez direktiv. Běžné na českých akordových webech.',
    parse: parse,
    serialize: serialize,
    detect: detect
  });
})(window);
