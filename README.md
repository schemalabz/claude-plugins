# schemalabz claude-plugins

Shared Claude Code plugins for the team. Generic, cross-repo skills live here;
repo-specific skills stay in each project's own `.claude/skills/`.

## Use in a project

Add to the project's `.claude/settings.json`, then `/plugin install workflow@schemalabz`:

```json
{
  "extraKnownMarketplaces": {
    "schemalabz": {
      "source": { "source": "github", "repo": "schemalabz/claude-plugins" }
    }
  }
}
```

## Add a skill

Drop it at `plugins/<plugin>/skills/<name>/SKILL.md`. A new plugin also needs an entry in
`.claude-plugin/marketplace.json`. Bump the plugin's `version` on a breaking change.
