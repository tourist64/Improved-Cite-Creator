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
2. Click the Cite Creator icon, then **Read current page**.
3. Review/correct every field (the preview updates live as you edit).
4. Click **Copy citation**, then paste it into your card doc.

To cite a page you're not currently on, paste its URL into the **Article
URL** field and click **Fetch this URL instead** - this does a background
fetch of that page rather than reading your active tab, so it won't work on
sites that require login or block automated requests; use "Read current
page" for those instead.

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

- `activeTab` + `scripting` - to read the page you're currently viewing when
  you click **Read current page**. Only granted for the tab you're on, only
  when you invoke the extension.
- `storage` - to save your template/format settings.
- `host_permissions: ["<all_urls>"]` - only needed for the optional **Fetch
  this URL instead** feature (fetching a URL you paste, from a different
  origin, without Chrome's normal CORS restrictions blocking it).

If you don't need the "paste any URL" feature and would rather the
extension not request access to all sites, delete the `fetchUrlBtn`
button/handler and the `host_permissions` line - "Read current page" alone
only ever needs `activeTab`.

## Known limitations

- Author qualifications are rarely present as structured data, so that
  field is only filled in when the page states it near the byline.
- Byline detection falls back to common CSS selectors (`.byline`, `.author`,
  etc.) as a last resort and can occasionally pick up the wrong text -
  always check it before copying.
- "Fetch this URL instead" is a plain fetch of that URL's HTML, so it can't
  see anything behind a login wall - use "Read current page" for those.
