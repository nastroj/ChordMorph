/* ChordMorph — aplikační logika */
(function () {
  'use strict';
  var CM = window.CM;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    inFormat: 'auto',
    outFormat: 'chordpro',
    outNotation: 'de',
    inNotation: 'auto',
    accidental: 'keep',
    minorStyle: 'keep',
    view: 'code',
    detected: null,
    transpose: 0,
    originalText: null
  };

  // Ukázka (vlastní text). Zapsaná v ChordPro a do formátu „nad textem“
  // převedená vlastním serializérem — zarovnání tak vždy vychází přesně.
  var SAMPLE_SOURCE = [
    '{title: Ranní tramvaj}',
    '{subtitle: ukázková píseň}',
    '',
    '{comment: 1.}',
    '[D]Ráno v tramvaji [A]svítí [Bm]lampy do [G]tmy,',
    '[D]kolej zpívá [A]pod [G]okny.',
    '',
    '{start_of_chorus}',
    '[Bm]Pojedeme [G]dál, dokud [D]město [A]spí,',
    '[Bm]ranní tramvaj [G]nás vezme [A]domů.',
    '{end_of_chorus}',
    '',
    '{comment: Solo}',
    '[D][A][Bm][G]'
  ].join('\n');

  function sampleText() {
    var o = { shift: 0, notation: 'de', inputNotation: 'en', accidental: 'sharp', minorStyle: 'keep' };
    try {
      return CM.formats.get('over').serialize(CM.formats.get('chordpro').parse(SAMPLE_SOURCE, o), o);
    } catch (e) {
      return SAMPLE_SOURCE;
    }
  }

  function opts() {
    return {
      shift: 0,
      notation: state.outNotation,
      inputNotation: state.inNotation,
      accidental: state.accidental,
      minorStyle: state.minorStyle
    };
  }

  /* ---------- inicializace ---------- */

  function fillFormatSelects() {
    var formats = CM.formats.all();
    var inSel = $('in-format');
    var autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = 'Rozpoznat automaticky';
    inSel.appendChild(autoOpt);
    formats.forEach(function (f) {
      var o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      inSel.appendChild(o);
      var o2 = document.createElement('option');
      o2.value = f.id; o2.textContent = f.name;
      $('out-format').appendChild(o2);
    });
    inSel.value = state.inFormat;
    $('out-format').value = state.outFormat;
  }

  /* ---------- převod ---------- */

  function resolveInFormat(text) {
    if (state.inFormat !== 'auto') return { id: state.inFormat, auto: false };
    var d = CM.detect(text);
    return { id: d.best, auto: true, ranking: d.ranking };
  }

  function convert() {
    var text = $('input').value;
    var autoOpt = $('in-format').querySelector('option[value="auto"]');
    
    try {
      localStorage.setItem('chordmorph_input', text);
    } catch (e) { /* ignore quota or privacy errors */ }

    if (!text.trim()) {
      $('output').value = '';
      $('preview').innerHTML = '';
      if (autoOpt) autoOpt.textContent = 'Rozpoznat automaticky';
      renderPreview(null);
      showEmptyState(true);
      return;
    }
    showEmptyState(false);

    var res = resolveInFormat(text);
    var inFmt = CM.formats.get(res.id);
    var outFmt = CM.formats.get(state.outFormat);
    if (!inFmt || !outFmt) return;

    if (res.auto) {
      state.inFormat = res.id;
      $('in-format').value = res.id;
      if (autoOpt) autoOpt.textContent = 'Rozpoznat automaticky';
      updateSettingsSummary();
    } else {
      if (autoOpt) autoOpt.textContent = 'Rozpoznat automaticky';
    }

    var o = opts();
    try {
      var song = inFmt.parse(text, o);
      // v režimu „zachovat původní“ potřebujeme vědět, jaká posuvka v písni převažuje
      if (o.accidental === 'keep') o.fallbackAccidental = CM.chords.dominantAccidental(song);
      var out = outFmt.serialize(song, o);
      $('output').value = out;
      $('output').classList.toggle('is-mono', !!outFmt.mono);
      renderPreview(song, o);
      var key = CM.chords.guessKey(song, o);
    } catch (e) {
      $('output').value = 'Převod se nepovedl: ' + e.message;
      console.error(e);
    }
  }

  /** Přepne nabídku „zatím není co převádět" nad výstupním panelem. */
  function showEmptyState(on) {
    $('output-empty').classList.toggle('is-visible', !!on);
  }

  /** Načte textový soubor do vstupu (ze souborového dialogu i z přetažení). */
  function loadFile(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      $('input').value = String(r.result);
      $('in-format').value = 'auto'; state.inFormat = 'auto';
      convert();
      toast('Načteno: ' + file.name);
    };
    r.readAsText(file, 'utf-8');
  }

  /** Text písně lze do vstupu i přetáhnout myší — nad vstupem se ukáže rámeček. */
  function setupDropZone() {
    var body = $('input-body');
    var depth = 0;
    function show(on) { body.classList.toggle('is-dragover', !!on); }
    document.addEventListener('dragenter', function (e) { e.preventDefault(); depth++; show(true); });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('dragleave', function () { depth = Math.max(0, depth - 1); if (!depth) show(false); });
    document.addEventListener('drop', function (e) {
      e.preventDefault(); depth = 0; show(false);
      loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  function renderPreview(song, o) {
    var el = $('preview');
    if (!song) { el.innerHTML = '<p class="sheet-empty">Náhled se zobrazí, až vložíš text.</p>'; return; }
    el.innerHTML = CM.render.renderSong(song, o);
  }

  /* ---------- lišta nastavení ---------- */

  var settingsOpen = false;

  function toggleSettings(open) {
    var btn = $('btn-settings');
    var panel = $('settings-panel');
    var next = typeof open === 'boolean' ? open : !settingsOpen;
    btn.setAttribute('aria-expanded', String(next));
    panel.hidden = !next;
    settingsOpen = next;
  }

  /**
   * Do sbalené lišty vypíše jen ta nastavení, která se liší od výchozích —
   * uživatel tak vidí, co je aktivní, aniž by musel panel rozbalovat.
   */
  function updateSettingsSummary() {
    var parts = [];
    if (state.outNotation !== 'de') parts.push('anglická notace');
    if (state.inNotation !== 'auto') parts.push('vstup ' + (state.inNotation === 'de' ? 'CZ' : 'EN'));
    if (state.accidental === 'sharp') parts.push('křížky');
    if (state.accidental === 'flat') parts.push('bé');
    if (state.minorStyle !== 'keep') parts.push('moll ' + state.minorStyle);
    $('settings-summary').textContent = parts.length ? '· ' + parts.join(' · ') : '';
  }

  /* ---------- UI události ---------- */

  var debounceId = null;
  function schedule() {
    clearTimeout(debounceId);
    debounceId = setTimeout(convert, 90);
  }

  function bind() {
    $('input').addEventListener('input', function() {
      state.transpose = 0;
      $('tr-value').textContent = '0';
      state.originalText = null;
      schedule();
    });
    $('in-format').addEventListener('change', function () { state.inFormat = this.value; convert(); });
    $('out-format').addEventListener('change', function () { state.outFormat = this.value; convert(); });
    $('out-notation').addEventListener('change', function () { state.outNotation = this.value; convert(); updateSettingsSummary(); });
    $('in-notation').addEventListener('change', function () { state.inNotation = this.value; convert(); updateSettingsSummary(); });
    $('accidental').addEventListener('change', function () { state.accidental = this.value; convert(); updateSettingsSummary(); });
    $('minor-style').addEventListener('change', function () { state.minorStyle = this.value; convert(); updateSettingsSummary(); });
    $('btn-settings').addEventListener('click', function () { toggleSettings(); });

    $('tr-up').addEventListener('click', function () { setTranspose(1); });
    $('tr-down').addEventListener('click', function () { setTranspose(-1); });

    function insertSample() {
      $('input').value = sampleText();
      $('in-format').value = 'auto'; state.inFormat = 'auto';
      convert();
      toast('Ukázka vložena');
    }
    $('btn-sample').addEventListener('click', insertSample);
    $('btn-sample-2').addEventListener('click', insertSample);
    
    var clearDialog = $('clear-dialog');
    $('btn-clear').addEventListener('click', function () {
      if (!$('input').value.trim()) return; // Not really anything to clear
      if (clearDialog && clearDialog.showModal) {
        clearDialog.showModal();
      } else {
        // Fallback for browsers that don't support dialog
        if (confirm('Opravdu chcete vymazat celý text?')) {
          $('input').value = ''; convert(); $('input').focus();
        }
      }
    });
    
    $('btn-clear-cancel').addEventListener('click', function() {
      if (clearDialog && clearDialog.close) clearDialog.close();
    });
    
    $('btn-clear-confirm').addEventListener('click', function() {
      if (clearDialog && clearDialog.close) clearDialog.close();
      $('input').value = '';
      state.inFormat = 'auto';
      $('in-format').value = 'auto';
      convert(); 
      $('input').focus();
    });
    
    var searchPanel = $('search-panel');
    var btnToggleSearch = $('btn-toggle-search');
    var btnCloseSearch = $('btn-close-search');

    function toggleSearch() {
      var isHidden = searchPanel.hidden;
      searchPanel.hidden = !isHidden;
      if (isHidden) {
        btnToggleSearch.style.background = 'var(--accent-soft)';
        btnToggleSearch.style.color = 'var(--accent)';
        $('sr-search').focus({ preventScroll: true });
        window.requestAnimationFrame(function () {
          searchPanel.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
      } else {
        btnToggleSearch.style.background = '';
        btnToggleSearch.style.color = '';
      }
    }

    btnToggleSearch.addEventListener('click', toggleSearch);
    
    if (btnCloseSearch) {
      btnCloseSearch.addEventListener('click', function() {
        searchPanel.hidden = true;
        btnToggleSearch.style.background = '';
        btnToggleSearch.style.color = '';
      });
    }

    function getSearchRegex() {
      var findStr = $('sr-search').value;
      if (!findStr) return null;
      var isCaseSensitive = $('sr-case').checked;
      var isWord = $('sr-word').checked;
      var isRegex = $('sr-regex').checked;
      var escapedFind = isRegex ? findStr : findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (isWord) {
        escapedFind = '\\b' + escapedFind + '\\b';
      }
      var flags = 'g' + (isCaseSensitive ? '' : 'i');
      try {
        return new RegExp(escapedFind, flags);
      } catch (e) {
        return null;
      }
    }

    function findNext(reverse) {
      var re = getSearchRegex();
      if (!re) {
        toast('Prázdný nebo neplatný výraz');
        return false;
      }
      var input = $('input');
      var text = input.value;
      
      var matches = [];
      var match;
      while ((match = re.exec(text)) !== null) {
        matches.push({ index: match.index, length: match[0].length });
        if (!re.global) break;
      }
      
      if (matches.length === 0) {
        toast('Nenalezeno');
        return false;
      }
      
      var cursorPos = input.selectionEnd || 0;
      var cursorStart = input.selectionStart || 0;
      var targetMatch = null;
      
      if (reverse) {
        for (var i = matches.length - 1; i >= 0; i--) {
          if (matches[i].index < cursorStart) {
            targetMatch = matches[i];
            break;
          }
        }
        if (!targetMatch) targetMatch = matches[matches.length - 1];
      } else {
        for (var j = 0; j < matches.length; j++) {
          if (matches[j].index >= cursorPos) {
            targetMatch = matches[j];
            break;
          }
        }
        if (!targetMatch) targetMatch = matches[0];
      }
      
      if (targetMatch) {
        input.focus();
        input.setSelectionRange(targetMatch.index, targetMatch.index + targetMatch.length);
        var lineNumber = text.slice(0, targetMatch.index).split('\n').length - 1;
        var inputStyle = getComputedStyle(input);
        var lineHeight = parseFloat(inputStyle.lineHeight) || 0;
        var paddingTop = parseFloat(inputStyle.paddingTop) || 0;
        var targetTop = paddingTop + lineNumber * lineHeight;
        function revealMatch() {
          var panelRect = searchPanel.getBoundingClientRect();
          var inputRect = input.getBoundingClientRect();
          var overlapsInput = panelRect.bottom > inputRect.top && panelRect.top < inputRect.bottom;
          var coveredTop = overlapsInput ? Math.min(input.clientHeight, Math.max(0, panelRect.bottom - inputRect.top)) : 0;
          var visibleHeight = Math.max(lineHeight, input.clientHeight - coveredTop);
          var targetScrollTop = targetTop - coveredTop - Math.max(0, (visibleHeight - lineHeight) / 2);
          var maxScrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
          input.scrollTop = Math.min(maxScrollTop, Math.max(0, targetScrollTop));
        }
        revealMatch();
        window.requestAnimationFrame(function () {
          revealMatch();
        });
        return true;
      }
      return false;
    }

    $('btn-find-next').addEventListener('click', function() { findNext(false); });
    $('btn-find-prev').addEventListener('click', function() { findNext(true); });
    $('btn-find').addEventListener('click', function() { findNext(false); });

    $('btn-replace').addEventListener('click', function() {
      var input = $('input');
      var selStart = input.selectionStart;
      var selEnd = input.selectionEnd;
      if (selStart === selEnd) {
         if (!findNext(false)) return;
         return;
      }
      
      var re = getSearchRegex();
      if (!re) return;
      var text = input.value;
      var selectedText = text.substring(selStart, selEnd);
      
      var match;
      var isMatch = false;
      while ((match = re.exec(text)) !== null) {
        if (match.index === selStart && match[0].length === (selEnd - selStart)) {
           isMatch = true;
           break;
        }
      }
      
      if (!isMatch) {
         findNext(false);
         return;
      }
      
      var replaceStr = $('sr-replace').value;
      var newText = selectedText.replace(new RegExp(re.source, re.flags.replace('g', '')), replaceStr);
      
      input.setRangeText(newText, selStart, selEnd, 'end');
      convert();
      findNext(false);
    });

    $('btn-replace-all').addEventListener('click', function() {
      var re = getSearchRegex();
      if (!re) return;
      var replaceStr = $('sr-replace').value;
      var text = $('input').value;
      var originalText = text;

      try {
        var newText = text.replace(re, replaceStr);
        if (newText !== originalText) {
          $('input').value = newText;
          convert();
          toast('Nahrazeno');
        } else {
          toast('Nenalezeno');
        }
      } catch (e) {
        toast('Chyba ve výrazu');
      }
    });

    $('btn-swap').addEventListener('click', function () {
      var current = state.inFormat === 'auto' ? (state.detected || resolveInFormat($('input').value).id) : state.inFormat;
      var text = $('output').value;
      if (!text.trim()) { toast('Není co prohodit'); return; }
      $('input').value = text;
      $('in-format').value = state.outFormat; state.inFormat = state.outFormat;
      $('out-format').value = current; state.outFormat = current;
      convert();
      toast('Formáty prohozeny');
    });

    $('btn-copy').addEventListener('click', function () {
      var val = $('output').value;
      if (!val) { toast('Výstup je prázdný'); return; }
      copyText(val);
    });
    $('btn-download').addEventListener('click', download);

    setupDropZone();

    $('file-input').addEventListener('change', function (e) {
      loadFile(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

    $('btn-toggle-preview').addEventListener('click', function () { 
      setView(state.view === 'code' ? 'preview' : 'code'); 
    });

    $('btn-theme').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
    });

    $('tr-value').addEventListener('click', function () {
      if (state.transpose !== 0) {
        if (state.originalText !== null) {
          $('input').value = state.originalText;
          state.originalText = null;
        }
        state.transpose = 0;
        $('tr-value').textContent = '0';
        convert();
        toast('Vráceno do původní tóniny');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'ArrowUp') { e.preventDefault(); setTranspose(1); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setTranspose(-1); }
    });

  }

  function setTranspose(delta) {
    var newT = state.transpose + delta;
    if (newT > 11) newT = 11;
    if (newT < -11) newT = -11;

    if (state.originalText === null) {
      state.originalText = $('input').value;
    }
    
    var text = state.originalText;
    if (!text.trim()) return;

    var res = resolveInFormat(text);
    var inFmt = CM.formats.get(res.id);
    if (!inFmt) return;

    var o = opts();
    try {
      var song = inFmt.parse(text, o);
      var outOpts = Object.assign({}, o, { shift: newT });
      var outText = inFmt.serialize(song, outOpts);
      
      $('input').value = outText;
      state.transpose = newT;
      $('tr-value').textContent = (newT > 0 ? '+' : '') + newT;
      convert();
      toast(delta > 0 ? 'Transponováno výš' : 'Transponováno níž');
    } catch (e) {
      toast('Nelze transponovat chybějící nebo vadný vstup');
    }
  }

  function setView(v) {
    state.view = v;
    var code = v === 'code';
    $('output').hidden = !code;
    $('preview').hidden = code;
    $('btn-toggle-preview').classList.toggle('is-active', !code);
    $('btn-toggle-preview').title = code ? 'Zobrazit náhled s akordy' : 'Zobrazit zdrojový kód';
  }

  function copyText(val) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(val).then(function () { toast('Zkopírováno do schránky'); },
        function () { fallbackCopy(val); });
    } else fallbackCopy(val);
  }
  function fallbackCopy(val) {
    var ta = $('output');
    ta.removeAttribute('readonly');
    ta.select();
    try { document.execCommand('copy'); toast('Zkopírováno do schránky'); }
    catch (e) { toast('Kopírování se nepovedlo'); }
    ta.setAttribute('readonly', 'readonly');
    window.getSelection().removeAllRanges();
  }

  function download() {
    var val = $('output').value;
    if (!val) { toast('Výstup je prázdný'); return; }
    var fmt = CM.formats.get(state.outFormat);
    var song;
    try { song = CM.formats.get(resolveInFormat($('input').value).id).parse($('input').value, opts()); } catch (e) { song = null; }
    var base = (song && song.meta.title ? slug(song.meta.title) : 'pisen') + '-' + fmt.id;
    var blob = new Blob([val], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = base + '.' + fmt.ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Soubor uložen');
  }

  function slug(s) {
    return s.toLowerCase()
      .normalize ? s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'pisen';
  }

  var toastId = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.add('is-visible');
    clearTimeout(toastId);
    toastId = setTimeout(function () {
      el.classList.remove('is-visible');
      setTimeout(function () { el.hidden = true; }, 220);
    }, 1800);
  }

  /* ---------- start ---------- */
  function init() {
    if (window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    fillFormatSelects();
    bind();
    toggleSettings(false);
    updateSettingsSummary();
    setView('code');
    
    try {
      var saved = localStorage.getItem('chordmorph_input');
      if (saved !== null) {
        $('input').value = saved;
      } else {
        $('input').value = sampleText();
      }
    } catch (e) {
      $('input').value = sampleText();
    }
    
    convert();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
