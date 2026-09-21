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

document.addEventListener('DOMContentLoaded', function () {
  chrome.storage.sync.get(DEFAULT_SETTINGS, function (stored) {
    document.getElementById('enabled').checked = !!stored.enabled;
    document.getElementById('position').value = stored.position;
    document.getElementById('copySelectedWithCite').checked = !!stored.copySelectedWithCite;
    document.getElementById('hideRatings').checked = !!stored.hideRatings;
    document.getElementById('largeFont').checked = !!stored.largeFont;
    document.getElementById('useSlashDate').checked = !!stored.useSlashDate;
    document.getElementById('debugMode').checked = !!stored.debugMode;

    var modeInput = document.querySelector(
      'input[name="citeFormatMode"][value="' + stored.citeFormatMode + '"]'
    );
    if (modeInput) modeInput.checked = true;
    document.getElementById('customTemplate').value = stored.customTemplate;

    document.getElementById('scCopy').value = stored.shortcuts.copy;
    document.getElementById('scAuthor').value = stored.shortcuts.author;
    document.getElementById('scQuals').value = stored.shortcuts.quals;
    document.getElementById('scDate').value = stored.shortcuts.date;
    document.getElementById('scTitle').value = stored.shortcuts.title;
    document.getElementById('scPublication').value = stored.shortcuts.publication;

    document.getElementById('copyShortcutLabel').textContent = stored.shortcuts.copy;
    renderShortcutHints(stored.shortcuts);
  });

  document.getElementById('saveBtn').addEventListener('click', save);
  document.getElementById('enabled').addEventListener('change', function (e) {
    chrome.storage.sync.set({ enabled: e.target.checked });
  });
  document.getElementById('customTemplate').addEventListener('focus', function () {
    var custom = document.querySelector('input[name="citeFormatMode"][value="custom"]');
    if (custom) custom.checked = true;
  });
});

function renderShortcutHints(shortcuts) {
  var rows = [
    [shortcuts.author, 'Author name'],
    [shortcuts.quals, 'Qualifications'],
    [shortcuts.date, 'Date'],
    [shortcuts.title, 'Title'],
    [shortcuts.publication, 'Publication']
  ];
  var table = document.getElementById('shortcutHints');
  table.innerHTML = '';
  rows.forEach(function (row) {
    var tr = document.createElement('tr');
    var tdKey = document.createElement('td');
    var code = document.createElement('code');
    code.textContent = row[0];
    tdKey.appendChild(code);
    var tdLabel = document.createElement('td');
    tdLabel.textContent = '- ' + row[1];
    tr.appendChild(tdKey);
    tr.appendChild(tdLabel);
    table.appendChild(tr);
  });
}

function save() {
  var checkedMode = document.querySelector('input[name="citeFormatMode"]:checked');
  var settings = {
    enabled: document.getElementById('enabled').checked,
    position: document.getElementById('position').value,
    copySelectedWithCite: document.getElementById('copySelectedWithCite').checked,
    hideRatings: document.getElementById('hideRatings').checked,
    largeFont: document.getElementById('largeFont').checked,
    useSlashDate: document.getElementById('useSlashDate').checked,
    debugMode: document.getElementById('debugMode').checked,
    citeFormatMode: checkedMode ? checkedMode.value : 'custom',
    customTemplate:
      document.getElementById('customTemplate').value || DEFAULT_SETTINGS.customTemplate,
    dateFormat: DEFAULT_SETTINGS.dateFormat,
    yearFormat: DEFAULT_SETTINGS.yearFormat,
    shortcuts: {
      copy: cleanShortcut(document.getElementById('scCopy').value, DEFAULT_SETTINGS.shortcuts.copy),
      author: cleanShortcut(document.getElementById('scAuthor').value, DEFAULT_SETTINGS.shortcuts.author),
      quals: cleanShortcut(document.getElementById('scQuals').value, DEFAULT_SETTINGS.shortcuts.quals),
      date: cleanShortcut(document.getElementById('scDate').value, DEFAULT_SETTINGS.shortcuts.date),
      title: cleanShortcut(document.getElementById('scTitle').value, DEFAULT_SETTINGS.shortcuts.title),
      publication: cleanShortcut(
        document.getElementById('scPublication').value,
        DEFAULT_SETTINGS.shortcuts.publication
      )
    }
  };

  chrome.storage.sync.set(settings, function () {
    document.getElementById('copyShortcutLabel').textContent = settings.shortcuts.copy;
    renderShortcutHints(settings.shortcuts);
    var msg = document.getElementById('savedMsg');
    msg.style.opacity = '1';
    setTimeout(function () {
      msg.style.opacity = '0';
    }, 1500);
  });
}

function cleanShortcut(value, fallback) {
  var cleaned = (value || '').replace(/\s+/g, '').toLowerCase();
  return cleaned || fallback;
}
