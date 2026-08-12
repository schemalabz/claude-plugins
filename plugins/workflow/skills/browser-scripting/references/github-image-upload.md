# Attaching images/videos to a GitHub PR/issue comment

GitHub's user-attachments CDN — what you normally get by drag-dropping a file into a comment box — has **no token/API**. It only works through a logged-in browser session. So this is a hybrid: use Playwright (with a GitHub session) to upload the files into a comment box and **scrape the hosted URL**, then post the actual comment (with those URLs in markdown) via `gh api`. The browser is only a "file → URL" step; the comment goes through the normal API.

Works for images (render inline) and videos (`.mp4`/`.mov` render as a player). Bundled scripts live in `../scripts/` relative to this file.

## Step 1 — GitHub session (once per machine)

Reuse an existing `.scratch/gh-session.json` if one is present. Otherwise capture one — this opens a real browser window to log in, so it needs a display; run it headed and backgrounded:

```
DISPLAY=:0 playwright-run <skill-dir>/scripts/gh-login.mjs .scratch/gh-session.json
```

On macOS, drop the `DISPLAY=:0` prefix — the headed browser opens without it.

Log in when the window opens; it saves the storage state and exits (`SESSION SAVED`).

## Step 2 — Upload + scrape the URLs (nothing is posted)

```
playwright-run <skill-dir>/scripts/gh-upload.mjs .scratch/gh-session.json <pr-or-issue-url> shot1.png clip.mp4 ...
```

Prints `FILE<tab>URL` per asset and a `JSON {...}` map at the end. The asset persists on GitHub the moment it's uploaded; the script abandons the draft afterward, so **nothing is posted**. Optionally sanity-check the URLs resolve (they're auth-gated until the comment is posted, so use the session, not anonymous `curl`):

```
playwright-run <skill-dir>/scripts/gh-verify.mjs .scratch/gh-session.json <url> ...
```

## Step 3 — Post the comment with those URLs

Embed in markdown — `![alt](url)`, `<img width="700" src="url">` for sizing, a **bare URL on its own line** for videos, `<details>` to collapse. Post via the API so the body survives shell quoting (write it to a file first):

```
gh api repos/<owner>/<repo>/issues/<N>/comments --method POST --input body.json
# body.json = {"body": "text...\n![shot](https://github.com/user-attachments/assets/<uuid>)"}
```

For a PR **review** (a verdict, not just a comment), put the URLs in the review body and POST to `.../pulls/<N>/reviews` with `{"event": "APPROVE"|"COMMENT"|"REQUEST_CHANGES", "body": ...}`.

## Gotchas

- The scripts target the **last** `input[type=file]` on the page — the main comment box's.
- Wait until the textarea shows the `user-attachments/assets/<uuid>` URL before reading it (skip while it still says `Uploading`). The upload script already does this.
- `jq` isn't always on PATH (e.g. outside a nix shell). Build `body.json` with `python3 -c 'import json,sys; ...'` if `jq` is missing.
- An empty `--input` file silently creates a **PENDING** (unsubmitted) review — always verify the payload built before POSTing.
- Anonymous `curl` of an asset returns 404 until the comment referencing it is posted; verify with the authenticated session (`gh-verify.mjs`) instead.
