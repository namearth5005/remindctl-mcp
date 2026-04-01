import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Resolve remindctl binary
// ---------------------------------------------------------------------------

function resolveRemindctl(): string {
  if (process.env.REMINDCTL_PATH) return process.env.REMINDCTL_PATH;

  // MCP stdio servers often inherit a minimal PATH that excludes Homebrew.
  // Check common install locations explicitly.
  const candidates = [
    "/opt/homebrew/bin/remindctl", // Apple Silicon
    "/usr/local/bin/remindctl",   // Intel Mac
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }

  // Fall back to PATH lookup
  return "remindctl";
}

const REMINDCTL = resolveRemindctl();

// ---------------------------------------------------------------------------
// Core helper: run remindctl with args, always JSON + no-input
// ---------------------------------------------------------------------------

interface ExecError {
  stderr?: string;
  stdout?: string;
  message?: string;
  code?: string;
  killed?: boolean;
  signal?: string;
  exitCode?: number;
}

async function runRemindctl(args: string[]): Promise<string> {
  const fullArgs = [...args, "--json", "--no-input"];
  try {
    const { stdout } = await execFileAsync(REMINDCTL, fullArgs, {
      timeout: 10_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return stdout;
  } catch (err: unknown) {
    const e = err as ExecError;
    const parts: string[] = [];

    if (e.killed) parts.push("process timed out (10s limit)");
    else if (e.code === "ENOENT") parts.push(`binary not found: ${REMINDCTL}`);
    else if (e.code === "EACCES") parts.push(`permission denied: ${REMINDCTL}`);
    else if (e.stderr?.trim()) parts.push(e.stderr.trim());
    else if (e.message) parts.push(e.message);
    else parts.push("unknown error");

    if (e.signal) parts.push(`signal: ${e.signal}`);
    if (e.exitCode !== undefined && e.exitCode !== null) parts.push(`exit code: ${e.exitCode}`);

    const error = new Error(`remindctl failed: ${parts.join("; ")}`) as Error & { code?: string };
    error.code = e.code;
    throw error;
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    console.error(
      `[remindctl-mcp] Warning: failed to parse JSON output. ` +
      `Raw (first 200 chars): ${raw.slice(0, 200)}`
    );
    return raw.trim();
  }
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

function ok(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function fail(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "remindctl-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: add_reminder
// ---------------------------------------------------------------------------

server.registerTool(
  "add_reminder",
  {
    title: "Add Reminder",
    description: `Add a new reminder to Apple Reminders. Use when the user wants to remember something, create a task, set a to-do, schedule a deadline, or needs to be reminded about anything.

Args:
  - title (string, required): The reminder text
  - list (string, optional): Target reminder list (e.g. "Work", "Personal"). Uses default list if omitted.
  - due (string, optional): Due date in natural language ("tomorrow", "Friday 3pm", "2026-04-05")
  - notes (string, optional): Additional notes or context
  - priority (string, optional): none, low, medium, or high`,
    inputSchema: {
      title: z.string().min(1).describe("Reminder title/text"),
      list: z.string().optional().describe("Target reminder list name"),
      due: z.string().optional().describe("Due date — natural language or ISO date"),
      notes: z.string().optional().describe("Additional notes"),
      priority: z.enum(["none", "low", "medium", "high"]).optional().describe("Priority level"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  },
  async ({ title, list, due, notes, priority }) => {
    try {
      const args = ["add", title];
      if (list !== undefined) args.push("--list", list);
      if (due !== undefined) args.push("--due", due);
      if (notes !== undefined) args.push("--notes", notes);
      if (priority !== undefined) args.push("--priority", priority);
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 2: show_reminders
// ---------------------------------------------------------------------------

server.registerTool(
  "show_reminders",
  {
    title: "Show Reminders",
    description: `Show reminders from Apple Reminders. Use when the user asks what they need to do, what's on their list, what's due, overdue, or wants to see their agenda/tasks.

Args:
  - filter (string, optional): today, tomorrow, week, overdue, upcoming, completed, all, or a date string. Defaults to "upcoming".
  - list (string, optional): Limit to a specific reminder list`,
    inputSchema: {
      filter: z
        .enum(["today", "tomorrow", "week", "overdue", "upcoming", "completed", "all"])
        .or(z.string())
        .optional()
        .default("upcoming")
        .describe("Filter: today, tomorrow, week, overdue, upcoming, completed, all, or a date"),
      list: z.string().optional().describe("Limit to a specific reminder list"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ filter, list }) => {
    try {
      const args = ["show"];
      if (filter !== undefined) args.push(filter);
      if (list !== undefined) args.push("--list", list);
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 3: list_reminder_lists
// ---------------------------------------------------------------------------

server.registerTool(
  "list_reminder_lists",
  {
    title: "List Reminder Lists",
    description: `List all Apple Reminder lists, or show the contents of a specific list. Use when the user wants to know what lists they have or browse a specific list.

Args:
  - name (string, optional): If provided, shows reminders in that list. If omitted, lists all available lists.`,
    inputSchema: {
      name: z.string().optional().describe("List name — omit to list all lists, provide to show contents"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ name }) => {
    try {
      const args = ["list"];
      if (name !== undefined) args.push(name);
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 4: edit_reminder
// ---------------------------------------------------------------------------

server.registerTool(
  "edit_reminder",
  {
    title: "Edit Reminder",
    description: `Edit an existing Apple Reminder. Use when the user wants to change a reminder's title, due date, notes, priority, move it to another list, or mark it complete/incomplete.

Args:
  - id (string, required): Index number or ID prefix from show_reminders output
  - title (string, optional): New title
  - list (string, optional): Move to a different list
  - due (string, optional): New due date
  - notes (string, optional): New notes
  - priority (string, optional): none, low, medium, high
  - clear_due (boolean, optional): Clear the due date
  - complete (boolean, optional): Mark as completed
  - incomplete (boolean, optional): Mark as incomplete`,
    inputSchema: {
      id: z.string().min(1).describe("Index or ID prefix from show output"),
      title: z.string().optional().describe("New title"),
      list: z.string().optional().describe("Move to list"),
      due: z.string().optional().describe("New due date"),
      notes: z.string().optional().describe("New notes"),
      priority: z.enum(["none", "low", "medium", "high"]).optional().describe("Priority level"),
      clear_due: z.boolean().optional().describe("Clear the due date"),
      complete: z.boolean().optional().describe("Mark completed"),
      incomplete: z.boolean().optional().describe("Mark incomplete"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ id, title, list, due, notes, priority, clear_due, complete, incomplete }) => {
    try {
      const hasEdits = title !== undefined || list !== undefined || due !== undefined ||
        notes !== undefined || priority !== undefined || clear_due || complete || incomplete;
      if (!hasEdits) {
        return fail("No edit fields provided. Specify at least one of: title, list, due, notes, priority, clear_due, complete, incomplete.");
      }
      const args = ["edit", id];
      if (title !== undefined) args.push("--title", title);
      if (list !== undefined) args.push("--list", list);
      if (due !== undefined) args.push("--due", due);
      if (notes !== undefined) args.push("--notes", notes);
      if (priority !== undefined) args.push("--priority", priority);
      if (clear_due) args.push("--clear-due");
      if (complete) args.push("--complete");
      if (incomplete) args.push("--incomplete");
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 5: complete_reminders
// ---------------------------------------------------------------------------

server.registerTool(
  "complete_reminders",
  {
    title: "Complete Reminders",
    description: `Mark one or more Apple Reminders as complete. Use when the user says they finished a task, did something, or wants to check off a reminder.

Args:
  - ids (string[], required): Array of index numbers or ID prefixes from show_reminders output`,
    inputSchema: {
      ids: z.array(z.string()).min(1).describe("Indexes or ID prefixes to mark complete"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async ({ ids }) => {
    try {
      const args = ["complete", ...ids];
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 6: delete_reminders
// ---------------------------------------------------------------------------

server.registerTool(
  "delete_reminders",
  {
    title: "Delete Reminders",
    description: `Delete one or more Apple Reminders permanently. Use when the user wants to remove a reminder entirely (not just complete it).

Args:
  - ids (string[], required): Array of index numbers or ID prefixes from show_reminders output`,
    inputSchema: {
      ids: z.array(z.string()).min(1).describe("Indexes or ID prefixes to delete"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  async ({ ids }) => {
    try {
      const args = ["delete", ...ids, "--force"];
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Tool 7: manage_reminder_list
// ---------------------------------------------------------------------------

server.registerTool(
  "manage_reminder_list",
  {
    title: "Manage Reminder List",
    description: `Create, rename, or delete an Apple Reminder list. Use when the user wants to organize their reminders by creating new lists, renaming existing ones, or removing lists.

Args:
  - name (string, required): The list name to act on
  - action (string, required): "create", "rename", or "delete"
  - new_name (string, optional): Required when action is "rename" — the new name for the list`,
    inputSchema: {
      name: z.string().min(1).describe("List name"),
      action: z.enum(["create", "rename", "delete"]).describe("Action to perform"),
      new_name: z.string().optional().describe("New name (required for rename)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  async ({ name, action, new_name }) => {
    try {
      const args = ["list", name];
      switch (action) {
        case "create":
          args.push("--create");
          break;
        case "rename":
          if (!new_name) return fail("new_name is required when action is 'rename'");
          args.push("--rename", new_name);
          break;
        case "delete":
          args.push("--delete", "--force");
          break;
      }
      const raw = await runRemindctl(args);
      return ok(parseJson(raw));
    } catch (e: unknown) {
      return fail(errorMessage(e));
    }
  }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function main() {
  // Check remindctl is available and authorized
  try {
    const raw = await runRemindctl(["status"]);
    const status = parseJson(raw) as { authorized?: boolean };
    if (!status.authorized) {
      console.error(
        "[remindctl-mcp] remindctl is not authorized to access Reminders. Run: remindctl authorize"
      );
    }
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    if (e.code === "ENOENT" || e.message?.includes("binary not found")) {
      console.error(
        "[remindctl-mcp] Could not find remindctl binary. Install: brew install steipete/tap/remindctl"
      );
      console.error(
        "[remindctl-mcp] Or set REMINDCTL_PATH env var to the binary location."
      );
    } else {
      console.error(`[remindctl-mcp] Health check failed: ${errorMessage(err)}`);
    }
    console.error("[remindctl-mcp] Server starting in degraded mode. Tool calls may fail.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[remindctl-mcp] Server started (stdio)");
}

main().catch((err) => {
  console.error("[remindctl-mcp] Fatal:", err);
  process.exit(1);
});
