const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function executable(file) {
  try {
    const stat = fs.statSync(file);
    fs.accessSync(file, fs.constants.X_OK);
    return stat.isFile() ? file : "";
  } catch { return ""; }
}

function herdrBinary(env = process.env) {
  const explicit = String(env.HERDR_BIN || "").trim();
  if (explicit) return path.isAbsolute(explicit) ? executable(explicit) : explicit;
  const candidates = [
    env.XDG_BIN_HOME && path.join(env.XDG_BIN_HOME, "herdr"),
    env.HOME && path.join(env.HOME, ".local", "bin", "herdr"),
  ].filter(Boolean);
  return candidates.map(executable).find(Boolean) || "herdr";
}

function snapshot(env = process.env) {
  const result = childProcess.spawnSync(herdrBinary(env), ["api", "snapshot"], { encoding: "utf8", env });
  if (result.error || result.status !== 0) return null;
  try {
    const value = JSON.parse(result.stdout);
    return value?.result?.snapshot || value?.snapshot || value;
  } catch { return null; }
}

function canonical(directory) {
  try { return fs.realpathSync(directory); } catch { return ""; }
}

/**
 * Resolve a caller only when every supplied Herdr identity still names the
 * same live pane.  This is intentionally product-neutral: the live snapshot
 * is the authority, not a product-local coordination runtime.
 */
function validateCaller(caller, { headCwd, env = process.env, readSnapshot = snapshot } = {}) {
  if (!caller || !["socket", "paneId"].every((key) => String(caller[key] || "").trim())) return null;
  const state = readSnapshot(env);
  if (!state || !Array.isArray(state.panes) || !Array.isArray(state.tabs)) return null;
  const panes = state.panes.filter((item) => item.pane_id === caller.paneId
    && (!caller.workspaceId || item.workspace_id === caller.workspaceId)
    && (!caller.tabId || item.tab_id === caller.tabId));
  if (panes.length !== 1) return null;
  const pane = panes[0];
  const tabs = state.tabs.filter((item) => item.workspace_id === pane.workspace_id && item.tab_id === pane.tab_id);
  if (tabs.length !== 1) return null;
  const tab = tabs[0];
  if (!pane || !tab || !pane.terminal_id || !pane.cwd) return null;
  const cwd = canonical(pane.cwd);
  const expected = headCwd ? canonical(headCwd) : cwd;
  if (!cwd || !expected || cwd !== expected) return null;
  return Object.freeze({
    socket: String(caller.socket), workspaceId: pane.workspace_id, tabId: pane.tab_id,
    paneId: pane.pane_id, terminalId: pane.terminal_id, cwd, tabLabel: String(tab.label || tab.tab_label || ""),
  });
}

module.exports = { herdrBinary, snapshot, validateCaller };
