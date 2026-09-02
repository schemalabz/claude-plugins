---
name: writing-team-skills
description: Use when adding a skill to this repo, changing an existing one, or deciding whether an observation from real work is worth encoding. Also use when someone asks whether a skill edit actually helped.
---

# Writing team skills

Skills here are edited because a real run went wrong, not because an improvement
occurred to someone. This skill is how an observation becomes an edit, and how you
tell whether the edit did anything.

## The constraint everything follows from

Lessons arrive **mid-task**, while you are doing something else and cannot stop.
A workflow that requires stopping to run an evaluation produces zero iterations and
the lesson dies in the transcript. So capture and change are separate:

- **Capture** is free, happens in-flight, has no gate, blocks nothing.
- **Change** is batched, gated, deliberate.

Capture goes in a local, untracked backlog — a scratch file next to the skill, or
wherever you keep working notes. One entry, one citation, done, then get back to what
you were doing.

**The backlog is not a team artifact and does not get committed.** It is half-formed
observations about work in progress; publishing it puts unreviewed opinion in a repo
people read as settled guidance. What lands in the repo is the edit it justified, and
the eval that justified it.

## The one hard rule

**Every entry cites the run that produced it.** A specific PR, a specific command,
a specific wrong output.

No citation, no entry. This is the cheap version of a control: you cannot always
afford to prove an agent fails without your guidance, but you can require that the
failure already happened once, for real, with a transcript. It is the only thing
standing between a skill and slow accretion into unreadable advice.

## How much verification an edit needs

| Tier | Change | Verification |
|---|---|---|
| 0 | Capture only — a local backlog entry, uncommitted | none |
| 1 | Factual: wrong command, stale path, dead link | check it directly |
| 2 | Structural: a required slot, a reordered phase, a checklist item | one run against a known-answer case — did the slot get filled? |
| 3 | Behavioural: guidance meant to change judgment | full before/after (below) |

Most edits are tier 2, and tier 2 is cheap precisely because you are looking for a
slot rather than judging quality.

Tier the *skills* too. A reference skill (`digitalocean`) needs factual accuracy and
will never need an eval. Judgment skills (`review-dependency-pr`, `review-pr`,
`challenge-pr`) are where tier 3 pays.

## Running an eval

An eval is two agents, one variable, and a fact you can check independently.

1. **Snapshot the current skill.** `cp -r <skill> <workspace>/skill-snapshot`. That
   is your baseline — for an existing skill the baseline is the committed version,
   not "no skill".
2. **Write the candidate.** Change one thing, or a small set of related things.
3. **Pick a case with known ground truth.** Harvest it from real use (see below).
4. **Write assertions before running.** Each one names something the change is
   *supposed to cause*. Check each is answerable on your case — an assertion about
   bot comments on a PR with no bot comments passes or fails for reasons unrelated
   to the skill, and teaches nothing. Drop it.
5. **Run both in the same turn**, identical prompts, identical environment, fresh
   contexts. The only difference is the skill path.
6. **Grade against the assertions**, then read both outputs yourself.

### Assert on process, not on numbers

A case pinned to "reports 76 errors" goes stale the moment the branch moves. A case
pinned to "reports a count rather than a truncated sample" stays true forever and
is reusable as a regression test.

### Keep a tier that you expect to tie

Score what the change should cause **separately** from generic output quality. Any
competent agent writes a decent review; if you collapse both into one number the two
arms tie and you conclude the change did nothing. This is the single most common way
a skill eval produces a wrong answer.

Add a correctness check as a third tier, so a change that buys ritual instead of
accuracy is visible.

### Adjudicate conflicts yourself

When the two runs disagree on a *fact*, neither is authoritative. Go measure it.
That measurement is usually the most valuable thing the eval produces.

### Expect to reject about half

An eval that never rejects anything is not doing its job. The result you want is not
"the new version is better" but "this edit is doing work and that one is not". Record
rejections — in the backlog while you are working, and in the commit message of the
edit that shipped alongside them, so the reasoning survives where the team will find
it.

## Ground truth is a byproduct — this is the compounding part

Real use generates cases with known answers for free. After a handful of uses a
judgment skill has a regression suite nobody sat down to write.

Keep them next to the skill, not in a scratch directory that gets cleaned:

```
skills/<name>/
  SKILL.md
  evals/
    evals.json            # prompts, assertions, pinned ground truth
    reference-outputs/    # dated outputs worth diffing against later
```

The backlog stays out of this tree — see above.

`review-dependency-pr/evals/` is the worked example.

## New skills

Same trigger as promoting a one-off to tooling: **the second time** you hand-roll a
process, it becomes a skill. The first time, just do it.

The manual run that motivated the skill **is** its baseline. You already did the task
without a skill — that is the control, for free.

## Common mistakes

| Mistake | Why it bites |
|---|---|
| Running only the candidate | Claude is already good. Without a baseline you cannot tell "my edit worked" from "Claude is competent". |
| A generic rubric | Measures what any agent does, so both arms tie. Score what the skill uniquely adds. |
| Prose where structure belongs | For an omitted step, a required slot in a template beats a paragraph asking for care. |
| Prohibitions for shaping problems | "Don't do X" invites negotiation under a competing incentive. State the shape the output should have. |
| Assertions written after reading the outputs | You will assert what you just saw. Write them first. |
| One run per arm treated as proof | n=1 cannot separate a real effect from run variance. Say so, or run more reps. |

## References

Read these directly (present on this machine):

- **`superpowers:writing-skills`** — skill authoring as TDD. The Iron Law covers
  edits, not just new skills. Its **Match the Form to the Failure** table is the most
  useful page here: prohibitions are for discipline failures; omissions want
  structure. Also has micro-testing guidance (5+ reps, always a no-guidance control,
  read every flagged match by hand, treat variance as a metric).
- **`skill-creator`** (Anthropic, in the official marketplace; installed but not
  enabled here) — the eval rig: `scripts/run_eval.py`, `agents/comparator.md` for
  blind A/B, `agents/grader.md`, an eval viewer, plus a description optimiser that
  uses ~20 should-trigger/should-not-trigger queries. Its improving-an-existing-skill
  path (snapshot the old version, use it as the baseline) is what this skill's eval
  section is built on. Worth enabling when reading every output by hand stops scaling.

Read via search summaries only — WebFetch was blocked in the session that wrote this,
so treat the characterisations as second-hand:

- **[gcamilo/skill-eval](https://github.com/gcamilo/skill-eval)** (README read in
  full via `gh`) — the tiered-rubric argument. Their 5-criteria rubric showed the
  *baseline beating the skill*; a 3-tier rubric separating process discipline from
  output quality reversed it. Also: pairwise comparison with position swap (run every
  comparison twice with positions flipped; a win must win both directions) and
  programmatic checkers run before the LLM judge, injected as constraints so the judge
  cannot hallucinate quality that is not in the output.
- **[Improving skill-creator](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)** — comparator agents judging blind, parallel runs in clean contexts, token and timing metrics.
- **[Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)** — Anthropic's official guidance; also bundled inside `superpowers:writing-skills` as `anthropic-best-practices.md`, which IS readable locally.
- **[Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)** — general agent-eval grounding.
- **[Evaluating Skills (LangChain)](https://www.langchain.com/blog/evaluating-skills)** and **[Evaluating AI Agent Skills (Langfuse)](https://langfuse.com/blog/2026-02-26-evaluate-ai-agent-skills)** — third-party framings.
- **[Testing and Refining Claude Code Skills with MLflow](https://mlflow.org/blog/evaluating-skills-mlflow/)** — tooling-led take.

Academic, for the eval-design question rather than day-to-day practice:
**SkillAxe** (evaluation-guided self-refinement of LLM-authored skills), **SkillAudit**
(skill-centred rather than fixed-suite benchmarking), **SkillEvolBench** (episodic
experience becoming procedural skill).

### Where the sources disagree

`superpowers` bulletproofs with hard prohibitions and rationalization tables.
`skill-creator` says the opposite — *"if you find yourself writing ALWAYS or NEVER in
all caps, or using super rigid structures, that's a yellow flag... reframe and explain
the reasoning."*

They are treating different failures, and `superpowers`' own Match-the-Form table
resolves it: prohibitions for an agent that knows the rule and skips it under
pressure; structure or explanation for an agent that simply omitted something. Classify
the failure before choosing the form.
