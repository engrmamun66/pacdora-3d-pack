---
name: fetch-links-of-dielines
description: Collect dieline detail links (https://www.pacdora.com/dielines-detail/<slug>) from the dielines listing, for page 1 or any page range such as 2-36, and save the links of each page in its own file (assets/dieline-urls/page-<page>.md by default). The listing is paginated in the browser, so pages are reached by clicking "next". Links only: it never opens the detail pages. Run it only when the user types /fetch-links-of-dielines.
argument-hint: "[listing-url] [pages: N or A-B, default 1] [out-file with <page>, default assets/dieline-urls/page-<page>.md] [--overwrite|--append]"
arguments: [url, pages, out]
disable-model-invocation: true
---

# Fetch links of dielines

Collect the links of the dieline items shown on the listing pages the user asks for, and write them to markdown files, one file per page.

## Inputs

Arguments given by the user: `$ARGUMENTS` (url = `$url`, out = `$out`, pages = `$pages`; if those show as literal text, take the tokens in that order, skipping `--` flags).

| Input | Default | Notes |
|---|---|---|
| `url` | `https://www.pacdora.com/dielines` | The listing page. Must be `https://www.pacdora.com/...` with no query string. |
| `out` | `assets/dieline-urls/page-<page>.md` | Output file name **template**. `<page>` is replaced by each page number, so `pages` 2-36 writes `assets/dieline-urls/page-2.md` ... `assets/dieline-urls/page-36.md`. Must stay inside the repo (no `..`, no absolute path outside it). If `out` has no `<page>`, all pages go into that one file instead (see "Single file mode"). |
| `pages` | `1` | `N` for one page, `A-B` for a range (for example `2-36`). 1-based, in listing order. |
| `--overwrite` / `--append` | ask | Only matters if a target file already exists. `--overwrite` replaces it. `--append` keeps existing files and writes only the missing ones (per-page mode), or adds new links to the single file (single file mode). If neither is given and a target exists, ask once for all of them. Never overwrite silently. |

Examples:
- `/fetch-links-of-dielines` (page 1 into `assets/dieline-urls/page-1.md`)
- `/fetch-links-of-dielines https://www.pacdora.com/dielines assets/dieline-urls/page-<page>.md 2-36` (the rest of the site, one file per page)
- `/fetch-links-of-dielines https://www.pacdora.com/dielines assets/dielines/p<page>.md 10-12 --overwrite`
- `/fetch-links-of-dielines https://www.pacdora.com/dielines assets/urls.md 2-36 --append` (single file: no `<page>` in the name)

## Scope (hard rules)

- **Only the pages asked for.** Default is page 1. Never go beyond the last page the site shows (the helper reads it from the pagination; it is 36 now) and never beyond page 60.
- **Links only.** Do not open, fetch or download any `/dielines-detail/` page. Do not collect titles, descriptions, images, IDs or file downloads. The output is the URL lists and nothing else.
- **Gentle, one at a time.** One browser, one page change at a time, at least 2 seconds between page changes (the helper uses 2.5 s). No parallel requests. On an error, stop and report what was collected; do not retry in a loop.
- Read `https://www.pacdora.com/robots.txt` first. If it disallows the listing page itself, stop and tell the user. Detail pages and URLs with a query string are disallowed there; that is why detail pages are never opened and no query URL is ever requested.
- Use a plain client; add no personal data (such as the user's email) to requests.

## Link pattern

```
https://www.pacdora.com/dielines-detail/{slug-name}
```
- `{slug-name}`: lowercase letters, digits and `-`, usually ending in a number. Example: `custom-dimensions-boxes-with-lid-four-folds-dieline-160160`.
- Regex for the slug: `[a-z0-9][a-z0-9-]*[a-z0-9]`.
- Accept absolute and relative (`/dielines-detail/<slug>`) links; always write the absolute `https://www.pacdora.com/...` form.
- Drop query strings, fragments and a trailing `/`. Skip anything that does not match.

## How the site works (why a browser and clicks)

The listing is rendered by JavaScript, and its page numbers do not change the address bar. A plain `curl` or fetch returns no item links, and one cannot jump to page 17 by URL. The page has a pagination bar (`.pagination-item`); the "next" arrow is `.pagination-item.arrow` (not `.flip`, not `.disabled`). To reach page N, start at page 1 and click "next" N-1 times, waiting for the page number and the items to change after each click.
Every page repeats one pinned item at the top (for example `...double-tray-dieline-100010`). In per-page mode it is kept, because each file lists what its page shows.

## Steps

1. Parse `pages` into `first`..`last` (a single `N` means `N`..`N`). Reject `first > last`, `last > 60`, or non-numbers. Work out the target files: for each page, `out` with `<page>` replaced by the number (per-page mode), or the one file (single file mode). Each name must be a safe relative path inside the repo; create missing parent folders (for example `assets/`). List the targets that already exist and decide overwrite / append (see Inputs).
2. Read `robots.txt` (see Scope).
3. Run the helper that sits next to this file (it needs only Python 3 and a local Chrome; it launches its own private headless Chrome and cleans up):
   ```
   python3 -I "${CLAUDE_SKILL_DIR}/collect_links.py" --url "<url>" --first <first> --last <last> > "<scratchpad>/links.json"
   ```
   - Run it with the Bash tool in the background when `last - first` is large (2-36 takes a few minutes: about 4 s per page). Wait for the completion notice; do not poll in a loop.
   - Output is JSON: `source`, `requested`, `site_last_page`, `pages` (page number to list of links), `errors`. Progress lines go to stderr.
   - If `errors` is not empty, still write the pages that were collected, say which page failed and why, and offer to resume with `pages=<failed>-<last>` (and `--append` so finished files are kept).
   - If Chrome is missing, pass `--chrome <path>` or set `CHROME_BIN`.
   - Fallback when the helper cannot run: the Playwright MCP browser, doing the same clicks and the same delay. If it says the browser is "already in use", do not close or kill it (it belongs to another session); use the helper instead.
4. Clean each page's list: absolute URLs, validated against the regex, duplicates inside that page removed, page order kept. Skip a page that came back empty (and say so) instead of writing an empty file.
5. Write the files (formats below). Never write outside the targets from step 1.
6. Verify: re-read every file written, check each link line matches the pattern, there are no duplicates inside a file, and Count equals the number of links.

## Output format, one file per page (`assets/dieline-urls/page-<page>.md`)

```markdown
# Dieline links - page <N>

- Source: <listing url>
- Page: <N>
- Collected: <YYYY-MM-DD>
- Count: <links in this file>

https://www.pacdora.com/dielines-detail/<slug-1>
https://www.pacdora.com/dielines-detail/<slug-2>
```
One link per line, plain text, nothing else on the line.

## Single file mode (only when `out` has no `<page>`)

All requested pages go into the one file, in page order, duplicates across pages removed (first occurrence wins). Header:

```markdown
# Dieline links

- Source: <listing url>
- Pages: <e.g. 1-36>
- Collected: <YYYY-MM-DD>
- Count: <total links>
```
With `--append`: keep the old links first, add only the new ones after them, merge the `Pages` ranges (an old `(page 1 only)` note becomes `Pages: 1`), and recompute Count and Collected.

## Final reply

Short: how many files were written (and their folder), links per page or in total, any page that failed or was skipped, and that no detail page was opened.

## Standard prompt (the same task as a one-off message)

> Open the dielines listing at `<url>` in a real browser. It is paginated client-side (the address does not change), so click the pagination's "next" arrow one page at a time, waiting at least 2 seconds between pages and never more than one page at a time, until pages `<first>` to `<last>` have been read. On each page collect every link that matches `https://www.pacdora.com/dielines-detail/{slug-name}` (example slug: `custom-dimensions-boxes-with-lid-four-folds-dieline-160160`). Do not open the detail pages and do not collect anything except the links. Write the links of each page, in page order without duplicates, to its own file named `<out with the page number in place of <page>>` (default `assets/dieline-urls/page-<page>.md`), each with a short header (source, page, date, count). Tell me the count per page, the total, and any page that failed.
