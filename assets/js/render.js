/* ChordMorph — vykreslení náhledu (akordy nad textem jako HTML) */
(function (root) {
  'use strict';
  var C = root.CM.chords, M = root.CM.model;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function nb(s) { return esc(s).replace(/ /g, '\u00a0'); }

  function renderSong(song, opts) {
    var shift = opts.shift || 0;
    var html = '';
    var titleBits = [];
    if (song.meta.title) titleBits.push('<h2 class="sheet-title">' + esc(song.meta.title) + '</h2>');
    if (song.meta.artist) titleBits.push('<p class="sheet-artist">' + esc(song.meta.artist) + '</p>');
    var chips = [];
    var key = C.guessKey(song, opts);
    if (key) chips.push('Tónina ' + esc(key));
    if (song.meta.capo) chips.push('Kapodastr ' + esc(song.meta.capo));
    if (song.meta.tempo) chips.push('Tempo ' + esc(song.meta.tempo));
    if (chips.length) titleBits.push('<p class="sheet-chips">' + chips.map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</p>');
    if (titleBits.length) html += '<header class="sheet-head">' + titleBits.join('') + '</header>';

    song.sections.forEach(function (sec) {
      html += '<section class="sheet-section">';
      if (sec.label) html += '<h3 class="sheet-label">' + esc(sec.label) + '</h3>';
      html += '<div class="sheet-lines">';
      sec.lines.forEach(function (line) {
        html += renderLine(line, opts, shift);
      });
      html += '</div></section>';
    });
    if (!song.sections.length) html += '<p class="sheet-empty">Zatím tu nic není — vlož text vlevo.</p>';
    return html;
  }

  function renderLine(line, opts, shift) {
    if (line.kind === 'comment') return '<p class="sheet-comment">' + esc(line.text) + '</p>';
    if (line.kind === 'ref') {
      return '<p class="sheet-ref">' + rep(line, esc(line.refs.join(' – '))) + '</p>';
    }
    if (line.kind === 'chords') {
      var names = line.segments.map(function (s) {
        return s.chord ? '<span class="ch">' + esc(C.formatChord(s.chord, shift, opts)) + '</span>' : '';
      }).join('<span class="dash">–</span>');
      return '<p class="sheet-chordline">' + rep(line, names) + '</p>';
    }
    var cells = line.segments.map(function (seg) {
      var chord = seg.chord ? esc(C.formatChord(seg.chord, shift, opts)) : '';
      var text = seg.text === '' ? '\u00a0' : nb(seg.text);
      return '<span class="pair"><span class="pair-chord">' + chord + '</span><span class="pair-text">' + text + '</span></span>';
    }).join('');
    return '<p class="sheet-line">' + rep(line, cells) + '</p>';
  }

  function rep(line, inner) {
    var pre = line.repeatOpen ? '<span class="rep">|:</span>' : '';
    var post = line.repeatClose
      ? '<span class="rep">:|' + (line.repeatCount > 1 ? ' ' + line.repeatCount + 'x' : '') + '</span>'
      : '';
    return pre + inner + post;
  }

  root.CM.render = { renderSong: renderSong };
})(window);
