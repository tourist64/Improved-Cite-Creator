# Cite Creator (Chrome extension)

A Manifest V3 Chrome extension that builds debate citations from whatever
article you're currently viewing - or from a pasted URL.

This is the sibling of the Google Docs add-on in the repo root, built as a
separate product per your workflow: no Google Doc required, works on any
page, and copies a ready-to-paste citation (with the tagline pre-bolded)
straight to your clipboard.

## Why this is more accurate than the original Cite Creator

- Reads the page's actual structured data (JSON-LD `Article`/`NewsArticle`,
  Open Graph and Twitter meta tags) in a fixed priority order for title,
  author, date, and publisher, instead of one fragile scrape.
- Because it runs against the **live rendered page you're already on**
  (via `chrome.scripting`), it works on JS-rendered pages and pages you're
  logged into/paywalled past - no separate server fetch that gets blocked
  or sees a login wall.
- When there's genuinely no individual byline, it cites the publication or
  company by name (e.g. `BBC 26`) instead of a placeholder like `xxx`.
- Every field - author, date, title, publication, qualifications - shows up
  editable with a live preview **before** you copy anything, so you can fix
  whatever the parser misses (author quals especially are rarely published
  as structured data at all, so that field is best-effort and usually needs
  a manual fill-in).
- Copies both plain text and rich HTML to the clipboard, so pasting into
  Google Docs/Word keeps the tagline (before `---`) bold and underlined
  automatically.
- Extracts automatically on every page as it loads (a background content
  script, no click needed) and caches the result per-tab, so opening the
  popup shows a filled-in citation instantly.

## Install (unpacked, ~1 minute)

Chrome Web Store publishing requires a developer account and review, so for
personal use install it as an unpacked extension:

1. Download/clone this repo, or just this `chrome-extension/` folder.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `chrome-extension/` folder.
5. Pin it (puzzle-piece icon in the toolbar -> pin "Cite Creator") so it's
   one click away.

## Using it

1. Open the article you want to cite.
2. Click the Cite Creator icon - the fields are already filled in (a
   background content script scans every page as it loads, so there's
   usually nothing to wait for).
3. Review/correct every field (the preview updates live as you edit).
4. Click **Copy citation**, then paste it into your card doc.

If a page was open before you loaded the extension (or you navigated
within a single-page app that changed the article without a full reload),
the popup falls back to scanning on open, or click **Re-scan page** to
force a fresh read.

To cite a page you're not currently on, paste its URL into the **Article
URL** field and click **Fetch this URL instead** - this does a background
fetch of that page rather than reading your active tab, so it won't work on
sites that require login or block automated requests; use the current tab
for those instead.

## Settings

Open the **Settings** section in the popup for:

| Setting | Effect |
|---|---|
| Citation template | Same token syntax as the Docs add-on (see below) |
| Tag year format | 2-digit (`26`) or 4-digit (`2026`) for `%y%` |
| Date pattern | e.g. `M/d/yy` -> `9/20/26`, `MMMM d, yyyy` -> `September 20, 2026` |
| Bold tagline on copy | Whether the clipboard's rich-text version bolds/underlines the part before `---` |

Settings sync via `chrome.storage.sync` (tied to your Chrome sign-in).

### Template tokens

| Token | Meaning |
|---|---|
| `%first%` / `%last%` | Author first/last name (or the publication name when there's no individual author) |
| `%y%` | Tag year |
| `%date%` | Full publish date |
| `%title%` | Article title |
| `%publication%` | Outlet/publisher name |
| `%url%` | Source URL |
| `%quals%` | Author qualifications (usually needs manual entry) |
| `%accessed%` | Today's date |

Default template:

```
%last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx
```

## Permissions, and a note on trimming them

`manifest.json` requests:

- `activeTab` + `scripting` - used as a fallback to read the current page on
  demand (when nothing's cached yet, or you click **Re-scan page**).
- `storage` - to save your template/format settings, and to cache each
  tab's auto-extracted data (`chrome.storage.session`, cleared per-tab when
  it closes and entirely on browser restart - nothing persists beyond that
  or leaves your machine).
- `host_permissions: ["<all_urls>"]` - this is the one worth knowing about:
  it's what lets the background content script (`content-script.js`) run
  automatically on every site to auto-extract citation data without a
  click, and is also used by the optional **Fetch this URL instead**
  feature. Chrome will show this as "read and change all your data on all
  websites" when you load the extension - the content script only ever
  reads `document`/meta tags and never modifies the page or sends anything
  off your machine.

If you'd rather trade the automatic, click-free extraction for a narrower
extension, remove the `content_scripts` block from `manifest.json` (and the
`background.js`/`chrome.storage.session` cache it feeds) and use the
**Re-scan page** button on demand instead - `host_permissions` can then
drop to just what "Fetch this URL instead" needs, or be removed too if you
also cut that feature.

## Known limitations

- Author qualifications are rarely present as structured data, so that
  field is only filled in when the page states it near the byline.
- Byline detection falls back to common CSS selectors (`.byline`, `.author`,
  etc.) as a last resort and can occasionally pick up the wrong text -
  always check it before copying.
- "Fetch this URL instead" is a plain fetch of that URL's HTML, so it can't
  see anything behind a login wall - visit the page directly instead.
- The auto-extract content script runs at `document_idle`, on `load`, and
  once more ~1.5s later to catch JS-rendered JSON-LD - single-page apps
  that swap articles in without a full page reload won't re-trigger it, so
  use **Re-scan page** in that case.
