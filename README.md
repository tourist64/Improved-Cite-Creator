# Cite Creator

A Google Docs add-on for building debate citations from a URL, without the
inaccuracies of the original Cite Creator:

- Uses the article's structured data (JSON-LD / meta tags) instead of naive
  scraping, so publish dates are picked up far more reliably, including when
  several dates on the page match.
- When a page genuinely has no individual byline, it cites the publication
  or company (e.g. `BBC 26`) instead of a placeholder like `xxx`.
- Every field (author, date, title, publication, qualifications) is shown in
  an editable sidebar with a live preview **before** anything is inserted,
  so you can fix whatever the parser gets wrong or can't find (author quals
  in particular are often not published on the page at all, so that field
  is best-effort and usually needs a manual fill-in).
- Output format and every date/year format are configurable, defaulting to:

  ```
  %last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx
  ```

## How it works

This is a **container-bound Apps Script** attached to a Google Doc (the
standard way to run a personal add-on without publishing it to the
Workspace Marketplace). It adds a "Cite Creator" menu with a sidebar:

1. Paste an article URL and click **Fetch citation info**.
2. The script fetches the page and extracts author, date, title,
   publication, and (when available) author qualifications.
3. Review/correct every field in the sidebar - the preview box updates live.
4. Click **Insert citation** to drop the formatted text in at your cursor,
   as its own paragraph, with the tagline before `---` bolded and
   underlined (toggle in Settings).

Settings (template, date/year format, bold tagline) are saved per-user via
`PropertiesService`, so they persist across sessions in that document.

## Setup (one-time, ~2 minutes)

Claude Code cannot create Apps Script projects in your Google account
directly, so set this up yourself:

1. Open (or create) the Google Doc you use for carding evidence.
2. **Extensions -> Apps Script**.
3. Delete the default `Code.gs` contents.
4. Recreate the files from this repo in the Apps Script editor:
   - `Code.gs` - paste the contents of [`Code.gs`](./Code.gs).
   - New script file `Extractor.gs` - paste [`Extractor.gs`](./Extractor.gs).
   - New HTML file `Sidebar.html` - paste [`Sidebar.html`](./Sidebar.html).
   - Open **Project Settings -> `appsscript.json`** (enable "Show
     appsscript.json manifest file" if it's hidden) and replace it with
     [`appsscript.json`](./appsscript.json).
5. Save the project (name it "Cite Creator" or similar).
6. Reload the Google Doc. A **Cite Creator** menu appears next to Extensions.
7. Click **Cite Creator -> Open Cite Creator** and authorize the script when
   prompted (it needs permission to fetch external URLs and edit this
   document only - `documents.currentonly` scope).

If you use [`clasp`](https://github.com/google/clasp) instead, `git clone`
this repo, run `clasp create --type docs --title "Cite Creator"` in it (or
`clasp clone <scriptId>` for an existing project), then `clasp push`.

## Customizing the template

Open the sidebar's **Settings** section. The template supports these tokens:

| Token | Meaning |
|---|---|
| `%first%` / `%last%` | Author first/last name (or the publication name when there's no individual author) |
| `%y%` | Tag year, 2 or 4 digits per the Settings dropdown |
| `%date%` | Full publish date, formatted per the Settings date pattern |
| `%title%` | Article title |
| `%publication%` | Outlet/publisher name |
| `%url%` | Source URL |
| `%quals%` | Author qualifications (usually needs manual entry) |
| `%accessed%` | Today's date, formatted the same way as `%date%` |

Date patterns use [`Utilities.formatDate`](https://developers.google.com/apps-script/reference/utilities/utilities#formatdatedate,-timezone,-format)
syntax, e.g. `M/d/yy` -> `9/20/26`, `MMMM d, yyyy` -> `September 20, 2026`.

## Known limitations

- Paywalled or bot-blocking sites (some news sites, JSTOR, etc.) may fail to
  fetch or return incomplete metadata - fill fields in by hand in that case.
- Author qualifications are rarely present as structured data, so that field
  is only filled in when the page happens to state it near the byline.
- Byline parsing uses heuristics as a last resort fallback and can
  occasionally pick up the wrong phrase - always check it before inserting.
