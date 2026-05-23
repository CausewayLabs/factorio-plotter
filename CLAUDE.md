# CLAUDE.md — Factorio Plotter

This file is the agent operating manual for this project. Read it at the start of every session.

---

## Prime Directive

**Read `.context.md` first.** It is the root router for this project — it indexes memory files, architecture docs, feature logs, and lenses. Do not navigate the project blind; `.context.md` tells you where everything lives.

---

## Planning: `/next-plan`

When you need to decide what to work on next, invoke `/next-plan`. It reads the architecture spine, subdocs, feature logs, and `memory/current-plan.md`, then selects and writes the next reasonably-scoped plan.

**Selection rubric (in priority order):**
1. Hard blockers first
2. Foundation before surface (infra/data/contracts before dependent features; logic before polish)
3. Convergence bias — prefer plans that close the most open threads
4. Explicit user signal overrides

Plans target single-session completion. `/next-plan` overwrites `current-plan.md` each time it runs.

During execution: check off completed steps in `current-plan.md` as you go. No running journal. Create a handoff doc in `memory/handoffs/` only if work genuinely gets stuck mid-plan.

---

## Organic Capture Heuristic

You are always listening for future work that surfaces during normal conversation and development. Capture is a side effect of working — there is no standalone "create a task" ceremony.

### Rule 1 — Log when:
- The user says "we need to / should / TODO / later / eventually" about a **concrete deliverable**
- A bug surfaces in passing that **will not be fixed this turn**
- A decision is **explicitly deferred**
- A gap is **named** ("we don't have a way to X yet")
- You discover an issue that **a future agent would want to know** — meets the bar of actionable, not hypothetical

### Rule 2 — Do not log:
- Hypothetical musings ("we could do X someday")
- Items being addressed **in the current reply or active plan**
- Generic best-practice noise with no project-specific action
- Anything the user **dismissed in the same turn**

### Rule 3 — Threshold:
- Log when **confident** the item is real future work
- Silently skip when **low confidence**
- Briefly ask when **borderline**: "noticed Z — worth logging?"

### Rule 4 — Hard rule:
**Never log items that duplicate active `current-plan.md` steps.**

### Rule 5 — Feedback loop:
When the user corrects a logged item (wrong scope, wrong log, shouldn't have been captured), **update or remove the entry AND append a note to `memory/task-feedback.md`** so the heuristic improves over time. Format:

```
- (2026-05-23) Removed/updated: [original item] — reason: [user's correction in brief]
```

### Auto-logging behavior:
Log at the **end of your reply**, not inline. After logging, notify the user — **one line per item**, 5–20 words identifying what was logged. Example:

> Logged: auth token refresh not handled on 401 responses.

User silence = good log. No acknowledgment needed. User pushback triggers Rule 5.

---

## Feature Log Format

Entries go into `memory/architecture/<subsystem>-log.md` under the appropriate category. If no category fits, create one. If a category grows bloated, split or rebalance it — use judgment, no count threshold.

**Planned entry:**
```
- [ ] (planned: YYYY-MM-DD) Description of the work item.
```

**Completed entry:**
```
- [x] (planned: YYYY-MM-DD, completed: YYYY-MM-DD) Description. — decision: chose X over Y because Z.
```

Cross-cutting features go to the highest common ancestor subdoc. Load-bearing decisions promote directly to `memory/Codebase Guide.md` as invariants — don't wait for a prune cycle.

---

## Charter Doctrine

`memory/architecture/architecture.md` and the per-subsystem subdocs are this project's charter. They define what the system is, the shape it takes, and why. **Every decision you make — what to build, how to scope it, which trade-off to take — must be congruent with the charter.** If a request, plan, or instinct conflicts with the charter, stop and surface the tension before proceeding. Do not treat the charter as background reading; treat it as the constitution against which all work is measured.

The charter is **load-bearing context.** An agent reading only the spine, the relevant subsystem subdoc, and `memory/Codebase Guide.md` — with no feature log — should be able to:

1. **Make informed design decisions** that fit the existing grain.
2. **Push back on drift** when a request or instinct conflicts with a deliberate decision, citing the decision and its rationale.
3. **Operate without history.** Feature logs are for "what's queued" and "what just changed" — not "how the system works." Completed entries are receipts, not documentation.

**The promotion test.** When a completed task contains a finding or decision, ask: *if this sentence were deleted from the arch doc and Codebase Guide, would an agent making a good-faith decision risk steering the system wrong?* If yes, promote it into the arch doc (rationale, contracts) or Codebase Guide (invariants, system-wide patterns). If no, leave the log entry as a receipt.

Use `/memory-log-review <subsystem>` to walk completed entries and apply this test in batch.

Subsystem subdocs (`memory/architecture/<subsystem>.md`) and their paired feature logs (`memory/architecture/<subsystem>-log.md`) extend the charter into specific areas. When working in a subsystem, read both before touching code there.

---

## Session Start Checklist

1. Read `.context.md` (router)
2. Read `memory/architecture/architecture.md` (charter — non-negotiable)
3. Read `memory/current-plan.md` (resume if a plan is in flight)
4. Read the subsystem subdoc + log for the area the current plan touches
5. If no active plan or the current one is complete, ask the user whether to run `/next-plan` — do not run it automatically

---

## What This File Is Not

This file is not a changelog, a roadmap, or a feature log. Those live in `memory/architecture/<subsystem>-log.md`. This file is the operating manual — stable conventions, not project state.

---

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |
