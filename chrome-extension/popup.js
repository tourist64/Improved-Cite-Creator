var DEFAULT_TEMPLATE =
  '%last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx';
var DEFAULT_SETTINGS = {
  template: DEFAULT_TEMPLATE,
  yearFormat: '2',
  dateFormat: 'M/d/yy',
  boldTag: true
};
var FIELD_IDS = ['first', 'last', 'date', 'year', 'title', 'publication', 'quals', 'accessed'];

document.addEventListener('DOMContentLoaded', init);

function init() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, function (stored) {
    document.getElementById('template').value = stored.template;
    document.getElementById('yearFormat').value = stored.yearFormat;
    document.getElementById('dateFormat').value = stored.dateFormat;
    document.getElementById('boldTag').checked = stored.boldTag;
    document.getElementById('accessed').value = CiteCreatorExtractor.formatDate(
      new Date(),
      stored.dateFormat
    );
    updatePreview();
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url) {
      document.getElementById('url').value = tabs[0].url;
    }
  });

  document.getElementById('fetchPageBtn').addEventListener('click', fetchFromActiveTab);
  document.getElementById('fetchUrlBtn').addEventListener('click', fetchFromTypedUrl);
  document.getElementById('copyBtn').addEventListener('click', onCopyClick);
  document.getElementById('isOrg').addEventListener('change', applyOrgToggle);
  document.getElementById('saveSettingsBtn').addEventListener('click', onSaveSettingsClick);
  document.getElementById('template').addEventListener('input', updatePreview);
  FIELD_IDS.forEach(function (id) {
    document.getElementById(id).addEventListener('input', updatePreview);
  });
}

function showStatus(msg, isError) {
  var el = document.getElementById('status');
  el.textContent = msg;
  el.className = isError ? 'status error' : 'status';
}

function currentFormatSettings() {
  return {
    dateFormat: document.getElementById('dateFormat').value || DEFAULT_SETTINGS.dateFormat,
    yearFormat: document.getElementById('yearFormat').value || '2'
  };
}

function fetchFromActiveTab() {
  showStatus('Reading the current page...', false);
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !tab.id) {
      showStatus('No active tab found.', true);
      return;
    }
    if (!/^https?:/i.test(tab.url || '')) {
      showStatus('Cite Creator can only read regular web pages, not chrome:// or extension pages.', true);
      return;
    }
    var fmt = currentFormatSettings();
    chrome.scripting.executeScript(
      { target: { tabId: tab.id }, files: ['extractor.js'] },
      function () {
        if (chrome.runtime.lastError) {
          showStatus('Could not access this page: ' + chrome.runtime.lastError.message, true);
          return;
        }
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            func: function (dateFormat, yearFormat) {
              return window.CiteCreatorExtractor.extract(document, location.href, {
                dateFormat: dateFormat,
                yearFormat: yearFormat
              });
            },
            args: [fmt.dateFormat, fmt.yearFormat]
          },
          function (results) {
            if (chrome.runtime.lastError) {
              showStatus('Could not read the page: ' + chrome.runtime.lastError.message, true);
              return;
            }
            var data = results && results[0] && results[0].result;
            if (!data) {
              showStatus('Could not extract citation data from this page.', true);
              return;
            }
            applyExtractedData(data);
          }
        );
      }
    );
  });
}

function fetchFromTypedUrl() {
  var url = document.getElementById('url').value.trim();
  if (!url) {
    showStatus('Enter a URL first.', true);
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
    document.getElementById('url').value = url;
  }
  showStatus('Fetching...', false);
  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var data = CiteCreatorExtractor.extract(doc, url, currentFormatSettings());
      applyExtractedData(data);
    })
    .catch(function (err) {
      showStatus(
        'Could not fetch that URL: ' + err.message +
          '. Some sites block automated requests - try "Read current page" while viewing it, or fill fields in by hand.',
        true
      );
    });
}

function applyExtractedData(data) {
  document.getElementById('url').value = data.url;
  document.getElementById('first').value = data.first || '';
  document.getElementById('last').value = data.last || '';
  document.getElementById('isOrg').checked = !!data.isOrgAuthor;
  document.getElementById('date').value = data.date || '';
  document.getElementById('year').value = data.year || '';
  document.getElementById('title').value = data.title || '';
  document.getElementById('publication').value = data.publication || '';
  document.getElementById('quals').value = data.quals || '';
  applyOrgToggle();

  if (data.isOrgAuthor) {
    showStatus(
      'No individual author found - used "' + data.last + '" as the author. Review every field before copying.',
      false
    );
  } else if (!data.date) {
    showStatus('No publish date found - please fill it in. Review the other fields too.', true);
  } else {
    showStatus('Extracted. Please review every field before copying - especially quals.', false);
  }
  updatePreview();
}

function applyOrgToggle() {
  var isOrg = document.getElementById('isOrg').checked;
  var firstField = document.getElementById('first');
  firstField.disabled = isOrg;
  if (isOrg) firstField.value = '';
  updatePreview();
}

function getFieldValues() {
  var data = { url: document.getElementById('url').value };
  FIELD_IDS.forEach(function (id) {
    data[id] = document.getElementById(id).value;
  });
  return data;
}

function updatePreview() {
  var template = document.getElementById('template').value || DEFAULT_TEMPLATE;
  document.getElementById('preview').value = CiteCreatorFormat.buildCitation(template, getFieldValues());
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function onCopyClick() {
  var text = document.getElementById('preview').value;
  if (!text) {
    showStatus('Nothing to copy yet.', true);
    return;
  }
  var boldTag = document.getElementById('boldTag').checked;
  var tagEnd = text.indexOf('---');
  var copyPromise;

  if (boldTag && tagEnd > 0) {
    var tagline = text.slice(0, tagEnd).trim();
    var rest = text.slice(tagEnd);
    var html = '<u><b>' + escapeHtml(tagline) + '</b></u> ' + escapeHtml(rest);
    copyPromise = navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })
    ]);
  } else {
    copyPromise = navigator.clipboard.writeText(text);
  }

  copyPromise
    .then(function () {
      showStatus("Citation copied - paste it wherever you're carding.", false);
    })
    .catch(function (err) {
      showStatus('Could not copy: ' + err.message, true);
    });
}

function onSaveSettingsClick() {
  var settings = {
    template: document.getElementById('template').value || DEFAULT_TEMPLATE,
    yearFormat: document.getElementById('yearFormat').value,
    dateFormat: document.getElementById('dateFormat').value || DEFAULT_SETTINGS.dateFormat,
    boldTag: document.getElementById('boldTag').checked
  };
  chrome.storage.sync.set(settings, function () {
    showStatus('Settings saved.', false);
  });
}
