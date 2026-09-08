import fs from "node:fs";
import path from "node:path";
import { createHostAdmin } from "../coordination/mcp/host-coordination/admin.mjs";
import { createRealHerdrCliAdapter } from "../coordination/mcp/host-coordination/real-herdr-cli-adapter.mjs";
import { bootstrapOnboardingSession } from "./bootstrap-onboarding-session.mjs";
import { readInstalledHost } from "./project-initializer.mjs";

const SESSION_NAME = "onboarding";
const SESSION_STATE = `${JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }, null, 2)}\n`;
const ONBOARDING_CONTEXT = `# New project onboarding\n\nOutcome: configure this new project through a conversation.\n\nEditable authorities, only after the user confirms the proposed writes: root \`CLAUDE.md\`, HEAD \`CLAUDE.md\`, \`HEAD_CONTEXT.md\`, role overlays and local expertise, and user-approved project Skills or extension references.\n\nProtected authorities: managed manifests and generated configuration, installed Core, host configuration/service/state, credentials, provider and model selection, and unrelated existing files.\n\nCover project identity and purpose, repository boundaries, canonical sources, operating constraints, and desired optional extensions. Ask concise questions, distinguish required from optional information, summarize proposed writes, obtain confirmation, then edit only approved project-owned files.\n`;
const ONBOARDING_PROMPT = "Begin the new-project onboarding now. Present the first coherent concise questions; do not assume project answers or make changes before the user confirms proposed project-owned writes.";
const directFile = (file) => { const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Expected direct regular file: ${file}`); };
const directDirectory = (directory) => { const stat = fs.lstatSync(directory); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected direct directory: ${directory}`); return fs.realpathSync(directory); };
const canonical = (file) => fs.realpathSync(file);
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const openCodeSession = /^ses_[A-Za-z0-9_-]+$/;
const managedRestoreHistory = /^<!-- restore-ids\nclaude: \nopencode: ses_[A-Za-z0-9]+\nlast_runtime: opencode\nupdated_at: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\n-->\n$/;

function isManagedRestoreHistory(body) {
  const match = managedRestoreHistory.exec(body);
  if (!match) return false;
  const parsed = new Date(match[1]);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().replace(".000Z", "Z") === match[1];
}

function projectAuthority(target, env) {
  const root = canonical(target);
  const runtimeFile = path.join(root, ".claude", "head-runtime.json");
  const projectFile = path.join(root, ".claude", "head-project.json");
  directFile(runtimeFile); directFile(projectFile);
  const runtime = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
  const project = JSON.parse(fs.readFileSync(projectFile, "utf8"));
  if (!runtime || runtime.version !== 1 || typeof runtime.projectId !== "string" || Object.keys(runtime).length !== 2) throw new Error("Target runtime manifest is incompatible.");
  if (!project || project.version !== 1 || project.projectId !== runtime.projectId || typeof project.coreRoot !== "string") throw new Error("Target project manifest is incompatible.");
  const { host, current } = readInstalledHost(env);
  if (canonical(project.coreRoot) !== canonical(current)) throw new Error("Target does not reference the stable installed Core.");
  for (const key of ["herdrPath", "opencodePath", "socketPath"]) if (typeof host[key] !== "string" || !host[key]) throw new Error("Installed host runtime authority is incomplete.");
  const admin = createHostAdmin({ hostStateRoot: host.stateRoot });
  const registrations = admin.inspect().filter((item) => item.projectId === runtime.projectId && item.projectRoot === root);
  if (registrations.length !== 1) throw new Error("Target has no exact host registration.");
  const head = path.join(root, ".claude", "agents", "head");
  directDirectory(head); directDirectory(path.join(head, "sessions"));
  return { root, projectId: runtime.projectId, head, host };
}

function ensurePristineSession(head) {
  const session = path.join(head, "sessions", SESSION_NAME);
  if (!fs.existsSync(session)) return bootstrapOnboardingSession({ headDirectory: head, name: SESSION_NAME, context: ONBOARDING_CONTEXT });
  directDirectory(session);
  const entries = fs.readdirSync(session).sort();
  const expected = ["context.md", "session-state.json"];
  const hasManagedRestoreHistory = JSON.stringify(entries) === JSON.stringify(["context.md", "history.md", "session-state.json"]);
  if (JSON.stringify(entries) !== JSON.stringify(expected) && !hasManagedRestoreHistory) throw new Error("Existing onboarding Session is not pristine.");
  for (const file of entries) directFile(path.join(session, file));
  if (fs.readFileSync(path.join(session, "context.md"), "utf8") !== ONBOARDING_CONTEXT || fs.readFileSync(path.join(session, "session-state.json"), "utf8") !== SESSION_STATE) throw new Error("Existing onboarding Session has incompatible payload.");
  if (hasManagedRestoreHistory && !isManagedRestoreHistory(fs.readFileSync(path.join(session, "history.md"), "utf8"))) throw new Error("Existing onboarding Session has incompatible restore history.");
  return session;
}

function snapshot(runtime) { const value = runtime.snapshot(); if (!value || !Array.isArray(value.workspaces) || !Array.isArray(value.tabs) || !Array.isArray(value.panes)) throw new Error("Herdr snapshot is incompatible."); return value; }
function sameRoot(candidate, root) { try { return typeof candidate === "string" && canonical(candidate) === root; } catch { return false; } }
function workspaceFor(state, root) { return state.workspaces.filter((item) => item && (sameRoot(item.cwd, root) || state.panes.some((pane) => pane.workspace_id === item.workspace_id && sameRoot(pane.cwd, root)))); }
function onboardingTabs(state, workspaceId) { return state.tabs.filter((item) => item.workspace_id === workspaceId && (item.label ?? item.tab_label) === SESSION_NAME); }
function paneFor(state, tab, head) {
  const panes = state.panes.filter((item) => item.workspace_id === tab.workspace_id && item.tab_id === tab.tab_id);
  if (panes.length !== 1 || canonical(panes[0].cwd) !== head || !identifier.test(String(panes[0].pane_id || "")) || !identifier.test(String(panes[0].terminal_id || ""))) throw new Error("Onboarding tab topology is ambiguous or foreign.");
  return panes[0];
}
function agentName(projectId) { return `${projectId}-onboarding`; }
function liveAgent(pane) { return pane.agent === "opencode" && pane.agent_session?.source === "herdr:opencode" && openCodeSession.test(String(pane.agent_session?.value || "")); }
function pause(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function waitPane(herdr, tab, head, predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const pane = paneFor(snapshot(herdr), tab, head);
    if (predicate(pane)) return pane;
    pause(100);
  } while (Date.now() <= deadline);
  throw new Error("Exact onboarding OpenCode agent was not observed.");
}

/** Start exactly one protected onboarding conversation from a launch-ready project. */
export function startOnboarding({ target, env = process.env, runtime } = {}) {
  if (typeof target !== "string" || !target) throw new Error("An onboarding target is required.");
  const authority = projectAuthority(path.resolve(target), env);
  const session = ensurePristineSession(authority.head);
  const herdr = runtime || createRealHerdrCliAdapter({ socketPath: authority.host.socketPath, herdrPath: authority.host.herdrPath });
  if (!herdr || typeof herdr.snapshot !== "function" || typeof herdr.invoke !== "function" || typeof herdr.invokeVoid !== "function") throw new Error("A compatible Herdr adapter is required.");
  const socket = herdr.socket || authority.host.socketPath;
  let state = snapshot(herdr), workspaces = workspaceFor(state, authority.root);
  if (workspaces.length > 1) throw new Error("Herdr has ambiguous project workspaces.");
  if (!workspaces.length) { herdr.invoke(socket, ["workspace", "create", "--cwd", authority.root, "--no-focus"]); state = snapshot(herdr); workspaces = workspaceFor(state, authority.root); }
  if (workspaces.length !== 1 || !identifier.test(String(workspaces[0].workspace_id || ""))) throw new Error("Exact project workspace was not observed.");
  const workspace = workspaces[0]; let tabs = onboardingTabs(state, workspace.workspace_id);
  if (tabs.length > 1) throw new Error("Herdr has duplicate onboarding tabs.");
  if (!tabs.length) { herdr.invoke(socket, ["tab", "create", "--workspace", workspace.workspace_id, "--cwd", authority.head, "--label", SESSION_NAME, "--no-focus"]); state = snapshot(herdr); tabs = onboardingTabs(state, workspace.workspace_id); }
  if (tabs.length !== 1 || !identifier.test(String(tabs[0].tab_id || ""))) throw new Error("Exact onboarding tab was not observed.");
  let pane = paneFor(state, tabs[0], authority.head);
  if (pane.agent || pane.agent_session || (pane.agent_status && pane.agent_status !== "unknown")) {
    const reused = liveAgent(pane);
    if (!liveAgent(pane) && (pane.agent !== "opencode" || pane.agent_session)) throw new Error("Existing onboarding pane is foreign or ambiguous.");
    if (!liveAgent(pane) && !pane.agent) throw new Error("Existing onboarding pane is foreign or ambiguous.");
    if (!liveAgent(pane)) {
      herdr.invokeVoid(socket, ["agent", "prompt", agentName(authority.projectId), ONBOARDING_PROMPT]);
      pane = waitPane(herdr, tabs[0], authority.head, liveAgent);
    }
    herdr.invokeVoid(socket, ["tab", "focus", tabs[0].tab_id]);
    return { status: "onboarding_ready", reused, projectId: authority.projectId, projectRoot: authority.root, session: SESSION_NAME, sessionPath: session, workspaceId: workspace.workspace_id, tabId: tabs[0].tab_id, paneId: pane.pane_id, terminalId: pane.terminal_id, agentName: agentName(authority.projectId), openCodeSessionId: pane.agent_session.value, promptSubmitted: true };
  }
  herdr.invokeVoid(socket, ["agent", "start", agentName(authority.projectId), "--kind", "opencode", "--pane", pane.pane_id]);
  pane = waitPane(herdr, tabs[0], authority.head, (candidate) => candidate.agent === "opencode");
  herdr.invokeVoid(socket, ["agent", "prompt", agentName(authority.projectId), ONBOARDING_PROMPT]);
  pane = waitPane(herdr, tabs[0], authority.head, liveAgent);
  herdr.invokeVoid(socket, ["tab", "focus", tabs[0].tab_id]);
  return { status: "onboarding_ready", reused: false, projectId: authority.projectId, projectRoot: authority.root, session: SESSION_NAME, sessionPath: session, workspaceId: workspace.workspace_id, tabId: tabs[0].tab_id, paneId: pane.pane_id, terminalId: pane.terminal_id, agentName: agentName(authority.projectId), openCodeSessionId: pane.agent_session.value, promptSubmitted: true };
}

export const onboardingContract = Object.freeze({ context: ONBOARDING_CONTEXT, prompt: ONBOARDING_PROMPT });
