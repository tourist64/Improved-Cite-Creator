/**
 * Runs automatically on every page. Computes the cite, shows it in a small
 * floating box, and handles the keyboard shortcuts:
 *   - copy the cite (optionally with the selected text)
 *   - override author/quals/date/title/publication from the page selection
 *
 * The box lives in a shadow root so page CSS can't affect it.
 */
(function () {
  if (window.__citeCreatorLoaded) return;
  window.__citeCreatorLoaded = true;

  var DEFAULT_SETTINGS = {
    enabled: true,
    position: 'bottom-right',
    copySelectedWithCite: false,
    hideRatings: false,
    largeFont: false,
    useSlashDate: false,
    debugMode: false,
    citeFormatMode: 'custom',
    customTemplate: window.CiteCreatorFormat.DEFAULT_CUSTOM,
    dateFormat: 'M-d-yyyy',
    yearFormat: '2',
    shortcuts: {
      copy: 'ctrl+alt+c',
      author: 'ctrl+alt+1',
      quals: 'ctrl+alt+2',
      date: 'ctrl+alt+3',
      title: 'ctrl+alt+4',
      publication: 'ctrl+alt+5'
    }
  };

  var FIELD_LABELS = {
    author: 'Author',
    quals: 'Qualifications',
    date: 'Date',
    title: 'Title',
    publication: 'Publication'
  };

  var CSS_TEXT = [
    ':host, * { box-sizing: border-box; }',
    '.box { width: 340px; max-height: 300px; overflow: auto; background: #1f1f1f; color: #f1f1f1;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;',
    '  font-size: 11px; border-radius: 6px; box-shadow: 0 4px 18px rgba(0,0,0,0.4);',
    '  padding: 7px 9px 9px; position: relative; }',
    '.box.large-font { font-size: 14px; width: 400px; }',
    '.box.minimized { width: auto; }',
    '.box.minimized .cite, .box.minimized .hint { display: none; }',
    '.header { display: flex; align-items: center; gap: 6px; }',
    '.grade { font-weight: 700; font-size: 10px; padding: 2px 6px; border-radius: 3px;',
    '  background: #8a8a1a; color: #fff; letter-spacing: .3px; }',
    '.grade[data-tier="good"] { background: #1e7e34; }',
    '.grade[data-tier="ok"] { background: #8a8a1a; }',
    '.grade[data-tier="meh"] { background: #b06a12; }',
    '.grade[data-tier="bad"] { background: #a12b2b; }',
    '.spacer { flex: 1; }',
    'button { background: transparent; border: none; color: #bbb; cursor: pointer; font-size: 14px;',
    '  line-height: 1; padding: 1px 4px; font-family: inherit; }',
    'button:hover { color: #fff; }',
    '.cite { white-space: pre-wrap; word-break: break-word; line-height: 1.45; margin-top: 6px;',
    '  user-select: text; -webkit-user-select: text; }',
    '.hint { margin-top: 6px; color: #8a8a8a; font-size: 9px; }',
    '.flash { position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex;',
    '  align-items: center; justify-content: center; background: rgba(0,0,0,0.82); color: #fff;',
    '  font-weight: 600; font-size: 12px; opacity: 0; pointer-events: none;',
    '  transition: opacity .12s ease; border-radius: 6px; text-align: center; padding: 8px; }',
    '.flash.show { opacity: 1; }'
  ].join('\n');

  var state = {
    settings: DEFAULT_SETTINGS,
    data: null,
    sources: null,
    overrides: {},
    citeText: '',
    minimized: false,
    closed: false
  };

  var shadowHost = null;
  var shadowRoot = null;
  var boxEl = null;
  var gradeEl = null;
  var citeEl = null;
  var flashTimer = null;

  function effectiveDateFormat() {
    var pattern = state.settings.dateFormat || DEFAULT_SETTINGS.dateFormat;
    return state.settings.useSlashDate ? pattern.replace(/-/g, '/') : pattern;
  }

  function loadSettingsAndRun() {
    chrome.storage.sync.get(DEFAULT_SETTINGS, function (stored) {
      state.settings = stored;
      if (!stored.enabled) {
        destroyBox();
        return;
      }
      runExtraction();
    });
  }

  function runExtraction() {
    var result;
    try {
      result = window.CiteCreatorExtractor.extract(document, location.href, {
        dateFormat: effectiveDateFormat(),
        yearFormat: state.settings.yearFormat
      });
    } catch (e) {
      if (state.settings.debugMode) console.error('[Cite Creator] extraction failed', e);
      return;
    }
    state.data = result.data;
    state.sources = result.sources;
    applyOverridesAndRender();
  }

  function applyOverridesAndRender() {
    if (!state.data) return;
    var d = {};
    var s = {};
    Object.keys(state.data).forEach(function (k) { d[k] = state.data[k]; });
    Object.keys(state.sources).forEach(function (k) { s[k] = state.sources[k]; });

    if (state.overrides.author) {
      var parts = window.CiteCreatorExtractor.splitName(state.overrides.author, false);
      d.first = parts.first;
      d.last = parts.last;
      d.isOrgAuthor = false;
      s.author = 'manual';
    }
    if (state.overrides.quals) {
      d.quals = state.overrides.quals;
      s.quals = 'manual';
    }
    if (state.overrides.title) {
      d.title = state.overrides.title;
      s.title = 'manual';
    }
    if (state.overrides.publication) {
      d.publication = state.overrides.publication;
      s.publication = 'manual';
    }
    if (state.overrides.date) {
      var raw = state.overrides.date;
      var parsed = window.CiteCreatorExtractor.parseFlexibleDate(raw);
      if (parsed) {
        d.date = window.CiteCreatorExtractor.formatDate(parsed, effectiveDateFormat());
        d.year = window.CiteCreatorExtractor.formatDate(
          parsed,
          state.settings.yearFormat === '4' ? 'yyyy' : 'yy'
        );
      } else {
        d.date = raw.trim();
        var ym = /\b(19|20)\d{2}\b/.exec(raw);
        if (ym) d.year = state.settings.yearFormat === '4' ? ym[0] : ym[0].slice(-2);
      }
      s.date = 'manual';
    }

    d.accessed = window.CiteCreatorExtractor.formatDate(new Date(), effectiveDateFormat());

    state.renderData = d;
    state.renderSources = s;
    render();
  }

  function currentTemplate() {
    return window.CiteCreatorFormat.templateFor(
      state.settings.citeFormatMode,
      state.settings.customTemplate
    );
  }

  function render() {
    if (state.closed || !state.settings.enabled || !state.renderData) return;
    ensureBox();
    applyPosition();

    state.citeText = window.CiteCreatorFormat.buildCitation(currentTemplate(), state.renderData);
    citeEl.textContent = state.citeText;

    var g = window.CiteCreatorExtractor.grade(state.renderSources);
    gradeEl.textContent = g.letter;
    gradeEl.setAttribute('data-tier', g.tier);
    gradeEl.style.display = state.settings.hideRatings ? 'none' : '';

    boxEl.className = 'box' +
      (state.settings.largeFont ? ' large-font' : '') +
      (state.minimized ? ' minimized' : '');

    shadowRoot.querySelector('.hint').textContent = state.settings.shortcuts.copy + ' to copy';

    if (state.settings.debugMode) {
      console.log('[Cite Creator] sources:', state.renderSources, 'grade:', g, 'data:', state.renderData);
    }
  }

  function ensureBox() {
    if (shadowHost && document.documentElement.contains(shadowHost)) return;
    shadowHost = document.createElement('div');
    shadowHost.id = 'cite-creator-root';
    document.documentElement.appendChild(shadowHost);
    shadowRoot = shadowHost.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = CSS_TEXT;
    shadowRoot.appendChild(style);

    boxEl = document.createElement('div');
    boxEl.className = 'box';

    var header = document.createElement('div');
    header.className = 'header';

    gradeEl = document.createElement('span');
    gradeEl.className = 'grade';

    var spacer = document.createElement('span');
    spacer.className = 'spacer';

    var minBtn = document.createElement('button');
    minBtn.textContent = '−';
    minBtn.title = 'Minimize';
    minBtn.addEventListener('click', function () {
      state.minimized = !state.minimized;
      render();
    });

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.title = 'Close for this page';
    closeBtn.addEventListener('click', function () {
      state.closed = true;
      destroyBox();
    });

    header.appendChild(gradeEl);
    header.appendChild(spacer);
    header.appendChild(minBtn);
    header.appendChild(closeBtn);

    citeEl = document.createElement('div');
    citeEl.className = 'cite';

    var hint = document.createElement('div');
    hint.className = 'hint';

    var flash = document.createElement('div');
    flash.className = 'flash';

    boxEl.appendChild(header);
    boxEl.appendChild(citeEl);
    boxEl.appendChild(hint);
    boxEl.appendChild(flash);
    shadowRoot.appendChild(boxEl);
  }

  function applyPosition() {
    var pos = state.settings.position || 'bottom-right';
    shadowHost.style.position = 'fixed';
    shadowHost.style.zIndex = '2147483647';
    shadowHost.style.top = pos.indexOf('top') !== -1 ? '12px' : 'auto';
    shadowHost.style.bottom = pos.indexOf('bottom') !== -1 ? '12px' : 'auto';
    shadowHost.style.left = pos.indexOf('left') !== -1 ? '12px' : 'auto';
    shadowHost.style.right = pos.indexOf('right') !== -1 ? '12px' : 'auto';
  }

  function destroyBox() {
    if (shadowHost && shadowHost.parentNode) {
      shadowHost.parentNode.removeChild(shadowHost);
    }
    shadowHost = null;
    shadowRoot = null;
    boxEl = null;
    gradeEl = null;
    citeEl = null;
  }

  function flash(msg) {
    if (!shadowRoot) return;
    var el = shadowRoot.querySelector('.flash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 1100);
  }

  function matchesShortcut(event, shortcut) {
    if (!shortcut) return false;
    var want = { ctrl: false, alt: false, shift: false, meta: false, key: null };
    shortcut.toLowerCase().split('+').forEach(function (part) {
      part = part.trim();
      if (part === 'ctrl' || part === 'control') want.ctrl = true;
      else if (part === 'alt' || part === 'option') want.alt = true;
      else if (part === 'shift') want.shift = true;
      else if (part === 'cmd' || part === 'command' || part === 'meta') want.meta = true;
      else if (part) want.key = part;
    });
    if (!want.key) return false;

    var key = event.key ? event.key.toLowerCase() : '';
    // Alt often rewrites event.key (e.g. alt+1 -> "¡" on Mac), so fall back
    // to the physical code for letters and digits.
    var code = event.code || '';
    var codeKey = '';
    if (/^Key[A-Z]$/.test(code)) codeKey = code.slice(3).toLowerCase();
    else if (/^Digit\d$/.test(code)) codeKey = code.slice(5);

    return (
      event.ctrlKey === want.ctrl &&
      event.altKey === want.alt &&
      event.shiftKey === want.shift &&
      event.metaKey === want.meta &&
      (key === want.key || codeKey === want.key)
    );
  }

  function selectionText() {
    var sel = window.getSelection();
    return sel ? String(sel).trim() : '';
  }

  function setFieldFromSelection(field) {
    var text = selectionText();
    if (!text) {
      flash('Select text on the page first');
      return;
    }
    state.overrides[field] = text;
    state.closed = false;
    applyOverridesAndRender();
    flash(FIELD_LABELS[field] + ' set');
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function copyCite() {
    if (!state.citeText) return;
    var extra = state.settings.copySelectedWithCite ? selectionText() : '';
    var plain = extra ? state.citeText + '\n' + extra : state.citeText;

    var tagEnd = state.citeText.indexOf('---');
    var html;
    if (tagEnd > 0) {
      var tagline = state.citeText.slice(0, tagEnd).trim();
      var rest = state.citeText.slice(tagEnd);
      html = '<u><b>' + escapeHtml(tagline) + '</b></u> ' + escapeHtml(rest).replace(/\n/g, '<br>');
    } else {
      html = escapeHtml(state.citeText).replace(/\n/g, '<br>');
    }
    if (extra) html += '<br>' + escapeHtml(extra).replace(/\n/g, '<br>');

    writeClipboard(plain, html)
      .then(function () {
        flash('Copied!');
      })
      .catch(function () {
        if (legacyCopy(plain)) flash('Copied!');
        else flash('Copy failed - click the page first');
      });
  }

  function writeClipboard(plain, html) {
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        return navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([plain], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' })
          })
        ]);
      }
      if (navigator.clipboard) return navigator.clipboard.writeText(plain);
    } catch (e) {
      // fall through to the rejected promise below
    }
    return Promise.reject(new Error('clipboard unavailable'));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  document.addEventListener(
    'keydown',
    function (event) {
      if (!state.settings.enabled) return;
      var sc = state.settings.shortcuts || DEFAULT_SETTINGS.shortcuts;
      if (matchesShortcut(event, sc.copy)) {
        event.preventDefault();
        copyCite();
      } else if (matchesShortcut(event, sc.author)) {
        event.preventDefault();
        setFieldFromSelection('author');
      } else if (matchesShortcut(event, sc.quals)) {
        event.preventDefault();
        setFieldFromSelection('quals');
      } else if (matchesShortcut(event, sc.date)) {
        event.preventDefault();
        setFieldFromSelection('date');
      } else if (matchesShortcut(event, sc.title)) {
        event.preventDefault();
        setFieldFromSelection('title');
      } else if (matchesShortcut(event, sc.publication)) {
        event.preventDefault();
        setFieldFromSelection('publication');
      }
    },
    true
  );

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    chrome.storage.sync.get(DEFAULT_SETTINGS, function (stored) {
      state.settings = stored;
      if (!stored.enabled) {
        destroyBox();
        return;
      }
      if (!state.data) runExtraction();
      else applyOverridesAndRender();
    });
  });

  loadSettingsAndRun();
  window.addEventListener('load', loadSettingsAndRun);
  // Catch JSON-LD/meta injected late by the page's own JS.
  setTimeout(loadSettingsAndRun, 1500);
})();
