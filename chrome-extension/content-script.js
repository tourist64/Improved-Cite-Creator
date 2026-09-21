/**
 * Runs automatically on every page load. Extracts citation data in the
 * background and hands it to the service worker to cache per-tab, so the
 * popup can show a fully-filled-in citation the instant it's opened -
 * no click needed.
 *
 * Runs more than once (idle, load, and a short delay after) because some
 * sites inject JSON-LD/meta tags via JS after the initial DOM is ready;
 * each pass just overwrites the cached result with the latest read.
 */
(function () {
  function computeAndSend() {
    if (!window.CiteCreatorExtractor || !chrome.runtime || !chrome.runtime.id) return;
    chrome.storage.sync.get({ dateFormat: 'M/d/yy', yearFormat: '2' }, function (settings) {
      try {
        var data = window.CiteCreatorExtractor.extract(document, location.href, settings);
        chrome.runtime.sendMessage({ type: 'CITE_CREATOR_DATA', data: data });
      } catch (e) {
        // Non-fatal - the popup falls back to an on-demand scan.
      }
    });
  }

  computeAndSend();
  window.addEventListener('load', computeAndSend);
  setTimeout(computeAndSend, 1500);
})();
