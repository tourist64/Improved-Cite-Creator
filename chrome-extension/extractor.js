/**
 * DOM-based citation metadata extraction, plus a confidence grade based on
 * how each field was sourced. Runs against the live document of the tab
 * the user is reading (injected as a content script).
 *
 * Priority per field (highest-confidence source wins):
 *   title:       JSON-LD headline -> microdata (itemprop=headline) ->
 *                og:title/twitter:title -> <title>
 *   publication: JSON-LD publisher.name -> microdata (itemprop=publisher) ->
 *                og:site_name -> known domain map -> title-cased domain
 *   author:      JSON-LD Person author -> meta author tags -> common byline
 *                selectors in the page -> falls back to the publication
 *                name (never a placeholder like "xxx")
 *   date:        JSON-LD datePublished/dateCreated -> microdata
 *                (itemprop=datePublished) -> meta published-time tags ->
 *                <time datetime> -> a date-shaped phrase in the body text
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

  var MONTHS_PATTERN =
    'January|February|March|April|May|June|July|August|September|October|November|December|' +
    'Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';
  var BODY_DATE_RE = new RegExp('(' + MONTHS_PATTERN + ')\\.?\\s+\\d{1,2},?\\s+\\d{4}', 'i');

  var GRADE_WEIGHTS = {
    date: { jsonld: 30, microdata: 27, meta: 24, time: 20, regex: 12, manual: 30, none: 0 },
    // orgdeclared: the page's structured data says the author IS an
    // organization, so citing the outlet is almost certainly right.
    // org: no byline found anywhere, so the outlet is a reasonable but
    // unverified fallback.
    author: { jsonld: 30, meta: 22, orgdeclared: 26, byline: 12, manual: 30, org: 16, none: 0 },
    title: { jsonld: 15, microdata: 14, meta: 13, titletag: 7, manual: 15, none: 0 },
    publication: { jsonld: 15, microdata: 14, meta: 13, domain: 6, manual: 15, none: 0 },
    quals: { jsonld: 10, byline: 6, manual: 10, none: 4 }
  };

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

  function itemprop(doc, name) {
    var el = doc.querySelector('[itemprop="' + name + '"]');
    if (!el) return '';
    var val = el.getAttribute('content') || el.getAttribute('datetime') || el.textContent;
    return val ? val.trim() : '';
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

  function findDateInBodyText(doc) {
    var text = '';
    try {
      text = doc.body ? doc.body.innerText || doc.body.textContent || '' : '';
    } catch (e) {
      text = '';
    }
    var m = BODY_DATE_RE.exec(text.slice(0, 6000));
    return m ? m[0] : '';
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
    settings = settings || { dateFormat: 'M-d-yyyy', yearFormat: '2' };
    var jsonLdItems = getJsonLdItems(doc);
    var articleItem = findArticleLikeJsonLd(jsonLdItems);
    var sources = {};

    // --- Title ---
    var title = '';
    if (articleItem && articleItem.headline) {
      title = articleItem.headline;
      sources.title = 'jsonld';
    } else {
      var mdTitle = itemprop(doc, 'headline');
      if (mdTitle) {
        title = mdTitle;
        sources.title = 'microdata';
      } else {
        var metaTitle = meta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']);
        if (metaTitle) {
          title = metaTitle;
          sources.title = 'meta';
        } else if (doc.title) {
          title = doc.title;
          sources.title = 'titletag';
        } else {
          sources.title = 'none';
        }
      }
    }
    title = cleanText(title);

    // --- Publication ---
    var publication = '';
    if (articleItem && articleItem.publisher && articleItem.publisher.name) {
      publication = articleItem.publisher.name;
      sources.publication = 'jsonld';
    } else {
      var mdPub = itemprop(doc, 'publisher');
      if (mdPub) {
        publication = mdPub;
        sources.publication = 'microdata';
      } else {
        var metaPub = meta(doc, ['meta[property="og:site_name"]']);
        if (metaPub) {
          publication = metaPub;
          sources.publication = 'meta';
        } else {
          publication = guessPublicationFromDomain(pageUrl);
          sources.publication = 'domain';
        }
      }
    }
    publication = cleanText(publication);

    // --- Author ---
    var authorInfo = extractAuthorFromJsonLd(articleItem);
    var isOrgAuthor = false;
    var authorName = '';
    var quals = '';

    if (authorInfo && authorInfo.name && !authorInfo.isOrg) {
      authorName = authorInfo.name;
      quals = authorInfo.jobTitle || '';
      sources.author = 'jsonld';
      if (quals) sources.quals = 'jsonld';
    } else {
      var metaAuthor = meta(doc, [
        'meta[name="author"]',
        'meta[property="article:author"]',
        'meta[name="parsely-author"]',
        'meta[name="twitter:creator"]'
      ]);
      if (metaAuthor && !/^https?:\/\//i.test(metaAuthor)) {
        authorName = metaAuthor;
        sources.author = 'meta';
      }
    }

    if (!authorName) {
      var byline = firstReasonableText(doc, BYLINE_SELECTORS, 80);
      if (byline) {
        authorName = byline;
        sources.author = 'byline';
      }
    }

    if (!quals) {
      var qualsText = firstReasonableText(doc, QUALS_SELECTORS, 100);
      if (qualsText) {
        quals = qualsText;
        sources.quals = 'byline';
      }
    }

    if (!authorName && authorInfo && authorInfo.isOrg && authorInfo.name) {
      authorName = authorInfo.name;
      isOrgAuthor = true;
      sources.author = 'orgdeclared';
    }

    if (!authorName) {
      // No personal byline anywhere - cite the outlet/company instead of a
      // placeholder like "xxx".
      authorName = publication;
      isOrgAuthor = true;
      sources.author = 'org';
    }

    if (!sources.quals) sources.quals = 'none';

    authorName = cleanText(authorName.replace(/^by[:\s]+/i, ''));
    var nameParts = splitName(authorName, isOrgAuthor);

    // --- Date ---
    var dateRaw = '';
    if (articleItem && (articleItem.datePublished || articleItem.dateCreated)) {
      dateRaw = articleItem.datePublished || articleItem.dateCreated;
      sources.date = 'jsonld';
    } else {
      var mdDate = itemprop(doc, 'datePublished') || itemprop(doc, 'dateCreated');
      if (mdDate) {
        dateRaw = mdDate;
        sources.date = 'microdata';
      } else {
        var metaDate = meta(doc, [
          'meta[property="article:published_time"]',
          'meta[property="og:published_time"]',
          'meta[name="date"]',
          'meta[name="pubdate"]',
          'meta[name="publish-date"]',
          'meta[name="sailthru.date"]',
          'meta[name="parsely-pub-date"]'
        ]);
        if (metaDate) {
          dateRaw = metaDate;
          sources.date = 'meta';
        } else {
          var timeEl = doc.querySelector('time[datetime]');
          var timeVal = timeEl ? timeEl.getAttribute('datetime') : '';
          if (timeVal) {
            dateRaw = timeVal;
            sources.date = 'time';
          } else {
            var bodyDate = findDateInBodyText(doc);
            if (bodyDate) {
              dateRaw = bodyDate;
              sources.date = 'regex';
            } else {
              sources.date = 'none';
            }
          }
        }
      }
    }

    var dateObj = parseFlexibleDate(dateRaw);
    var dateFormatted = dateObj ? formatDate(dateObj, settings.dateFormat) : '';
    var year = dateObj
      ? formatDate(dateObj, settings.yearFormat === '4' ? 'yyyy' : 'yy')
      : '';
    if (dateRaw && !dateObj) {
      // Couldn't parse it into a Date, but we found *something* - use the
      // raw text rather than silently dropping it.
      dateFormatted = cleanText(dateRaw);
    }

    return {
      data: {
        url: pageUrl,
        title: title,
        publication: publication,
        first: nameParts.first,
        last: nameParts.last,
        isOrgAuthor: isOrgAuthor,
        quals: cleanText(quals),
        date: dateFormatted,
        year: year
      },
      sources: sources
    };
  }

  function gradeSources(sources) {
    sources = sources || {};
    var score = 0;
    Object.keys(GRADE_WEIGHTS).forEach(function (field) {
      var src = sources[field] || 'none';
      var weights = GRADE_WEIGHTS[field];
      var w = weights[src];
      score += w !== undefined ? w : 0;
    });

    var letter, tier;
    if (score >= 93) { letter = 'A'; tier = 'good'; }
    else if (score >= 90) { letter = 'A-'; tier = 'good'; }
    else if (score >= 87) { letter = 'B+'; tier = 'ok'; }
    else if (score >= 83) { letter = 'B'; tier = 'ok'; }
    else if (score >= 80) { letter = 'B-'; tier = 'ok'; }
    else if (score >= 77) { letter = 'C+'; tier = 'meh'; }
    else if (score >= 70) { letter = 'C'; tier = 'meh'; }
    else if (score >= 65) { letter = 'C-'; tier = 'meh'; }
    else if (score >= 55) { letter = 'D+'; tier = 'bad'; }
    else if (score >= 45) { letter = 'D'; tier = 'bad'; }
    else { letter = 'F'; tier = 'bad'; }

    return { score: score, letter: letter, tier: tier };
  }

  global.CiteCreatorExtractor = {
    extract: extract,
    formatDate: formatDate,
    parseFlexibleDate: parseFlexibleDate,
    splitName: splitName,
    grade: gradeSources
  };
})(typeof window !== 'undefined' ? window : this);
