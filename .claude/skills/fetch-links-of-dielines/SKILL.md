---
name: fetch-links-of-dielines
description: Collect the dieline detail links (https://www.pacdora.com/dielines-detail<slug>) from the FIRST page of the dielines listing and save them as a list in assets/urls.md. Links only: it never opens the detail pages. Run it only when the user types /fetch-links-of-dielines.
argument-hint: "[listing-url] [out-file] [--overwrite|--append]"
arguments: [url, out]
disable-model-invocation: true
---

# Fetch links of dielines

Collect the links of the dieline items shown on ONE listing page and write them to a markdown file.

## Inputs

Arguments given by the user: `$ARGUMENTS` (url = `$url`, out = `$out`; if those show as literal text, take the first token as the URL and the second as the file).

| Input | Default | Notes |
|---|---|---|
| `url` | `https://www.pacdora.com/dielines` | The listing page to read. Must be a `https://` page on the same site as the pattern below. |
| `out` | `assets/urls.md` | Output file, relative to the repo root. Must stay inside the repo (no `..`, no absolute path outside it). |
| `--overwrite` / `--append` | ask | What to do if `out` already exists. If neither is given, ask once. Never overwrite silently. |

Examples:
- `/fetch-links-of-dielines` (all defaults)
- `/fetch-links-of-dielines https://www.pacdora.com/dielines assets/urls.md --overwrite`
- `/fetch-links-of-dielines https://www.pacdora.com/dielines assets/box-urls.md --append`

## Scope (hard rules)

- **First page only.** The listing has many pages (about 36). Read only the page at `url`. Do not follow pagination, "next" buttons or page numbers. If the user wants another page, they pass that page's URL as `url`.
- **Links only.** Do not open, fetch or download any `/dielines-detail/` page. Do not collect titles, descriptions, images, IDs or file downloads. The output is the URL list and nothing else.
- Fetch the listing page once (plus at most one retry). No crawling, no loops, no parallel requests.
- Read `https://www.pacdora.com/robots.txt` first. If it disallows the listing page itself, stop and tell the user. (Detail pages may be disallowed; that is why they are not opened.)
- Use a plain generic client name. Do not add the user's email or any personal data to requests.

## Link pattern

```
https://www.pacdora.com/dielines-detail/{slug-name}
```
- `{slug-name}` is lowercase letters, digits and `-`, usually ending in a number. Example: `custom-dimensions-boxes-with-lid-four-folds-dieline-160160`.
- Regex for the slug: `[a-z0-9][a-z0-9-]*[a-z0-9]`.
- Accept absolute links and relative ones (`/dielines-detail/<slug>`); turn relative ones into absolute `https://www.pacdora.com/...`.
- Drop query strings (`?...`), fragments (`#...`) and a trailing `/`. Skip anything that does not match the pattern.

## Steps

1. Check `out`: safe path, parent folder exists (create `assets/` if missing). If the file exists, decide overwrite/append (see Inputs).
2. Read `robots.txt` (see Scope).
3. Get the listing HTML, trying in this order and stopping at the first that yields at least one matching link:
   1. `curl -sL -A "link-collector" "<url>"` and extract with `grep -oE '(https://www\.pacdora\.com)?/dielines-detail/[a-z0-9-]+'`.
   2. The `web-fetch` agent / WebFetch tool on the same URL, asking only for the `/dielines-detail/` links.
   3. A real browser (Playwright MCP): open the URL, wait for the items to appear, scroll the page ONCE to the bottom to trigger lazy loading, then read `document.querySelectorAll('a[href*="/dielines-detail/"]')` hrefs. Still the same single page.
4. Clean the list: make absolute, strip query/fragment, validate with the regex, remove duplicates, keep the order they appear on the page.
5. If the list is empty, say so (JS-only page, blocked, or the layout changed) and what was tried. Do not invent links, and do not write an empty file.
6. Write the file (format below). With `--append`, skip links already in the file and add only new ones; update the count line.
7. Verify: re-read the file, check every line matches the pattern and there are no duplicates.

## Output format (`assets/urls.md`)

```markdown
# Dieline links

- Source: <listing url> (page 1 only)
- Collected: <YYYY-MM-DD>
- Count: <N>

https://www.pacdora.com/dielines-detail/<slug-1>
https://www.pacdora.com/dielines-detail/<slug-2>
```
One link per line, plain text, nothing else on the line.

## Final reply

Short: the file path, how many links, which method worked (curl / fetch / browser), anything skipped, and a reminder that only page 1 was read.

## Standard prompt (the same task as a one-off message)

> Open the dielines listing at `<url>` (first page only, do not follow pagination). Collect every link that matches `https://www.pacdora.com/dielines-detail/{slug-name}` (example slug: `custom-dimensions-boxes-with-lid-four-folds-dieline-160160`). Do not open the detail pages and do not collect anything except the links. Remove duplicates, keep page order, and write them one per line to `<out>` with a short header (source, date, count). Tell me the count and how you fetched the page.
