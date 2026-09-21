/**
 * Caches each tab's auto-extracted citation data (sent by content-script.js)
 * keyed by tab id, so the popup can read it instantly instead of scanning
 * the page on open. Cleared when the tab closes.
 */
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message && message.type === 'CITE_CREATOR_DATA' && sender.tab && typeof sender.tab.id === 'number') {
    var record = {};
    record['cite_' + sender.tab.id] = message.data;
    chrome.storage.session.set(record);
  }
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  chrome.storage.session.remove('cite_' + tabId);
});
