# baseline (committed skill @ 369b390) — case 55 — 2026-09-07
# agent: 21 tool uses, 73.9k tokens, 249s

```
ISSUE PREVIEW

Repo: schemalabz/opencouncil

Title: Πρακτικά ΔΕ Ζωγράφου: show Deputy Mayor Stamatakis' title as «Αντιδήμαρχος» only

Body:
### Concept
In several Δημοτική Επιτροπή (Municipal Committee) minutes generated for Ζωγράφου, Zacharias Stamatakis is titled "Αναπληρωτής Δήμαρχος", or "Αντιδήμαρχος" with extra text appended. In that body he holds the office of Αντιδήμαρχος, and the minutes are a record the municipality circulates, so his title there must read "Αντιδήμαρχος" and nothing else.

Every variant is a correction staff have to make by hand before the document can be used, which undercuts the point of generating the minutes.

### User Story
As a municipal secretary preparing Municipal Committee minutes from OpenCouncil, I want each member's title in the document to be the office they hold in that body, so that I can circulate the minutes without correcting titles by hand.

### Context
- Reported by Ζωγράφου for their Municipal Committee minutes. The same text was filed as schemalabz/opencouncil-tasks#55 (open, unlabelled) in the June 2026 batch of "Πρακτικά ΔΕ Ζωγράφου" reports; schemalabz/opencouncil-tasks#56 covers a sibling problem in the same minutes ("Επικεφαλής" appended to opposition leaders).
- The minutes .docx is produced by the meeting admin's minutes export in this repo, which picks one role per person from their stored roles at the meeting date and prints it next to the name.
- #604 documents that the shared role-label helpers pick between a city office (Δήμαρχος/Αντιδήμαρχος) and a committee office differently depending on the surface, with Αντιδήμαρχος examples from committee sittings. Whether this is the same mechanism, or the "Αναπληρωτής Δήμαρχος" text comes from the person's stored role data, has not been verified.
- The specific meetings where the wrong title appeared are not yet identified (see questions).

Labels: bug, admin-tools
```

## Questions for the reporter
1. Related: -tasks#55 (identical text), -tasks#56, opencouncil#604 — same request?
2. Which minutes documents showed the wrong title (meeting dates / links), and what exactly was the extra text?
3. Where in the document: next to his name where he speaks, the composition block, or both?

## Grading (assertions from evals.json, written before the run)
A1 WHERE slot          PARTIAL — city+body in Concept prose, session only as a question; no slot
A2 observed/expected   FAIL    — prose ("is titled X … must read Y"), no distinct fields
A3 SOURCE slot         FAIL    — asked in Q2, no slot in body
A4 repo=opencouncil    PASS    — reasoned from the artifact after reading the code (21 tool uses)
A5 no prescription     FAIL    — "must read 'Αντιδήμαρχος' and nothing else" kept in Concept
A6 evidence preserved  PASS
A7 stops at preview    PASS
Shape note: bug rendered in the feature template — a "User Story" for a wrong title.
Mechanism speculation (#604) hedged but present.
