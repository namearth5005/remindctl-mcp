# apple-reminders-mcp

MCP server for Apple Reminders. Manage reminders with natural language from any MCP client.

## Prerequisites

macOS 14+ · Node.js 18+ · [remindctl](https://github.com/steipete/remindctl)

```bash
brew install steipete/tap/remindctl
remindctl authorize
```

## Setup

**Claude Code** (plugin):
```
/plugin marketplace add namearth5005/namearth5005-plugins
/plugin install apple-reminders-mcp@namearth5005-plugins
```

**Claude Code** (manual):
```bash
claude mcp add --transport stdio apple-reminders -- npx -y apple-reminders-mcp
```

**Codex**:
```bash
codex mcp add apple-reminders -- npx -y apple-reminders-mcp
```

**Cursor / Windsurf / Other**:
```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["-y", "apple-reminders-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `add_reminder` | Add a reminder with optional due date, list, notes, priority |
| `show_reminders` | Show reminders (today/tomorrow/week/overdue/upcoming/all) |
| `list_reminder_lists` | List all reminder lists or show contents of one |
| `edit_reminder` | Edit title, due date, notes, priority, or move to another list |
| `complete_reminders` | Mark reminders as complete |
| `delete_reminders` | Delete reminders |
| `manage_reminder_list` | Create, rename, or delete lists |

## Examples

```
"remind me to deploy on Friday at 3pm"
"what's due today?"
"mark the deploy reminder as done"
"create a list called Sprint 12"
```

## Troubleshooting

**"remindctl is not authorized"** — Run `remindctl authorize`.

**"Could not find remindctl"** — `brew install steipete/tap/remindctl`, or set `REMINDCTL_PATH` env var.

**Using nvm?** Use the full node path: `/opt/homebrew/bin/node` instead of `node`.

## License

MIT
