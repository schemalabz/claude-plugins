# baseline (committed skill @ 369b390) — case 61 — 2026-09-07
# agent: 17 tool uses, 82.4k tokens, 258s

```
ISSUE PREVIEW

Title: Ensure every agenda item in the minutes carries its correct official decision number

Body:
### Concept
In the 42nd session, three extraordinary agenda items were given the wrong official decision number in the generated minutes: the 5th extraordinary item showed 520/2025 where the correct number is 503/2025, and the 6th and 7th should read 504/2025 and 505/2025. A wrong number on an official document is worse than a blank one — the minutes cannot be handed over without someone checking every item by hand against the register.

Each agenda item should reliably carry the decision number it was actually assigned, and a mismatch should be caught before the final document is produced rather than discovered by the municipality afterwards.

### User Story
As an operations teammate preparing minutes for a municipality, I want each agenda item to show its correct official decision number, so that I can deliver the document without verifying every number manually.

### Context
- This is a re-report of #61 (closed 2026-09-07). [… fixes #84/#85/#96/#97, opencouncil#621/#623; links not rewritten; admin corrects …]
- The 42nd session is Zografou's Δημοτική Επιτροπή per the title of #61; the reporter's text does not name the municipality or the meeting date.
- Second example: https://opencouncil.gr/athens/may18_3_2026/subjects/cmp6vhwim1a6mz3nxjzcxtbgx (… agenda item 59 …). The three attached screenshots are dated 25 June 2026 — before the fixes above — and the decision card at that time showed only "Αριθμός Πρωτοκόλλου 314/18-05-2026" with no separate Αρ. Απόφασης.
- The symptom is visible in the minutes document and on the subject page (both rendered by schemalabz/opencouncil); the reading and matching of decisions runs in this repo.
- Related, still open: schemalabz/opencouncil#617, #59.

Labels: bug
```
(no Repo line — defaults to the -tasks checkout)

## Questions for the reporter
Related: -tasks#61 (closed today, identical text+screenshots), -tasks#59, opencouncil#617 — same?
1. New occurrence after 7 Sep, or the same records as #61? (closing note asks to reopen, not refile)
2. Which municipality/body/date is the "42nd session"?
3. Athens example: what did you expect, what does it show now — wrong field or wrong link?

## Grading
A1 WHERE slot          PARTIAL — "42nd session" kept in prose; municipality/body/date inferred from #61's title and asked; no slot
A2 observed/expected   FAIL    — number pairs inline in Concept prose
A3 SOURCE slot         PARTIAL — URL kept in Context; the three <img> tags DROPPED (described as "three attached screenshots")
A4 repo=opencouncil    FAIL    — knew both repos were involved, wrote no Repo line, silently defaulted to cwd (-tasks)
A5 no prescription     FAIL    — "should reliably carry … a mismatch should be caught before the final document is produced"
A6 evidence preserved  PARTIAL — numbers, session, URL yes; screenshots no
A7 stops at preview    PASS
Good baseline behaviour to keep: found the closed duplicate and said "reopen, don't refile".
