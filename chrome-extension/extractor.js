/**
 * DOM-based citation metadata extraction. Runs either against the live
 * document of the tab the user is reading (injected via
 * chrome.scripting.executeScript) or against a DOMParser'd document from a
 * fetched URL - both are plain Document objects, so the same code handles
 * either case.
 *
 * Priority per field:
 *   title:       JSON-LD headline -> og:title/twitter:title -> <title>
 *   publication: JSON-LD publisher.name -> og:site_name -> known domain map
 *                -> title-cased domain
 *   author:      JSON-LD Person author -> meta author tags -> common byline
 *                selectors in the page -> falls back to the publication
 *                name (never a placeholder like "xxx")
 *   date:        JSON-LD datePublished/dateCreated -> meta published-time
 *                tags -> <time datetime> -> '' if nothing parses
 */
(function (global) {
  var KNOWN_PUBLICATIONS = {
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

  var BYLINE_SELECTORS = [
    '[rel="author"]',
    '[itemprop="author"] [itemprop="name"]',
    '[itemprop="author"]',
    '.byline__name',
    '.author-name',
    '.c-byline__author',
    '.article-author',
    '.byline a',
    '.byline',
    '.author a',
    '.author'
  ];

  var QUALS_SELECTORS = [
    '.byline__title',
    '.author-title',
    '.author-bio',
    '.byline-title',
    '.author__title'
  ];

  function cleanText(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
  }

  function titleCase(str) {
    return (str || '').replace(/\w\S*/g, function (t) {
      return t.charAt(0).toUpperCase() + t.substr(1).toLowerCase();
    });
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function guessPublicationFromDomain(url) {
    var host = getHostname(url);
    if (KNOWN_PUBLICATIONS[host]) return KNOWN_PUBLICATIONS[host];
    var parts = host.split('.');
    var base = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    return titleCase((base || '').replace(/[-_]/g, ' '));
  }

  function getJsonLdItems(doc) {
    var items = [];
    var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var parsed = JSON.parse(scripts[i].textContent);
        if (Array.isArray(parsed)) {
          items = items.concat(parsed);
        } else if (parsed && Array.isArray(parsed['@graph'])) {
          items = items.concat(parsed['@graph']);
        } else if (parsed) {
          items.push(parsed);
        }
      } catch (e) {
        // Skip malformed JSON-LD rather than failing the whole extraction.
      }
    }
    return items;
  }

  function findArticleLikeJsonLd(items) {
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
      types.forEach(function (t) {
        if (articleTypes.indexOf(t) !== -1 && (!best || t !== 'WebPage')) {
          best = item;
        }
      });
    });
    return best;
  }

  function extractAuthorFromJsonLd(item) {
    if (!item || !item.author) return null;
    var author = item.author;
    if (Array.isArray(author)) author = author[0];
    if (typeof author === 'string') {
      return { name: author, jobTitle: '', isOrg: false };
    }
    if (author && typeof author === 'object') {
      var type = author['@type'] || '';
      var typeStr = Array.isArray(type) ? type.join(',') : type;
      return {
        name: author.name || '',
        jobTitle: author.jobTitle || author.description || '',
        isOrg: /organization/i.test(typeStr)
      };
    }
    return null;
  }

  function meta(doc, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = doc.querySelector(selectors[i]);
      if (el) {
        var val = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent;
        if (val && val.trim()) return val.trim();
      }
    }
    return '';
  }

  function firstReasonableText(doc, selectors, maxLen) {
    for (var i = 0; i < selectors.length; i++) {
      var el = doc.querySelector(selectors[i]);
      if (el) {
        var text = cleanText(el.textContent);
        if (text && text.length <= (maxLen || 120)) return text;
      }
    }
    return '';
  }

  function splitName(name, isOrg) {
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

  function parseFlexibleDate(raw) {
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

  function formatDate(date, pattern) {
    var pad = function (n) {
      return n < 10 ? '0' + n : '' + n;
    };
    var months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    var repl = {
      yyyy: date.getFullYear(),
      yy: ('' + date.getFullYear()).slice(-2),
      MMMM: months[date.getMonth()],
      MMM: months[date.getMonth()].slice(0, 3),
      MM: pad(date.getMonth() + 1),
      M: date.getMonth() + 1,
      dd: pad(date.getDate()),
      d: date.getDate()
    };
    var tokens = Object.keys(repl).sort(function (a, b) {
      return b.length - a.length;
    });
    var result = pattern;
    tokens.forEach(function (t) {
      result = result.split(t).join(repl[t]);
    });
    return result;
  }

  function extract(doc, pageUrl, settings) {
    settings = settings || { dateFormat: 'M/d/yy', yearFormat: '2' };
    var jsonLdItems = getJsonLdItems(doc);
    var articleItem = findArticleLikeJsonLd(jsonLdItems);

    var title =
      (articleItem && articleItem.headline) ||
      meta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      cleanText(doc.title) ||
      '';
    title = cleanText(title);

    var publication =
      (articleItem && articleItem.publisher && articleItem.publisher.name) ||
      meta(doc, ['meta[property="og:site_name"]']) ||
      guessPublicationFromDomain(pageUrl);
    publication = cleanText(publication);

    var authorInfo = extractAuthorFromJsonLd(articleItem);
    var isOrgAuthor = false;
    var authorName = '';
    var quals = '';

    if (authorInfo && authorInfo.name && !authorInfo.isOrg) {
      authorName = authorInfo.name;
      quals = authorInfo.jobTitle || '';
    } else {
      var metaAuthor = meta(doc, [
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="parsely-author"]',
        'meta[name="twitter:creator"]'
      ]);
      if (metaAuthor && !/^https?:\/\//i.test(metaAuthor)) {
        authorName = metaAuthor;
      }
    }

    if (!authorName) {
      var byline = firstReasonableText(doc, BYLINE_SELECTORS, 80);
      if (byline) authorName = byline;
    }

    if (!quals) {
      quals = firstReasonableText(doc, QUALS_SELECTORS, 100);
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

    authorName = cleanText(authorName.replace(/^by[:\s]+/i, ''));
    var nameParts = splitName(authorName, isOrgAuthor);

    var dateRaw =
      (articleItem && (articleItem.datePublished || articleItem.dateCreated)) ||
      meta(doc, [
        'meta[property="article:published_time"]',
        'meta[property="og:published_time"]',
        'meta[name="date"]',
        'meta[name="pubdate"]',
        'meta[name="publish-date"]',
        'meta[name="sailthru.date"]',
        'meta[name="parsely-pub-date"]',
        'time[datetime]'
      ]) ||
      '';

    var dateObj = parseFlexibleDate(dateRaw);
    var dateFormatted = dateObj ? formatDate(dateObj, settings.dateFormat) : '';
    var year = dateObj
      ? formatDate(dateObj, settings.yearFormat === '4' ? 'yyyy' : 'yy')
      : '';

    return {
      url: pageUrl,
      title: title,
      publication: publication,
      first: nameParts.first,
      last: nameParts.last,
      isOrgAuthor: isOrgAuthor,
      quals: cleanText(quals),
      date: dateFormatted,
      year: year
    };
  }

  global.CiteCreatorExtractor = { extract: extract, formatDate: formatDate };
})(typeof window !== 'undefined' ? window : this);
