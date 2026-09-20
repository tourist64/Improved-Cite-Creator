/**
 * HTML metadata extraction. Apps Script has no DOM parser, so this reads
 * JSON-LD, meta tags, and a few regex fallbacks in a fixed priority order.
 *
 * Priority per field:
 *   title:       JSON-LD headline -> og:title/twitter:title -> <title>
 *   publication: JSON-LD publisher.name -> og:site_name -> known domain map
 *                -> title-cased domain
 *   author:      JSON-LD Person author -> meta author tags -> "By ..."
 *                byline in the body text -> falls back to the publication
 *                name (never a placeholder like "xxx")
 *   date:        JSON-LD datePublished/dateCreated -> meta published-time
 *                tags -> <time datetime> -> null if nothing parses
 */

var KNOWN_PUBLICATIONS_ = {
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'cnn.com': 'CNN',
  'foxnews.com': 'Fox News',
  'npr.org': 'NPR',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP',
  'nytimes.com': 'The New York Times',
  'washingtonpost.com': 'The Washington Post',
  'wsj.com': 'The Wall Street Journal',
  'theguardian.com': 'The Guardian',
  'aljazeera.com': 'Al Jazeera',
  'foreignpolicy.com': 'Foreign Policy',
  'foreignaffairs.com': 'Foreign Affairs',
  'theatlantic.com': 'The Atlantic',
  'politico.com': 'Politico',
  'axios.com': 'Axios',
  'bloomberg.com': 'Bloomberg',
  'time.com': 'Time',
  'newsweek.com': 'Newsweek',
  'usatoday.com': 'USA Today',
  'thehill.com': 'The Hill',
  'vox.com': 'Vox',
  'slate.com': 'Slate',
  'economist.com': 'The Economist',
  'ft.com': 'Financial Times',
  'brookings.edu': 'Brookings Institution',
  'rand.org': 'RAND Corporation',
  'csis.org': 'CSIS',
  'cfr.org': 'Council on Foreign Relations',
  'carnegieendowment.org': 'Carnegie Endowment for International Peace',
  'hrw.org': 'Human Rights Watch',
  'amnesty.org': 'Amnesty International',
  'worldbank.org': 'World Bank',
  'imf.org': 'IMF',
  'news.un.org': 'UN News',
  'who.int': 'WHO',
  'nature.com': 'Nature',
  'science.org': 'Science',
  'scientificamerican.com': 'Scientific American',
  'en.wikipedia.org': 'Wikipedia'
};

function normalizeUrl_(url) {
  url = (url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

function fetchHtml_(url) {
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'
      }
    });
  } catch (e) {
    throw new Error('Network error while fetching the URL: ' + e.message);
  }
  var code = response.getResponseCode();
  if (code < 200 || code >= 400) {
    throw new Error(
      'The site returned HTTP ' + code + '. It may block automated requests ' +
      'or require a login (common for paywalled sites) - fill the fields in manually.'
    );
  }
  return response.getContentText();
}

function extractMetadata_(html, url, settings) {
  var metaTags = getAllMetaTags_(html);
  var jsonLdItems = flattenJsonLd_(getJsonLdBlocks_(html));
  var articleItem = findArticleLikeJsonLd_(jsonLdItems);

  var title =
    (articleItem && articleItem.headline) ||
    findMeta_(metaTags, ['og:title', 'twitter:title']) ||
    extractTitleTag_(html) ||
    '';
  title = cleanText_(title);

  var publication =
    (articleItem && articleItem.publisher && articleItem.publisher.name) ||
    findMeta_(metaTags, ['og:site_name']) ||
    guessPublicationFromDomain_(url);
  publication = cleanText_(publication);

  var authorInfo = extractAuthorFromJsonLd_(articleItem);
  var isOrgAuthor = false;
  var authorName = '';
  var quals = '';

  if (authorInfo && authorInfo.name && !authorInfo.isOrg) {
    authorName = authorInfo.name;
    quals = authorInfo.jobTitle || '';
  } else {
    var metaAuthor = findMeta_(metaTags, [
      'author',
      'article:author',
      'parsely-author',
      'twitter:creator'
    ]);
    if (metaAuthor && !/^https?:\/\//i.test(metaAuthor)) {
      authorName = metaAuthor;
    }
  }

  if (!authorName) {
    var byline = extractBylineFromBody_(html);
    if (byline) {
      authorName = byline.name;
      quals = quals || byline.quals;
    }
  }

  if (!authorName && authorInfo && authorInfo.isOrg && authorInfo.name) {
    authorName = authorInfo.name;
    isOrgAuthor = true;
  }

  if (!authorName) {
    // No personal byline anywhere - cite the outlet/company instead of a
    // placeholder like "xxx".
    authorName = publication;
    isOrgAuthor = true;
  }

  authorName = cleanText_(authorName.replace(/^by[:\s]+/i, ''));
  var nameParts = splitName_(authorName, isOrgAuthor);

  var dateRaw =
    (articleItem && (articleItem.datePublished || articleItem.dateCreated)) ||
    findMeta_(metaTags, [
      'article:published_time',
      'og:published_time',
      'date',
      'pubdate',
      'publish-date',
      'sailthru.date',
      'parsely-pub-date'
    ]) ||
    extractTimeTag_(html) ||
    '';

  var dateObj = parseFlexibleDate_(dateRaw);
  var dateFormatted = dateObj ? formatDate_(dateObj, settings.dateFormat) : '';
  var year = dateObj
    ? formatDate_(dateObj, settings.yearFormat === '4' ? 'yyyy' : 'yy')
    : '';

  return {
    title: title,
    publication: publication,
    first: nameParts.first,
    last: nameParts.last,
    isOrgAuthor: isOrgAuthor,
    quals: cleanText_(quals),
    dateFormatted: dateFormatted,
    year: year
  };
}

function getAllMetaTags_(html) {
  var tags = [];
  var re = /<meta\b([^>]*)>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var attrsStr = m[1];
    var attrs = {};
    var attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    var am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      var key = am[1].toLowerCase();
      var val = am[3] !== undefined ? am[3] : am[4];
      attrs[key] = decodeHtmlEntities_(val);
    }
    tags.push(attrs);
  }
  return tags;
}

function findMeta_(metaTags, keys) {
  for (var i = 0; i < metaTags.length; i++) {
    var t = metaTags[i];
    var identifier = (t.name || t.property || '').toLowerCase();
    for (var j = 0; j < keys.length; j++) {
      if (identifier === keys[j].toLowerCase() && t.content) {
        return t.content.trim();
      }
    }
  }
  return '';
}

function getJsonLdBlocks_(html) {
  var blocks = [];
  var re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var raw = m[1].trim();
    try {
      blocks.push(JSON.parse(raw));
    } catch (e) {
      // Skip malformed JSON-LD rather than failing the whole fetch.
    }
  }
  return blocks;
}

function flattenJsonLd_(blocks) {
  var items = [];
  blocks.forEach(function (block) {
    if (Array.isArray(block)) {
      items = items.concat(block);
    } else if (block && Array.isArray(block['@graph'])) {
      items = items.concat(block['@graph']);
    } else if (block) {
      items.push(block);
    }
  });
  return items;
}

function findArticleLikeJsonLd_(items) {
  var articleTypes = [
    'Article',
    'NewsArticle',
    'BlogPosting',
    'Report',
    'ScholarlyArticle',
    'WebPage'
  ];
  var best = null;
  items.forEach(function (item) {
    if (!item || !item['@type']) return;
    var types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    for (var i = 0; i < types.length; i++) {
      if (articleTypes.indexOf(types[i]) !== -1) {
        if (!best || types[i] !== 'WebPage') {
          best = item;
        }
      }
    }
  });
  return best;
}

function extractAuthorFromJsonLd_(item) {
  if (!item || !item.author) return null;
  var author = item.author;
  if (Array.isArray(author)) author = author[0];
  if (typeof author === 'string') {
    return { name: author, jobTitle: '', isOrg: false };
  }
  if (author && typeof author === 'object') {
    var type = author['@type'] || '';
    var typeStr = Array.isArray(type) ? type.join(',') : type;
    var isOrg = /organization/i.test(typeStr);
    return {
      name: author.name || '',
      jobTitle: author.jobTitle || author.description || '',
      isOrg: isOrg
    };
  }
  return null;
}

function splitName_(name, isOrg) {
  name = (name || '').trim();
  if (!name) return { first: '', last: '' };
  if (isOrg) return { first: '', last: name };

  var firstAuthor = name.split(/,| and | & /i)[0].trim();
  var multiple = name.length > firstAuthor.length;
  var parts = firstAuthor.split(/\s+/);
  var suffix = multiple ? ' et al.' : '';

  if (parts.length === 1) {
    return { first: '', last: parts[0] + suffix };
  }
  var last = parts[parts.length - 1] + suffix;
  var first = parts.slice(0, parts.length - 1).join(' ');
  return { first: first, last: last };
}

function extractTitleTag_(html) {
  var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeHtmlEntities_(m[1].trim()) : '';
}

function extractTimeTag_(html) {
  var m = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/i.exec(html);
  return m ? m[1] : '';
}

function extractBylineFromBody_(html) {
  var snippet = html
    .substring(0, 40000)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  var plain = decodeHtmlEntities_(snippet.replace(/<[^>]+>/g, ' '));
  var m = /\bBy\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})(?:\s*,\s*([A-Za-z0-9 ,.'-]{3,80}?))?(?=\s{2,}|\n|$|\.)/.exec(
    plain
  );
  if (m) {
    return { name: m[1].trim(), quals: (m[2] || '').trim() };
  }
  return null;
}

function guessPublicationFromDomain_(url) {
  var host = getHostname_(url).replace(/^www\./, '');
  if (KNOWN_PUBLICATIONS_[host]) return KNOWN_PUBLICATIONS_[host];
  var parts = host.split('.');
  var base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
  base = (base || '').replace(/[-_]/g, ' ');
  return titleCase_(base);
}

function getHostname_(url) {
  var m = /^https?:\/\/([^\/]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

function titleCase_(str) {
  return (str || '').replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function cleanText_(str) {
  return (str || '').replace(/\s+/g, ' ').trim();
}

function parseFlexibleDate_(raw) {
  if (!raw) return null;
  var d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  var m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) {
    var d2 = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    if (!isNaN(d2.getTime())) return d2;
  }
  return null;
}

function formatDate_(date, pattern) {
  var tz = Session.getScriptTimeZone() || 'America/New_York';
  return Utilities.formatDate(date, tz, pattern);
}

function decodeHtmlEntities_(str) {
  if (!str) return str;
  var named = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&rsquo;': '’',
    '&lsquo;': '‘',
    '&rdquo;': '”',
    '&ldquo;': '“',
    '&mdash;': '—',
    '&ndash;': '–'
  };
  str = str.replace(/&(amp|lt|gt|quot|#39|apos|nbsp|rsquo|lsquo|rdquo|ldquo|mdash|ndash);/g, function (match) {
    return named[match] || match;
  });
  str = str.replace(/&#(\d+);/g, function (_, dec) {
    return String.fromCharCode(dec);
  });
  str = str.replace(/&#x([0-9a-fA-F]+);/g, function (_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
  });
  return str;
}
