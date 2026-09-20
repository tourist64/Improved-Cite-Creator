/**
 * Cite Creator - improved debate citation generator for Google Docs.
 *
 * Menu + sidebar entry points and citation formatting/insertion.
 * Metadata scraping lives in Extractor.gs.
 */

var TEMPLATE_PROP_KEY = 'CITE_TEMPLATE';
var YEAR_FORMAT_PROP_KEY = 'CITE_YEAR_FORMAT'; // '2' or '4'
var DATE_FORMAT_PROP_KEY = 'CITE_DATE_FORMAT'; // SimpleDateFormat pattern
var BOLD_TAG_PROP_KEY = 'CITE_BOLD_TAG';

var DEFAULT_TEMPLATE =
  '%last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx';
var DEFAULT_DATE_FORMAT = 'M/d/yy';

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Cite Creator')
    .addItem('Open Cite Creator', 'showSidebar')
    .addToUi();
}

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Cite Creator')
    .setWidth(340);
  DocumentApp.getUi().showSidebar(html);
}

function getSettings() {
  var props = PropertiesService.getUserProperties();
  return {
    template: props.getProperty(TEMPLATE_PROP_KEY) || DEFAULT_TEMPLATE,
    yearFormat: props.getProperty(YEAR_FORMAT_PROP_KEY) || '2',
    dateFormat: props.getProperty(DATE_FORMAT_PROP_KEY) || DEFAULT_DATE_FORMAT,
    boldTag: props.getProperty(BOLD_TAG_PROP_KEY) !== 'false'
  };
}

function saveSettings(settings) {
  var props = PropertiesService.getUserProperties();
  props.setProperty(TEMPLATE_PROP_KEY, settings.template || DEFAULT_TEMPLATE);
  props.setProperty(YEAR_FORMAT_PROP_KEY, settings.yearFormat === '4' ? '4' : '2');
  props.setProperty(DATE_FORMAT_PROP_KEY, settings.dateFormat || DEFAULT_DATE_FORMAT);
  props.setProperty(BOLD_TAG_PROP_KEY, settings.boldTag ? 'true' : 'false');
  return getSettings();
}

/**
 * Fetches a URL and returns best-effort citation fields for the user to
 * review and correct in the sidebar before anything is inserted.
 */
function fetchCitationData(url) {
  url = normalizeUrl_(url);
  var settings = getSettings();
  var html = fetchHtml_(url);
  var meta = extractMetadata_(html, url, settings);
  var today = new Date();

  return {
    url: url,
    first: meta.first,
    last: meta.last,
    isOrgAuthor: meta.isOrgAuthor,
    date: meta.dateFormatted,
    year: meta.year,
    title: meta.title,
    publication: meta.publication,
    quals: meta.quals,
    accessed: formatDate_(today, settings.dateFormat)
  };
}

/**
 * Inserts already-formatted citation text (built client-side from the
 * template so the sidebar preview and the inserted text always match)
 * as its own paragraph at the cursor, bolding/underlining the tagline
 * before "---" if that setting is on.
 */
function insertCitationText(finalText) {
  if (!finalText) {
    throw new Error('There is no citation text to insert.');
  }
  var settings = getSettings();
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var cursor = doc.getCursor();
  var newPara = null;

  if (cursor) {
    try {
      var element = cursor.getElement();
      var paragraph = element;
      while (paragraph && paragraph.getType() !== DocumentApp.ElementType.PARAGRAPH) {
        paragraph = paragraph.getParent();
      }
      if (paragraph) {
        var parent = paragraph.getParent();
        var idx = parent.getChildIndex(paragraph);
        newPara = parent.insertParagraph(idx + 1, finalText);
      }
    } catch (e) {
      newPara = null;
    }
  }

  if (!newPara) {
    newPara = body.appendParagraph(finalText);
  }

  if (settings.boldTag) {
    var tagEnd = finalText.indexOf('---');
    if (tagEnd > 0) {
      var tagline = finalText.substring(0, tagEnd).trim();
      if (tagline.length > 0) {
        var text = newPara.editAsText();
        text.setBold(0, tagline.length - 1, true);
        text.setUnderline(0, tagline.length - 1, true);
      }
    }
  }

  doc.setCursor(doc.newPosition(newPara, newPara.getText().length));
  return true;
}
