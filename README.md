# apple-reminders-mcp

MCP server for Apple Reminders via [`remindctl`](https://github.com/steipete/remindctl) CLI. Say "remind me to deploy on Friday" in Claude Code and your iPhone buzzes.

## Install (Recommended: Plugin)

```
/plugin marketplace add namearth5005/namearth5005-plugins
/plugin install apple-reminders-mcp@namearth5005-plugins
```

This gives you the MCP tools + the interactive `/reminders` browser. Restart Claude Code after installing.

## Install (Manual: npx)

If you prefer not to use the plugin:

```bash
claude mcp add --transport stdio apple-reminders-mcp -- npx -y apple-reminders-mcp
```

## Prerequisites

- **macOS 14+**
- **Node.js 18+**
- **remindctl** installed and authorized:

```bash
brew install steipete/tap/remindctl
remindctl authorize
```

## Tools

| Tool | Description |
|------|-------------|
| `add_reminder` | Add a reminder with optional due date, list, notes, priority |
| `show_reminders` | Show reminders (today, tomorrow, week, overdue, upcoming, all) |
| `list_reminder_lists` | List all reminder lists or show contents of a specific list |
| `edit_reminder` | Edit title, due date, notes, priority, or move to another list |
| `complete_reminders` | Mark one or more reminders as complete |
| `delete_reminders` | Permanently delete reminders |
| `manage_reminder_list` | Create, rename, or delete reminder lists |

## Usage Examples

```
"remind me to deploy the API on Friday at 3pm"
"what's on my list for today?"
"mark the deploy reminder as done"
"show me all overdue tasks"
"create a new list called Sprint 12"
"delete the test reminder"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REMINDCTL_PATH` | Custom path to remindctl binary (defaults to PATH lookup) |

## Troubleshooting

**"remindctl is not authorized"** — Run `remindctl authorize` and grant Reminders access in System Settings.

**"Could not find remindctl"** — Install via Homebrew: `brew install steipete/tap/remindctl`, or set `REMINDCTL_PATH`.

**Tools not showing in Claude Code** — Restart Claude Code after adding the MCP server config. Check `~/.claude/settings.local.json` for correct absolute path.

**Using nvm?** MCP stdio servers don't load nvm. Use the full node path in your config:

```json
"command": "/opt/homebrew/bin/node"
```

Find yours with: `readlink -f $(which node)` or `ls /opt/homebrew/bin/node`.

## License

MIT
