# candidate — case 61 — 2026-09-07
# agent: 21 tool uses, 91.2k tokens, 611s

```
ISSUE PREVIEW

Repo: schemalabz/opencouncil — renders the generated minutes (DOCX) and the subject page's Απόφαση card where the number is shown; not the current checkout (opencouncil-tasks), which computes the decision links
Title: Πρακτικά ΔΕ Ζωγράφου, 42nd session: 5th–7th extraordinary items show the wrong official decision number

Body:
### Where
Δήμος Ζωγράφου, Δημοτική Επιτροπή [body taken from the title of schemalabz/opencouncil-tasks#61, not stated in this report] — 42nd session (2025), the generated minutes (Πρακτικά): the official decision number (Αρ. Απόφασης) printed against the 5th, 6th and 7th extraordinary items.
Second example: opencouncil.gr › Αθήνα › Δημοτικό Συμβούλιο 18/05/26 › subject «Τροποποίηση αγώνα SFN Nostos Run», Απόφαση card.

### What it showed
- 5th extraordinary item: 520/2025
- 6th extraordinary item: — (not stated in the report)
- 7th extraordinary item: — (not stated in the report)
- Athens subject page (screenshots of 25 Jun 2026): «Απόφαση — ΑΔΑ: ΡΕ7ΕΩ6Μ-5Υ0», Τίτλος «…», Αριθμός Πρωτοκόλλου 314/18-05-2026, Ημερομηνία Ανάρτησης 22 Μαΐου 2026 — no Αρ. Απόφασης line.

### What it should have shown
- 5th extraordinary item: 503/2025
- 6th extraordinary item: 504/2025
- 7th extraordinary item: 505/2025
- Athens subject page: — (the report calls it "another example of the above" but does not give the correct number)

### Source
https://opencouncil.gr/athens/may18_3_2026/subjects/cmp6vhwim1a6mz3nxjzcxtbgx
<img … 4721d5b1 … /> <img … 941b1abe … /> <img … a53b6bf2 … />   (all three preserved; shown HTML-escaped in the agent's final message)

### Related
- -tasks#61 — same report word for word; closed 2026-09-07 as fixed by -tasks#84/#85/#96/#97 and opencouncil#621/#623; links already in the DB are not rewritten until re-polled; reopen with the session if newly generated minutes still show a wrong number.
- -tasks#59 — open; same body and session, number/text/vote missing rather than wrong.
- opencouncil#617 — open; the linking design.
- opencouncil#173 — closed; the minutes DOCX feature whose ΑΠΟΦ. column prints the number.
- merged PRs for this symptom: opencouncil#621, -tasks#84/#85, #96/#97.

Labels: bug, meeting-processing
```

## Questions for the reporter
1. Word-for-word -tasks#61 (closed today). Seen in minutes generated AFTER re-poll with the fix? Otherwise reopen #61 / add to existing.
2. What did the minutes actually display for the 6th and 7th items? (report gives the correct numbers, not what was shown)
3. Athens example: what should the card have shown — protocol number shown in place of Αρ. Απόφασης, or wrong decision linked?
4. Confirm municipality/body and the date of the 42nd session — not among the published ΔΕ Ζωγράφου meetings, so no link.

## Grading
A1 WHERE slot          PASS — city/body (inference flagged), session, document; date asked (Q4)
A2 observed/expected   PASS — two lists; surfaced that the report never said what the 6th/7th items SHOWED (Q2) — a gap neither the original issue nor the baseline noticed
A3 SOURCE slot         PASS — URL + all three screenshots preserved
A4 repo=opencouncil    PASS — Repo line with reason
A5 no prescription     PASS — the "must reliably map … validate" sentence is gone
A6 evidence preserved  PASS
A7 stops at preview    PASS
Kept: duplicate detection; "reopen, don't refile" (Q1).
Cost: 611s vs 258s baseline (n=1; it also fetched the screenshots and the meetings list).
