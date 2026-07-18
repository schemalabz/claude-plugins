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
