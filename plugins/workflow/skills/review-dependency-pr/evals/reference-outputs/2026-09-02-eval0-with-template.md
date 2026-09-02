# PR #673 — `build(deps): bump the production-minor-patch group across 1 directory with 61 updates`

```
Verdict:        needs-work
Base:           c496b854761fa50ee3b04b5e933cd4ec796d42f5 (upstream/main) -> types gate PASSES, 0 errors
Reviewed head:  63310d38f3f445f8a52ff46abc601ca2802d58bd
Gate on PR:     FAIL — 77 type errors in 4 files (reproduced locally, exact CI match)
                plus `npm ci` fails outright: patch-package cannot apply
Attribution:    every failure traced to a specific package (below)
Could not verify: runtime/visual behaviour of ~40 untested bumps (see last section)
```

Do not merge as it stands. Two independent blockers, both fixable, neither a reason to abandon the bump.

## Archetype

Grouped batch, 61 production packages. Green CI would have proven typecheck + lint + unit tests. It is not green: three of four gates fail. The batch spans a runtime lib with a **behaviour** change that types happen to catch, a patched package, and ~40 packages nothing tests at all.

## Baseline (this is what makes the attribution real)

I ran the repo's own gate on `upstream/main` before touching the PR:

```
nix build .#checks.x86_64-linux.types   # on c496b854 -> exit 0, 0 errors
nix build .#checks.x86_64-linux.types   # on 63310d38 -> 77 errors in 4 files
```

`main` is clean, so all 77 errors belong to this PR. My local run reproduces CI's count exactly (77, same 4 files), so this verdict is not reading a stale CI log.

## Blocker 1 — the `@auth/prisma-adapter` patch no longer applies

`patches/@auth+prisma-adapter+2.7.4.patch` was made for 2.7.4; the PR installs 2.11.3.

```
**ERROR** Failed to apply patch for package @auth/prisma-adapter
    Patch was made for version: 2.7.4
    Installed version: 2.11.3
patch-package finished with 1 error(s).
```

This kills `npm ci` (`postinstall` is `patch-package`), which is why **Integration (testcontainers)** and **Notis** both fail during install, before running a single test. `package.json:26` also runs `production:build: patch-package && next build`, so the production build fails the same way.

**This is not cosmetic.** The patch changes `useVerificationToken` from `p.verificationToken.delete(...)` to `p.verificationToken.findUnique(...)` — it makes magic-link tokens **reusable instead of single-use**. Dropping it silently would re-break whatever motivated it (the usual cause is email security scanners pre-fetching the link and burning the token before the human clicks).

Required work, in order:
1. Read `@auth/prisma-adapter` 2.11.3's `useVerificationToken` and decide whether upstream now does this itself. If yes, **delete the patch** and say so in the PR.
2. If not, regenerate: `npx patch-package @auth/prisma-adapter` against 2.11.3, and delete the stale `+2.7.4` file.
3. Confirm a magic-link login still works twice on a preview.

### Side finding: the Nix gate does not fail on this

In the Nix check, `preBuild` runs `npm run postinstall`, patch-package printed `finished with 1 error(s)` — and **the build carried on** to `npm rebuild`, `prisma generate`, and the typecheck. So `flake.nix` `checks.{lint,types,tests}` all run against an *unpatched* adapter and would never notice the patch had stopped applying. Only the npm-based jobs catch it. Worth a follow-up issue independent of this PR: the Nix `preBuild` should fail on a non-zero `postinstall`.

## Blocker 2 — 77 type errors, three distinct causes

### a) `src/lib/webgl.ts:13` — mapbox-gl `^3.8.0` → `^3.29.0` — **behaviour inversion, not just a type error**

```
src/lib/webgl.ts:13:43 - error TS2345: Argument of type '{ failIfMajorPerformanceCaveat: boolean; }'
is not assignable to parameter of type 'boolean | undefined'.
```

The signature changed from an options object to a positional boolean:

| | signature | what our call resolves to |
|---|---|---|
| 3.8.0 | `isSupported(options)` → `isWebGLSupportedCached(options && options.failIfMajorPerformanceCaveat)` | `false` — intended |
| 3.29.0 | `isSupported(failIfMajorPerformanceCaveat)` → `isWebGL2Supported(failIfMajorPerformanceCaveat)` | the **object**, which is truthy → `true` — inverted |

I verified this in both `dist/mapbox-gl-dev.js` bundles, not just the `.d.ts`.

So `mapboxgl.supported({ failIfMajorPerformanceCaveat: false })` now means `failIfMajorPerformanceCaveat: true`. `isWebGLSupported()` would start returning `false` for every user whose browser reports a major performance caveat — software renderers, blocklisted GPUs, older integrated graphics. Those users get the map today and would lose it, via `src/components/map/map.tsx:1054` → `setWebglSupported(...)`.

**Fix:** `mapboxgl.supported(false)`. Do not silence this with a cast or a `@ts-expect-error` — the type error is the only thing standing between this bump and a silent regression for low-end devices.

### b) `src/lib/ai.ts:318` — `@anthropic-ai/sdk` `^0.56.0` → `^0.120.0`

```
error TS2739: Type '{ input_tokens: number; ... }' is missing the following properties
from type 'Usage': cache_creation, inference_geo, output_tokens_details
```

`Usage` gained three required fields between 0.56 and 0.120 (`cache_creation`, `inference_geo`, `output_tokens_details`). `aiChat`'s continuation path hand-builds a merged usage object and no longer satisfies the type. One site, small fix: carry the three new fields through the merge (`response2`'s values, or `null`).

Note this is a **64-minor-version jump** on the root package while `services/notis` was already on `^0.116.0`. The bump actually *converges* the monorepo onto one SDK version, which is a point in its favour.

### c) `scripts/search-eval.ts` (23) + `src/lib/search/__tests__/query.test.ts` (52) — `@elastic/elasticsearch` `^9.0.1` → `^9.5.0`

75 of the 77 errors, all `TS18048 'x' is possibly undefined` / `TS2532`. The cause is a genuine breaking type change shipped in a **minor** release:

```ts
// 9.0.1
export interface QueryDslQueryContainer { bool?: ...; terms?: ...; nested?: ...; /* all optional */ }

// 9.5.0
export type QueryDslQueryContainer = ExactlyOne<QueryDslQueryContainerExclusiveProps>;
```

`QueryDslQueryContainer` went from a flat all-optional interface to an `ExactlyOne<>` discriminated union. Constructing a container with one key still typechecks — which is why `src/lib/search/query.ts` (the production query builder) produces **zero** errors. What breaks is code that *reads* a container back and probes its keys, i.e. the test helpers and the eval script:

```ts
filters.find((f) => f.terms?.['city_id'])   // f now narrows to undefined in most union branches
```

**Blast radius is confined to test/tooling code — no shipped runtime path is affected.** But the volume means real work: 75 sites need either narrowing helpers or a single typed accessor. I would write one small helper (e.g. `clauseOf(container, 'terms')`) rather than sprinkle 75 non-null assertions, since assertions here would hide the next such change.

## Coupling and what to land together

- **No dependency overlap** with any other open PR. I checked #670, #667, #665, #664, #663, #439, #507 at the `package.json`-hunk level for each package in this group, not by filename.
- **Soft coupling with #670**: this PR takes `next` to `^16.3.2`; #670 takes `eslint-config-next` to `16.3.2`. They should land together so the lint config tracks the framework.
- **#664 (typescript 5 → 7)** will interact with the elasticsearch fix above. Land #673 first; a TS 7 bump on top of 75 unfixed narrowing errors will be unreadable.

## Staleness

The head is **45 commits behind `main`** (mergeable, no conflicts). Since it needs a push for the fixes anyway, rebase it at the same time — the current run predates 45 commits of main, including recent Mux playback work that this batch's `@mux/mux-video` `0.20.2 → 0.31.2` jump touches.

## What a green run would still not cover

Even after the fixes, the gates here prove typecheck + lint + unit tests. They prove nothing about:

- **~30 Radix UI bumps** (several with large minor spans, e.g. `react-select` 2.1.1 → 2.3.7, `react-dialog` 1.1.2 → 1.1.23). No test renders them. There is a known open issue in this repo about duplicated Radix `dismissable-layer` copies and modal-menu-to-dialog freezes — this batch shifts those versions and may change the dedupe outcome. Worth a manual click-through of a menu that opens a sheet.
- **`@mux/mux-video` 0.20.2 → 0.31.2 and `mux-video-react` 0.26.1 → 0.31.2** — playback is exercised by no test, and main has recent Mux fallback fixes.
- **`sharp` 0.33.4 → 0.35.3** — OG image generation; a known-sensitive area.
- **`next` 16.2.6 → 16.3.2** and the map UI under the new mapbox.

The **Build and Deploy Preview** job shows `skipping`, so no preview exists for this PR. Given the size of the batch and that the four items above are all visual, I would deploy the preview and click through the map, a meeting video, and one Radix menu-into-sheet flow before merging — that is the cheapest coverage available for the part types cannot see.

## Recommendation

`needs-work`, then re-review. Concretely:

1. Resolve or regenerate the `@auth/prisma-adapter` patch, and verify magic-link login twice.
2. `mapboxgl.supported(false)` in `src/lib/webgl.ts:13` — the important one.
3. Carry the three new `Usage` fields in `src/lib/ai.ts:318`.
4. Add a narrowing helper for the elasticsearch `ExactlyOne` change across `scripts/search-eval.ts` and `src/lib/search/__tests__/query.test.ts`.
5. Rebase onto `main`, deploy the preview, manual pass on map/video/menus.
6. Separately: make the Nix `preBuild` fail when `npm run postinstall` fails.

The bump itself is worth taking — it converges the Anthropic SDK across the monorepo and clears a large backlog. It just needs the four fixes first.
