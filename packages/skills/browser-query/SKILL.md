---
name: browser-query
description: Use the shared Chrome DevTools daemon for isolated page navigation, DOM inspection, screenshots, and browser interaction without taking over user tabs.
---

# Browser Query

Use the g2 reverse-tunnel endpoint for the Mac-hosted Chrome DevTools MCP daemon at `http://127.0.0.1:19400/mcp` through the project's MCP caller. The standard caller path is `$PROJECT_ROOT/scripts/query/mcp_call.py`.

## Connection

```bash
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --list
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool list_pages --args '{}'
```

For the NoahChat g2 runtime, if Chrome itself is down, run this exact established launcher. Do not substitute another profile:

```bash
ssh remote-mac "/usr/bin/osascript -e 'tell application \"Google Chrome\" to quit'; for i in {1..40}; do if ! /usr/bin/pgrep -x 'Google Chrome' >/dev/null; then break; fi; /bin/sleep 0.25; done; /usr/bin/open -na 'Google Chrome' --args --remote-debugging-port=9222 --user-data-dir=/Users/jongyoonwon/.chrome-debug-gaonprime '--profile-directory=Profile 5' --no-first-run --no-default-browser-check"
```

Then rerun `list_pages`. The approved persistent identity is `/Users/jongyoonwon/.chrome-debug-gaonprime` + `Profile 5` on port `9222`; `~/.chrome-debug-profile` and the ordinary `~/Library/Application Support/Google/Chrome` profiles are not substitutes. Outside NoahChat, follow that project's approved browser launch guidance. Never create an arbitrary profile, browser process, or debug port.

## Owned Tab Lifecycle

1. A worker that needs Chrome creates exactly one task-owned tab with `new_page` and `background: true`.
2. Record the numeric `pageId` from the new page response and reuse it for the entire task.
3. Pass that `pageId` to every subsequent page-scoped tool whose schema accepts it, including navigation, snapshots, screenshots, scripts, clicks, fills, and key presses. Never rely on the daemon's selected-page fallback.
4. Do not navigate, select, reuse, or close a user tab or another worker's tab. Do not create another tab or window for the same task.
5. Keep the tab in the background and do not call `select_page`. If an operation is technically impossible without a foreground tab, stop and ask HEAD to serialize and approve that exceptional step.
6. In a `finally`-equivalent cleanup step, call `close_page` with the owned `pageId` before the worker exits. Close only that tab.

`new_page` may mark the new page as selected in the MCP response while `background: true` keeps it from being brought to the front in Chrome. Subsequent isolated calls still require the explicit `pageId`.

```bash
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool new_page --args '{"url":"https://example.com","background":true}'
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool navigate_page --args '{"pageId":17,"type":"url","url":"https://example.com"}'
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool take_snapshot --args '{"pageId":17}' --out /tmp/browser-page.md
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool take_screenshot --args '{"pageId":17}' --out /tmp/browser-page.png
python3 "$PROJECT_ROOT/scripts/query/mcp_call.py" --url http://127.0.0.1:19400/mcp --tool close_page --args '{"pageId":17}'
```

## Isolation Limits

- Navigation, script, snapshot, screenshot, click, coordinate click, hover, fill, form fill, and key tools support explicit `pageId` isolation. Always supply the owned `pageId`.
- `list_pages` and `new_page` are daemon-wide lifecycle operations. Use `new_page` only with `background: true`, and never treat another page returned by `list_pages` as task-owned.
- A tool that does not expose `pageId` remains global browser state. Do not use it while another browser worker may run concurrently; ask HEAD to serialize the step or use an approved target-specific adapter.
- Snapshot UIDs belong only to the latest snapshot of that same page. Never reuse a UID across tabs or after navigation without a fresh snapshot.
- If the owned tab closes unexpectedly, discard its `pageId` and create one replacement tab only when the task still requires it.

## Evidence And Context

- Save large DOM snapshots, script results, and screenshots to task-specific files. Use `/tmp/agent-tasks/$AGENT_TASK_QUICK_ID/` when that ID is available.
- Read or return only the relevant excerpts instead of placing full DOM or JSON payloads in model context.
- Use stepwise calls for exploratory work. Batch only a predetermined sequence whose later actions do not depend on inspecting earlier results.
- Verify the resulting URL, DOM state, or screenshot after browser actions.

## Safety

- Browser observation does not authorize submission, publication, purchase, deletion, authentication changes, or other external mutation.
- Follow the active project and task approval boundary before any state-changing action.
- Never expose credentials or copy authentication material out of the approved browser profile.
