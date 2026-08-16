/* Formát: ChordPro */
(function (root) {
  'use strict';
  var M = root.CM.model, C = root.CM.chords, K = root.CM.common;

  var ENV_START = /^(start_of_chorus|soc|start_of_verse|sov|start_of_bridge|sob|start_of_tab|sot|start_of_grid|sog)$/i;
  var ENV_END = /^(end_of_chorus|eoc|end_of_verse|eov|end_of_bridge|eob|end_of_tab|eot|end_of_grid|eog)$/i;

  function envLabel(name) {
    var n = name.toLowerCase();
    if (/chorus/.test(n) || n === 'soc') return 'Ref.';
    if (/bridge/.test(n) || n === 'sob') return 'Brid';
    if (/tab/.test(n) || n === 'sot') return 'Tab';
    if (/grid/.test(n) || n === 'sog') return 'Grid';
    return null;
  }

  function parse(text, opts) {
    var notation = (opts && opts.inputNotation) || C.detectNotation(text);
    var song = M.newSong();
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var section = null;
    var verseNo = 0;
    var pendingLabel = null;

    function ensure(label) {
      if (label !== undefined && label !== null) {
        section = M.newSection(label);
        song.sections.push(section);
        return section;
      }
      if (!section) { section = M.newSection(null); song.sections.push(section); }
      return section;
    }

    lines.forEach(function (raw) {
      var t = raw.replace(/\s+$/, '');
      if (!t.trim()) { section = null; return; }
      if (/^\s*#/.test(t)) return; // komentář zdrojáku

      var dir = /^\s*\{\s*([a-z_]+)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/i.exec(t);
      if (dir) {
        var name = dir[1], val = dir[2] || '';
        if (ENV_START.test(name)) {
          var lbl = envLabel(name);
          if (!lbl) { verseNo++; lbl = verseNo + '.'; }
          ensure(pendingLabel || lbl);
          pendingLabel = null;
          return;
        }
        if (ENV_END.test(name)) { section = null; return; }
        if (/^(c|comment|comment_italic|ci|comment_box|cb)$/i.test(name)) {
          if (K.looksLikeSectionLabel(val)) { pendingLabel = K.cleanLabel(val); ensure(pendingLabel); pendingLabel = null; return; }
          var cl = M.newLine('comment'); cl.text = val; ensure().lines.push(cl); return;
        }
        if (/^(define|chord|new_page|np|column_break|colb|textfont|textsize|chordfont|chordsize|no_grid|grid|highlight)$/i.test(name)) return;
        K.setMeta(song, name, val);
        return;
      }

      var line = M.newLine('lyric');
      var body = K.extractRepeats(t, line);
      K.parseInlineLine(body, '[', ']', notation, line);
      if (!M.hasLyrics(line) && M.chordsOf(line).length) line.kind = 'chords';
      ensure().lines.push(line);
    });

    return M.cleanup(song);
  }

  function serialize(song, opts) {
    var shift = opts.shift || 0;
    var out = [];
    if (song.meta.title) out.push('{title: ' + song.meta.title + '}');
    if (song.meta.artist) out.push('{subtitle: ' + song.meta.artist + '}');
    var key = C.guessKey(song, opts);
    if (key) out.push('{key: ' + key + '}');
    if (song.meta.capo) out.push('{capo: ' + song.meta.capo + '}');
    if (song.meta.tempo) out.push('{tempo: ' + song.meta.tempo + '}');
    (song.meta.extra || []).forEach(function (e) { out.push('{' + e.name + ': ' + e.value + '}'); });
    if (out.length) out.push('');

    song.sections.forEach(function (sec, si) {
      if (si > 0) out.push('');
      var isChorus = sec.label && /^ref/i.test(sec.label);
      if (isChorus) out.push('{start_of_chorus}');
      else if (sec.label) out.push('{comment: ' + sec.label + '}');

      sec.lines.forEach(function (line) {
        if (line.kind === 'comment') { out.push('{comment: ' + line.text + '}'); return; }
        if (line.kind === 'ref') { out.push('{comment: ' + K.repeatPrefix(line) + line.refs.join(' - ') + K.repeatSuffix(line) + '}'); return; }
        var s = K.repeatPrefix(line) + K.buildInlineLine(line, function (ch) {
          return '[' + C.formatChord(ch, shift, opts) + ']';
        });
        out.push((s + K.repeatSuffix(line)).replace(/\s+$/, ''));
      });
      if (isChorus) out.push('{end_of_chorus}');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  }

  function detect(text) {
    var score = 0;
    if (/\{\s*(title|t|subtitle|st|artist|start_of_chorus|soc|end_of_chorus|eoc|comment|c|key|capo)\s*[:}]/i.test(text)) score += 0.6;
    var inline = text.match(/\[[A-H][#b]?[^\]\s]{0,10}\]/g);
    if (inline && inline.length >= 2) score += 0.35;
    return Math.min(score, 1);
  }

  root.CM.formats.register({
    id: 'chordpro',
    name: 'ChordPro',
    short: 'ChordPro',
    ext: 'cho',
    mono: true,
    description: 'Standard s akordy v hranatých závorkách a direktivami {title}, {start_of_chorus}.',
    parse: parse,
    serialize: serialize,
    detect: detect
  });
})(window);
