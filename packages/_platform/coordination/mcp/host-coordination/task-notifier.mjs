/**
 * Host-owned completion delivery.  It deliberately does not use project
 * callbacks: the originating live HEAD pane is the only delivery target.
 */
export function createExactHeadTaskNotifier({ runtime, maxBytes = 8192 } = {}) {
  if (!runtime || typeof runtime.validateCaller !== "function" || typeof runtime.invokeVoid !== "function") throw new TypeError("Exact Herdr caller validation and delivery are required.");
  return async ({ task, wave, aggregate, handoff = "" } = {}) => {
    const source = task || wave;
    if (!source?.caller) return "unavailable";
    const live = runtime.validateCaller(source.caller);
    if (!live || ["socket", "workspaceId", "tabId", "paneId", "terminalId", "cwd"].some((key) => live[key] !== source.caller[key])) return "unavailable";
    const text = task
      ? `agent-task ${task.taskId} completed\n${handoff}`
      : `frozen-wave ${wave.waveId} ${wave.status}\n${aggregate}`;
    const bounded = Buffer.from(text).subarray(0, maxBytes).toString("utf8");
    try {
      runtime.invokeVoid(live.socket, ["pane", "send-text", live.paneId, bounded]);
    } catch {
      return "ambiguous";
    }
    try {
      runtime.invokeVoid(live.socket, ["pane", "send-keys", live.paneId, "Enter"]);
    } catch {
      return "ambiguous";
    }
    return "delivered";
  };
}
