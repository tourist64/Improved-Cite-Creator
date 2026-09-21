# Cite Creator (Chrome extension)

A Manifest V3 Chrome extension that automatically computes a debate cite for
whatever page you're reading and shows it in a small box on the page - no
clicking, no forms. Keyboard shortcuts copy it, or correct any field from
your text selection.

It's a rebuild of the cite-creator workflow with a more reliable extraction
engine underneath, plus a confidence grade so you know when to double-check.

## How it works

- Every page you open is scanned automatically (at idle, again on load, and
  once more ~1.5s later to catch JSON-LD injected by the page's own JS).
- A small box appears in the corner with the finished cite and a letter
  grade. Minimize it with `−`, dismiss it for that page with `×`.
- `ctrl+alt+c` copies the cite (plus your selected text, if that option is
  on). It copies rich text too, so the tagline before `---` pastes in
  already bold and underlined.
- Wrong field? Select the correct text on the page and press its shortcut -
  the cite and grade update instantly.

| Shortcut | Action |
|---|---|
| `ctrl+alt+c` | Copy the cite (optionally with selected text) |
| `ctrl+alt+1` | Set author from selection |
| `ctrl+alt+2` | Set qualifications from selection |
| `ctrl+alt+3` | Set date from selection |
| `ctrl+alt+4` | Set title from selection |
| `ctrl+alt+5` | Set publication from selection |

On Mac, Option is the same key as Alt, so these work as-is. All six are
re-bindable on the options page.

## Why the extraction is more reliable

Fields are resolved in a strict priority order, best source first:

| Field | Priority |
|---|---|
| Title | JSON-LD `headline` -> microdata `itemprop=headline` -> `og:title`/`twitter:title` -> `<title>` |
| Author | JSON-LD `Person` -> author meta tags -> byline selectors (`.byline`, `[rel=author]`, …) -> the publication itself |
| Date | JSON-LD `datePublished` -> microdata -> published-time meta tags -> `<time datetime>` -> a date-shaped phrase in the body text |
| Publication | JSON-LD `publisher.name` -> microdata -> `og:site_name` -> known-outlet map -> the domain |
| Quals | JSON-LD `jobTitle`/`description` -> byline-adjacent selectors |

Concretely, versus the original:

- **Never prints a placeholder for a missing author.** When a page genuinely
  has no individual byline, it cites the outlet (`BBC News 23`), and the
  grade reflects whether the page's data explicitly said "the author is an
  organization" or whether that was just a fallback.
- **Publication is resolved from real data**, not guessed - no more
  "No Publication" on a BBC article.
- **Dates come from structured data first**, so same-day/duplicate dates on
  the page don't confuse it, with four fallbacks behind that.
- **It reads the live rendered DOM** of the page you're on, so JS-rendered
  and logged-in/paywalled pages work.
- **Anything it gets wrong, you fix in one keystroke** from a selection,
  rather than retyping it in your doc.

### The letter grade

A rough measure of confidence, scored from where each field came from:
structured data (JSON-LD/microdata) scores highest, meta tags next, byline
guesswork lowest - and anything you set yourself counts as certain. An `A`
means every field came from the page's own structured data. A `C` usually
means something was inferred (for example the outlet was used as the author
because no byline was found). Turn ratings off in the options if you'd
rather not see them.

## Install (unpacked, ~1 minute)

Chrome Web Store publishing requires a developer account and review, so for
personal use install it unpacked:

1. Download/clone this repo, or just this `chrome-extension/` folder.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `chrome-extension/` folder.
5. Pin it (puzzle-piece icon -> pin "Cite Creator").
6. **Reload any tabs you already had open** - content scripts only inject on
   pages loaded after the extension.

## Options

Click the extension icon -> **Options** (or right-click the icon ->
Options):

| Setting | Effect |
|---|---|
| Position of cite box | Which corner the box sits in |
| Copy selected text with cite | Appends your page selection (card text) under the cite when copying |
| Don't show ratings | Hides the letter grade |
| Use large font for cite box | Bigger box and text |
| Use / instead of - in cite dates | `7/27/2026` instead of `7-27-2026` |
| Debug mode | Logs per-field sources and the grade breakdown to the console |
| Cite Format | Standard / Frontloaded / Two-Line / Custom |
| Keyboard Shortcuts | Re-bind any of the six shortcuts |

The toolbar popup has the master ON/OFF switch and a shortcut reference.

### Cite formats

Presets:

```
Standard      First Last, Quals, m-d-yyyy, "Title," Publication, URL
Frontloaded   First Last yy, Quals, m-d-yyyy, "Title," Publication, URL
Two-Line      Last yy
              (First Last yy, Quals, m-d-yyyy, "Title," Publication, URL)
```

Custom is the default, preset to:

```
%last% %y% --- (%first% %last%, %date%, "%title%", %publication%, %url%, %quals%, doa%accessed%) //jx
```

Custom formats replace the codes between `%`'s and keep all other text and
whitespace:

| Token | Meaning |
|---|---|
| `%author%` | Author's full name |
| `%first%` / `%last%` | First/last name (last falls back to the publication when there's no individual author) |
| `%quals%` | Author qualifications, if any |
| `%date%` | Full publish date |
| `%y%` | 1 or 2 digit year |
| `%title%` | Article title |
| `%publication%` | Publication |
| `%url%` | Full URL |
| `%accessed%` | Today's date |
| `%linebreak%` | Line break |

Empty fields (a missing `%quals%`, say) don't leave dangling commas behind.

## Permissions

- `storage` - saves your settings (synced to your Chrome account).
- Content script on `<all_urls>` - this is what makes it work automatically
  everywhere. Chrome shows it as "read and change all your data on all
  websites". It only ever reads the page's metadata and text, never modifies
  the page, and nothing leaves your machine.

There's no background service worker and no remote requests.

## Known limitations

- Doesn't work inside PDFs, or on `chrome://` pages.
- Single-page apps that swap articles without a full page load won't
  re-trigger a scan - reload the page.
- Author qualifications are rarely published as structured data, so that
  field is often empty. `ctrl+alt+2` over the author's bio line is the
  fastest fix.
- Byline detection falls back to common CSS selectors, which can
  occasionally grab the wrong text - that's what the grade is warning you
  about.
