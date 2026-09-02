# PR #673 — `build(deps): bump the production-minor-patch group across 1 directory with 61 updates`

**Verdict: needs-work.** Do not merge as it stands. Three concrete defects, all reproduced locally. The bump is worth landing after they are fixed — it removes a real class of production bug.

- Head: `63310d38f3f445f8a52ff46abc601ca2802d58bd` (2026-08-23), open, author `app/dependabot`, `MERGEABLE`.
- 45 commits behind `upstream/main`. `package.json` has not drifted on main since the merge base, so the manifest diff is still valid. The lockfile still needs a rebase before merge.
- Archetype: **grouped batch** (61 runtime bumps) that also contains **externally coupled** members (a `patch-package` patch pinned to an exact version; `sharp` and `next` native binaries under the Nix build).

## Blockers

### 1. `patch-package` fails — every CI job dies before it runs anything

`patches/@auth+prisma-adapter+2.7.4.patch` is pinned to version 2.7.4. The PR moves `@auth/prisma-adapter` to 2.11.3, so `npm ci` fails in `postinstall`:

```
**ERROR** Failed to apply patch for package @auth/prisma-adapter
  Patch was made for version: 2.7.4
  Installed version: 2.11.3
```

This is the sole cause of all three red jobs: `Integration (testcontainers)`, `Notis (services/notis)`, and `Nix Checks` (the failure appears inside `opencouncil-check-types`, `opencouncil-check-lint` and `opencouncil-check-tests`). **Nothing in this PR has been exercised by CI at all** — red here means "install failed", not "tests failed".

The patch is not obsolete. I diffed the published tarballs for 2.7.4 and 2.11.3: upstream `useVerificationToken` **still** calls `p.verificationToken.delete(...)` in 2.11.3. Our patch (commit `f1cd142d`, "Do not delete verification tokens") deliberately swaps that for `findUnique` so a magic link is not consumed on first fetch. Dropping the patch would silently re-enable single-use sign-in links.

A rename is not enough — the surrounding code changed in 2.11.3 (`// @ts-expect-errors` comment gone, `if ("id" in verificationToken && verificationToken.id)`, a widened `P2025` guard), so the hunk will not apply. The patch must be regenerated against 2.11.3 and committed as `patches/@auth+prisma-adapter+2.11.3.patch`.

### 2. `mapbox-gl` 3.13 → 3.29 breaks the WebGL support check — silently, at runtime

`src/lib/webgl.ts:13`

```ts
cachedResult = mapboxgl.supported({ failIfMajorPerformanceCaveat: false });
```

- On main (3.13.0), `supported` is `@mapbox/mapbox-gl-supported`'s `IsSupported`, which takes an **options object**.
- At the PR head (3.29.0), mapbox inlined it: `declare function isSupported(failIfMajorPerformanceCaveat?: boolean): boolean`.

`tsc` catches it (`TS2345: Argument of type '{ failIfMajorPerformanceCaveat: boolean; }' is not assignable to parameter of type 'boolean | undefined'`), but the runtime consequence is the part that matters: an object is **truthy**, so the call now means `failIfMajorPerformanceCaveat = true` — the exact opposite of the intent. Any device falling back to a software renderer would be reported as unsupported and lose every map. Fix: `mapboxgl.supported(false)`.

### 3. Typecheck fails: 60 errors, all introduced by this PR

Control run on the main working tree (same TypeScript 5.5.4): **0 errors**. At the PR head: **60**.

| File | Count | Cause |
|---|---|---|
| `src/lib/search/__tests__/query.test.ts` | 52 | `@elastic/elasticsearch` 9.0.1 → 9.5.0 — `estypes.QueryDslQueryContainer` members are now optional, so the test helpers need `?.`/narrowing |
| `scripts/search-eval.ts` | 6 | same |
| `src/lib/ai.ts` (line 318) | 1 | `@anthropic-ai/sdk` 0.56 → 0.120 — `Messages.Usage` gained required `cache_creation`, `inference_geo`, `output_tokens_details`; the merged-usage object literal no longer satisfies it |
| `src/lib/webgl.ts` (line 13) | 1 | mapbox, above |

`next.config.mjs` sets no `typescript.ignoreBuildErrors`, and `tsconfig.json` excludes only `node_modules`, `result*`, `services`, `tests` — `src/**/__tests__` is in scope. So `npm run build` fails too, not just the Nix `check-types` derivation.

## What is fine

- **`services/notis` typechecks clean** at the PR head. It was already on `@anthropic-ai/sdk` ^0.116.0, so 0.120 is a small step there; the root going 0.56 → 0.120 is what carries the risk.
- **Unit tests: 125 suites, 1705 passed, 1 skipped**, run against the PR's `node_modules`. Note that this proves less than it looks: no test file references `sharp`, `@mux/mux-video`, `mapbox-gl`, `terra-draw`, `axios`, `@aws-sdk`, `sanitize-html`, `dompurify`, or `@auth/prisma-adapter`, and the one `@anthropic-ai/sdk` test is a `jest.mock`.
- **No overlap with any other open PR.** I checked #670, #667, #665, #664, #663, #507, #439 — none touches a package in this group.
- **`next` 16.2.12 → 16.3.2** stays coherent with `sharp`: next's optional `sharp` range moves `^0.34.5` → `^0.35.3` and the root bump to 0.35.3 satisfies it, so next's nested copy disappears. `@img/sharp-linux-x64` and the musl variants are all present in the lockfile, so the Nix/buildpack native path is covered.

## What this unlocks (the reason to fix it rather than close it)

- **`@radix-ui/react-dismissable-layer` collapses from 6 copies to 1.** Nested `@radix-ui/*` duplicates across the whole lockfile drop **87 → 2**; total lockfile entries drop 1927 → 1780. This is the root cause behind the known "modal dropdown → dialog freezes the page" bug (body `pointer-events` leaking between duplicate layer copies). After this lands, the seven `modal={false}` workarounds are candidates for removal — `src/components/offer-letter/documents-dropdown.tsx:78`, `src/components/consultations/ConsultationMap.tsx:834`, `src/components/consultations/DetailPanel.tsx:471`, `src/components/highlights/HighlightActionsMenu.tsx:119`, `src/components/meetings/decisions/MeetingDecisionsPage.tsx:754` (plus the explanatory comments at `documents-dropdown.tsx:76` and `MeetingDecisionsPage.tsx:110`). Worth a follow-up PR, not this one.
- **`@auth/core` version skew disappears.** Main carries three copies — `0.39.1` at the root, `0.37.4` nested under `@auth/prisma-adapter`, `0.41.3` nested under `next-auth`. The PR collapses all three to `0.41.3`, which is what `next-auth@5.0.0-beta.32` pins as an exact dependency. The adapter stops being built against types two minors behind the runtime.

## Evidence table

| Claim | How it was established |
|---|---|
| `patch-package` is the only CI failure | `gh run view --log-failed` on all three failed jobs; identical error, all before any test step |
| The patch is still required at 2.11.3 | Downloaded both tarballs from the registry; `useVerificationToken` still calls `.delete(...)` in 2.11.3 |
| The patch will not apply after a rename | Line-by-line comparison of the 2.7.4 and 2.11.3 `index.js` context around the hunk |
| Baseline is clean | `npx tsc --noEmit` on the main working tree → 0 errors, TypeScript 5.5.4 |
| 60 errors are the PR's | `npm ci --ignore-scripts` in a detached worktree at `63310d38`, `prisma generate` for both clients, then `npx tsc --noEmit` → 60 errors, same TypeScript 5.5.4 |
| mapbox signature change | Compared `mapbox-gl.d.ts` in both installs: `supported: IsSupported` (options object) at 3.13.0 vs `isSupported(failIfMajorPerformanceCaveat?: boolean)` at 3.29.0; `supported:function` confirmed still present in the 3.29 bundle, so the failure is silent, not a throw |
| Unit tests pass | `npm test` in the same worktree: 125/125 suites, 1705 tests |
| notis is clean | `npx tsc --noEmit` in `services/notis` → exit 0 |
| Dedupe numbers | Counted `node_modules/**/node_modules/@radix-ui/*` keys and `@auth/core` entries in both lockfiles |
| No overlapping PR | `gh api .../pulls/<n>/files` package.json hunks for every other open dependency PR |

## What I could not verify

- **No production build.** I ran the typecheck gate instead, per budget. The build fails for certain on the two `src/` errors, but I have not seen what else surfaces after those are fixed — `next` 16.3, `next-intl` 4.13, and 17 Radix bumps can produce build-time or render-time problems a typecheck never sees.
- **No integration suite.** It cannot run until the patch is fixed.
- **Anything visual.** 17 Radix minors, `mapbox-gl` +21 minors, `terra-draw` 1.9 → 1.32, `@mux/mux-video` 0.20 → 0.31, `video.js` 8.17 → 8.24, `react-day-picker` untouched but its peers moved. None of it is under test. A preview deploy is the only way to see it, and the preview job is currently skipped because CI is red.
- **Sign-in end to end.** `@auth/core` 0.39 → 0.41 plus a regenerated adapter patch touches the magic-link path directly. `src/lib/__tests__/invite.test.ts` mocks Prisma, so it proves nothing here. Verify a real magic-link login on the preview before merging.
- **`@anthropic-ai/sdk` runtime behaviour.** 64 minor versions of a 0.x SDK. The one type error is at a usage-merging site; whether `messages.create` request/response handling shifted anywhere else is unverified, and the only test mocks the module.

## The work, concretely

1. Regenerate the patch against 2.11.3 and commit it as `patches/@auth+prisma-adapter+2.11.3.patch`; delete the 2.7.4 file. Keep the intent: `findUnique` instead of `delete`, `verificationToken?.id` guard.
2. `src/lib/webgl.ts:13` → `mapboxgl.supported(false)`.
3. `src/lib/ai.ts:318` — carry the three new `Usage` fields through the merge, or type the merged object as `Partial<Usage>` at the boundary rather than claiming it is a full `Usage`.
4. Narrow the optional `estypes` members in `src/lib/search/__tests__/query.test.ts` and `scripts/search-eval.ts` (58 errors, mechanical).
5. `@dependabot rebase` — 45 commits of lockfile drift.
6. Then let CI run for real, and check a magic-link sign-in plus a map page on the preview.

Items 2 to 4 are source changes Dependabot cannot make. Either push them onto the Dependabot branch or land them on main first and rebase.
