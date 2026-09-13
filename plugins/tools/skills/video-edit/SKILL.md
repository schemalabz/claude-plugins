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
export succeeded on exit code alone. If `reEncoded` is true, say the export fell back to a
full re-encode and took longer. If `verified` is false, the file is not usable — report the
problems.

## Checking a file you were given

```bash
video-edit inspect rec.mp4
```

Anything other than `verdict: ok` means do not upload it. `inspect` catches offsets hidden
behind an MP4 edit list, which plain `ffprobe` reports as healthy — that is exactly the case
that reached production.

## Finding the timestamps

The CLI does not play video. If the user does not already know where the ad break is, say so
and let them find it — the toolkit desktop app has a player for this.
