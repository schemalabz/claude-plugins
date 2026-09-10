# candidate — case 55 — 2026-09-07
# agent: 15 tool uses, 77.5k tokens, 216s

```
ISSUE PREVIEW

Repo: schemalabz/opencouncil — renders the minutes documents (πρακτικά) the title was seen in; not the current checkout (opencouncil-tasks), which only computes their inputs
Title: Πρακτικά Δημοτικής Επιτροπής Ζωγράφου: Ζαχαρίας Σταματάκης shown as «Αναπληρωτής Δήμαρχος» instead of «Αντιδήμαρχος»

Body:
### Where
Δήμος Ζωγράφου, Δημοτική Επιτροπή (Municipal Committee) — the minutes documents (πρακτικά) of several meetings; the report does not name which meetings.

### What it showed
`Αναπληρωτής Δήμαρχος` — in some of the documents followed by additional title text (exact wording not given).

### What it should have shown
`Αντιδήμαρχος` — and nothing else, in every Δημοτική Επιτροπή minutes document.

### Source
Not provided — no links, screenshots or attachments came with the report.

### Related
- schemalabz/opencouncil-tasks#55 — the same report, word for word, open since 2026-06-23 with no labels or comments; filed in the tasks repo rather than the one that renders the minutes.
- schemalabz/opencouncil#604 — open decision on a single body-aware role label …; its measured surfaces do not include the minutes documents.
- schemalabz/opencouncil#599 — merged PR that added speaker roles to MCP subject records; touches role labelling, not the minutes path.

Labels: bug, user-experience
```

## Questions for the reporter
1. Word-for-word -tasks#55 (23 June). New occurrence, or add to #55?
2. Which meetings' minutes? A link or date fills "Where".
3. A link or screenshot showing the exact printed text, incl. an "additional title text" version — fills "Source".

## Grading
A1 WHERE slot          PASS — city + body filled; meetings marked missing and asked (Q2)
A2 observed/expected   PASS — two fields, verbatim values
A3 SOURCE slot         PASS — slot present, "Not provided", asked (Q3)
A4 repo=opencouncil    PASS — Repo line with reason, from the artifact; 15 tool uses vs 21 baseline
A5 no prescription     PASS — the "must" sentence became the expected value; "and nothing else" survives as scope of the expected value, not as an instruction
A6 evidence preserved  PASS
A7 stops at preview    PASS
Kept: duplicate detection (Q1). Title states the symptom.
