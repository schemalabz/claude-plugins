---
name: video-edit
description: Use when cutting, trimming, merging, splitting or joining video files — removing ad breaks from a recording, combining several recordings into one, splitting one recording into separate meetings — or when a video's audio and picture seem out of sync. Also use before uploading any recording to opencouncil.
---

# Editing recordings

Use the `video-edit` CLI. **Never write raw ffmpeg for this.**

The obvious ffmpeg command for cutting is wrong: `-ss` after `-i` with `-c copy` produces a
file whose audio and video start seconds apart. It looks fine until someone watches it. That
defect shipped to production in a published meeting and took a day to trace, which is why
this tool exists.

## Check it is installed

```bash
video-edit --help
```

Not found? The user installs it themselves — download `video-edit` from the
[toolkit releases](https://github.com/schemalabz/toolkit/releases/latest), then
`chmod +x video-edit && xattr -c video-edit && mv video-edit /usr/local/bin/`.

**If commands here run in a sandbox** — Claude Cowork, for instance — the binary will not be
reachable no matter where it is installed. Say so and stop. Do not fall back to ffmpeg: the
obvious ffmpeg command silently desynchronises audio from video, which is the entire reason
this tool exists. Point the user at the **Video Edit** tool in the Schema Labs Toolkit desktop
app, which does the same job with a player and no terminal.

## The workflow

**Always `plan` before `export`.** A five-hour recording takes about ten minutes to export,
and it is irreversible. Show the user what will be produced, get agreement, then export.

```bash
video-edit plan   --input rec.mp4 --remove 1:02:03-1:06:15 --out clean
video-edit export --input rec.mp4 --remove 1:02:03-1:06:15 --out clean --json
```

`--input` repeats and joins in order; `--remove` and `--split` repeat and compose. Positions
are on the joined timeline. Run `video-edit --help` for the full flag list — prefer it over
anything remembered, since it ships with the binary and cannot go stale.

**Check the result.** `export --json` reports `verified` per file. Do not tell the user an
export succeeded on exit code alone. If `verified` is false, the file is not usable — report
the problems.

`reEncoded: true` is normal, not a warning. It means verification rejected the fast path and
the slow one was used instead, which is what produced a correct file from a merge that three
manual attempts got wrong. Mention it only to explain why the export took longer.

## Checking a file you were given

```bash
video-edit inspect rec.mp4
```

Takes a URL as readily as a path, so an uploaded recording can be checked without downloading
it:

```bash
video-edit inspect https://townhalls-gr.fra1.digitaloceanspaces.com/uploads/<file>.mp4
```

Anything other than `verdict: ok` means do not upload it. `inspect` catches offsets hidden
behind an MP4 edit list, which plain `ffprobe` reports as healthy — that is exactly the case
that reached production twice.

## Finding the timestamps

The CLI does not play video. If the user does not already know where the ad break is, say so
rather than guessing — the **Video Edit** tool in the toolkit desktop app has a player,
frame-level nudges and a preview of what will be produced.
