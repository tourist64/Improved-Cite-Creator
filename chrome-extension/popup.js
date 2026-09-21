var DEFAULTS = {
  enabled: true,
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
  chrome.storage.sync.get(DEFAULTS, function (stored) {
    document.getElementById('enabled').checked = !!stored.enabled;
    renderRows('copyShortcut', [
      [stored.shortcuts.copy, 'Copy the current cite, optionally including any selected text.']
    ]);
    renderRows('fieldShortcuts', [
      [stored.shortcuts.author, 'Author name'],
      [stored.shortcuts.quals, 'Qualifications'],
      [stored.shortcuts.date, 'Date'],
      [stored.shortcuts.title, 'Title'],
      [stored.shortcuts.publication, 'Publication']
    ]);
  });

  document.getElementById('enabled').addEventListener('change', function (e) {
    chrome.storage.sync.set({ enabled: e.target.checked });
  });

  document.getElementById('optionsLink').addEventListener('click', function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

function renderRows(containerId, rows) {
  var container = document.getElementById(containerId);
  container.innerHTML = '';
  rows.forEach(function (row) {
    var div = document.createElement('div');
    var code = document.createElement('code');
    code.textContent = row[0];
    div.appendChild(code);
    div.appendChild(document.createTextNode(' - ' + row[1]));
    container.appendChild(div);
  });
}
