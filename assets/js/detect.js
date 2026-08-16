/* ChordMorph — autodetekce vstupního formátu */
(function (root) {
  'use strict';
  root.CM = root.CM || {};
  root.CM.detect = function (text) {
    var results = root.CM.formats.all().map(function (f) {
      var score = 0;
      try { score = f.detect ? f.detect(text) : 0; } catch (e) { score = 0; }
      return { id: f.id, name: f.name, score: score || 0 };
    }).sort(function (a, b) { return b.score - a.score; });
    return { best: results[0] && results[0].score > 0.15 ? results[0].id : 'over', ranking: results };
  };
})(window);
