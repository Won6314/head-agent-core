/** Injectable real Herdr boundary. No socket/path fallback is permitted. */
export function createHerdrAdapter({ invoke, invokeVoid, snapshot } = {}) {
  if (typeof invoke !== "function" || typeof invokeVoid !== "function" || typeof snapshot !== "function") throw new TypeError("Herdr invoke, invokeVoid, and snapshot adapters are required.");
  const livePane = (caller) => {
    if (!caller || !["socket", "workspaceId", "tabId", "paneId"].every((key) => typeof caller[key] === "string" && caller[key])) return null;
    const panes = snapshot(caller.socket)?.panes || [];
    const matches = panes.filter((item) => item.workspace_id === caller.workspaceId && item.tab_id === caller.tabId && (item.id || item.pane_id) === caller.paneId);
    if (matches.length !== 1) return null;
    const pane = matches[0]; if (typeof pane.terminal_id !== "string" || !pane.terminal_id || typeof pane.cwd !== "string" || !pane.cwd) return null;
    return Object.freeze({ socket: caller.socket, workspaceId: caller.workspaceId, tabId: caller.tabId, paneId: caller.paneId, terminalId: pane.terminal_id, cwd: pane.cwd });
  };
  return Object.freeze({ invoke, invokeVoid, livePane: (caller) => livePane(caller), validateCaller: (caller) => livePane(caller) });
}
