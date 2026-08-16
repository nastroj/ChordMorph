/* Formát: Kytario (kytario.com)
 * Akordy {C}, pevné mezery {-} {--} {---}, značka {X}, sekce "- Ref." / "+ Ref2",
 * odkazy na sekce [Ref.], repetice |: … :| 3x
 */
(function (root) {
  'use strict';
  var M = root.CM.model, C = root.CM.chords, K = root.CM.common;

  function parse(text, opts) {
    var notation = (opts && opts.inputNotation) || 'de';
    var song = M.newSong();
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var section = null;

    function ensure() { if (!section) { section = M.newSection(null); song.sections.push(section); } return section; }

    lines.forEach(function (raw) {
      var t = raw.replace(/\s+$/, '');
      if (!t.trim()) { section = null; return; }

      var head = /^([-+])\s*(.{1,8}?)\s*$/.exec(t);
      if (head && !/\{/.test(t) && !/\[/.test(t)) {
        section = M.newSection(head[2]);
        section.chordsMobileOnly = head[1] === '+';
        song.sections.push(section);
        return;
      }

      var line = M.newLine('lyric');
      var body = K.extractRepeats(t, line);

      // Řádek tvořený pouze odkazy na sekce (a případně akordy) → nepojmenovaná sekce
      var onlyRefs = /^(\s*\[[^\]]+\]\s*)+$/.test(body);
      if (onlyRefs) {
        line.kind = 'ref';
        var re = /\[([^\]]+)\]/g, m;
        while ((m = re.exec(body)) !== null) line.refs.push(m[1].trim());
        ensure().lines.push(line);
        return;
      }

      K.parseInlineLine(body, '{', '}', notation, line);
      if (!M.hasLyrics(line) && M.chordsOf(line).length) line.kind = 'chords';
      ensure().lines.push(line);
    });

    return M.cleanup(song);
  }

  function serialize(song, opts) {
    var shift = opts.shift || 0;
    var out = [];
    var used = {};
    song.sections.forEach(function (sec, si) {
      if (si > 0) out.push('');
      if (sec.label) {
        var lbl = M.shortLabel(sec.label, 4) || String(si + 1) + '.';
        var n = 1, base = lbl;
        while (used[lbl]) { lbl = (base.replace(/\.$/, '') + (++n)).slice(0, 4); }
        used[lbl] = true;
        sec.outLabel = lbl;
        out.push((sec.chordsMobileOnly ? '+ ' : '- ') + lbl);
      }
      sec.lines.forEach(function (line) {
        if (line.kind === 'comment') { out.push('(' + line.text + ')'); return; }
        if (line.kind === 'ref') {
          var refs = line.refs.map(function (r) { return '[' + (M.shortLabel(r, 4) || r) + ']'; }).join('');
          out.push(K.repeatPrefix(line) + refs + K.repeatSuffix(line));
          return;
        }
        var s = K.repeatPrefix(line);
        if (line.kind === 'chords') {
          s += line.segments.filter(function (seg) { return seg.chord; }).map(function (seg) {
            return '{' + C.formatChord(seg.chord, shift, opts) + '}';
          }).join(' ');
          out.push(s + K.repeatSuffix(line));
          return;
        }
        var any = (line.segments || []).some(function (seg) { return !!seg.chord; });
        var body = K.buildInlineLine(line, function (ch) {
          return '{' + C.formatChord(ch, shift, opts) + '}';
        });
        // Kytario vyžaduje na každém řádku akord, nebo značku {X}
        if (!any) body = '{X}' + body;
        out.push((s + body + K.repeatSuffix(line)).replace(/\s+$/, ''));
      });
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\s+$/, '') + '\n';
  }

  function detect(text) {
    var score = 0;
    var braces = text.match(/\{[A-H][#b]?[^}\s]{0,10}\}/g);
    if (braces && braces.length >= 2) score += 0.7;
    if (/\{-{1,3}\}/.test(text)) score += 0.15;
    if (/^[-+]\s*\S{1,4}\s*$/m.test(text)) score += 0.2;
    if (/\{X\}/.test(text)) score += 0.1;
    return Math.min(score, 1);
  }

  root.CM.formats.register({
    id: 'kytario',
    name: 'Kytario',
    short: 'Kytario',
    ext: 'txt',
    mono: false,
    description: 'Značkovací jazyk zpěvníku Kytario.com — {C}, sekce „- Ref.“, odkazy [Ref.], repetice |: :|.',
    docsUrl: 'https://kytario.com/cs/dokumentace',
    parse: parse,
    serialize: serialize,
    detect: detect
  });
})(window);
