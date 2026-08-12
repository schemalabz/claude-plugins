# schemalabz claude-plugins

Shared Claude Code plugins for the team. Generic, cross-repo skills live here;
repo-specific skills stay in each project's own `.claude/skills/`.

## Use in a project

Add to the project's `.claude/settings.json`, then `/plugin install workflow@schemalabz`:

```json
{
  "extraKnownMarketplaces": {
    "schemalabz": {
      "source": { "source": "github", "repo": "schemalabz/claude-plugins" },
      "autoUpdate": true
    }
  }
}
```

`autoUpdate` is per-marketplace: it keeps every plugin installed from `schemalabz`
current by refreshing in the background after startup. Without it, pick up changes
manually with `/plugin marketplace update schemalabz`.

## Add a skill

Drop it at `plugins/<plugin>/skills/<name>/SKILL.md`. A new plugin also needs an entry in
`.claude-plugin/marketplace.json`. Plugins omit `version`, so every pushed commit is treated
as a new release — teammates pick it up automatically (with `autoUpdate`) or on the next
`/plugin marketplace update schemalabz`. No manual version bumping.

## Develop a plugin locally

Marketplace installs are frozen copies in `~/.claude/plugins/cache` — edits in your clone don't reach them, and an installed copy silently shadows a same-named skills-dir plugin. For live iteration, uninstall first, then symlink your working tree:

```bash
# enter dev mode (after: /plugin uninstall <plugin>@schemalabz)
ln -s /path/to/claude-plugins/plugins/<plugin> ~/.claude/skills/<plugin>

# exit dev mode (then reinstall from the marketplace)
rm ~/.claude/skills/<plugin>
```

It loads as `<plugin>@skills-dir` on the next session; `SKILL.md` edits apply immediately, other components (hooks, agents) after `/reload-plugins`.

## browser-scripting: one-time setup

The `browser-scripting` skill (in the `workflow` plugin) drives a real browser and reads pages as markdown. It needs Nix, which supplies a matched Playwright and Chromium:

```bash
curl -fsSL https://install.determinate.systems/nix | sh -s -- install
```

That is the whole setup — the skill invokes the tools with `nix run`, so there is nothing to install per-tool. The first run downloads ~240 MB of prebuilt browsers and takes a few minutes; later runs are instant.

To avoid flake resolution on every call, install them into your profile:

```bash
nix profile install github:schemalabz/toolkit#page-read
nix profile install github:schemalabz/toolkit#playwright-run
```
