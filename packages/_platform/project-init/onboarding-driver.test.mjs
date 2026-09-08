import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initializeProject } from "./project-initializer.mjs";
import { onboardingContract, startOnboarding } from "./onboarding-driver.mjs";

const repository = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const files = (root) => {
  const output = []; const walk = (directory) => { for (const name of fs.readdirSync(directory).sort()) { const file = path.join(directory, name), stat = fs.lstatSync(file); if (stat.isDirectory()) walk(file); else output.push([path.relative(root, file), fs.readFileSync(file).toString("base64")]); } }; walk(root); return output;
};
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-onboarding-")), data = path.join(root, "data"), config = path.join(root, "config"), state = path.join(root, "state"), release = path.join(root, "release");
  fs.mkdirSync(state, { recursive: true, mode: 0o700 }); fs.chmodSync(state, 0o700); fs.cpSync(path.join(repository, "packages"), path.join(release, "packages"), { recursive: true });
  const source = "const http=require('node:http');const s=http.createServer(async(q,r)=>{let b='';for await(const c of q)b+=c;const endpoint=q.url==='/agent-task'?'task':'comm';r.end(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(b).id,result:{endpoint}}))});s.listen(0,'127.0.0.1',()=>process.stdout.write(s.address().port+'\\n'))";
  const server = childProcess.spawn(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "inherit"] }); const port = await new Promise((resolve) => server.stdout.once("data", (value) => resolve(Number(value))));
  t.after(() => server.kill()); fs.mkdirSync(path.join(data, "head"), { recursive: true }); fs.symlinkSync(release, path.join(data, "head", "current")); fs.mkdirSync(path.join(config, "head"), { recursive: true });
  const herdr = path.join(root, "herdr"), opencode = path.join(root, "opencode"); fs.writeFileSync(herdr, "#!/bin/sh\n", { mode: 0o700 }); fs.writeFileSync(opencode, "#!/bin/sh\n", { mode: 0o700 });
  fs.writeFileSync(path.join(config, "head", "host.json"), JSON.stringify({ schemaVersion: 1, releaseRoot: release, stateRoot: state, endpoint: `http://127.0.0.1:${port}`, herdrPath: herdr, opencodePath: opencode, socketPath: path.join(root, "fake.sock") }));
  const env = { HOME: path.join(root, "home"), XDG_DATA_HOME: data, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state };
  const target = path.join(root, "project"); initializeProject({ target, env }); return { root, target, env };
}
function fakeRuntime() {
  const state = { workspaces: [], tabs: [], panes: [] }, calls = []; let number = 0;
  const next = (kind) => `${kind}-${++number}`;
  const runtime = {
    socket: "/pinned.sock", snapshot: () => structuredClone(state), invoke: (_socket, argv) => {
      calls.push(argv); if (argv[0] === "workspace") { const workspace_id = next("workspace"); state.workspaces.push({ workspace_id, cwd: argv[3] }); return { workspace_id }; }
      if (argv[0] === "tab") { const tab_id = next("tab"), pane_id = next("pane"), terminal_id = next("terminal"); state.tabs.push({ workspace_id: argv[3], tab_id, label: argv[7] }); state.panes.push({ workspace_id: argv[3], tab_id, pane_id, terminal_id, cwd: argv[5], agent_status: "unknown" }); return { tab_id, pane_id, terminal_id }; }
      throw new Error("unexpected invoke");
    },
    invokeVoid: (_socket, argv) => { calls.push(argv); if (argv[0] === "agent" && argv[1] === "start") { const pane = state.panes.find((item) => item.pane_id === argv[argv.length - 1]); pane.agent = "opencode"; pane.agent_session = { source: "herdr:opencode", value: "ses_onboarding" }; } },
  };
  return { runtime, state, calls };
}

test("onboarding creates one protected session, tab, model-free agent, prompt and focus", async (t) => {
  const f = await fixture(t), fake = fakeRuntime(), before = files(f.target);
  const result = startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime });
  assert.equal(result.status, "onboarding_ready"); assert.equal(result.reused, false); assert.equal(result.openCodeSessionId, "ses_onboarding");
  assert.deepEqual(fake.calls, [["workspace", "create", "--cwd", f.target, "--no-focus"], ["tab", "create", "--workspace", "workspace-1", "--cwd", path.join(f.target, ".claude/agents/head"), "--label", "onboarding", "--no-focus"], ["agent", "start", "project-onboarding", "--kind", "opencode", "--pane", "pane-3"], ["agent", "prompt", "project-onboarding", onboardingContract.prompt], ["tab", "focus", "tab-2"]]);
  assert.equal(fake.calls[2].some((part) => /model|provider|auth/i.test(part)), false);
  const after = files(f.target).filter(([name]) => !name.startsWith(".claude/agents/head/sessions/onboarding/")); assert.deepEqual(after, before);
  assert.match(onboardingContract.context, /Protected authorities: managed manifests.*credentials, provider and model selection/s); assert.match(onboardingContract.prompt, /do not assume project answers/i);
});

test("pristine partial resumes without rewriting and live onboarding focuses without another prompt", async (t) => {
  const f = await fixture(t), fake = fakeRuntime();
  fs.mkdirSync(path.join(f.target, ".claude/agents/head/sessions/onboarding")); fs.writeFileSync(path.join(f.target, ".claude/agents/head/sessions/onboarding/context.md"), onboardingContract.context); fs.writeFileSync(path.join(f.target, ".claude/agents/head/sessions/onboarding/session-state.json"), `${JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }, null, 2)}\n`);
  const beforeStart = files(path.join(f.target, ".claude/agents/head/sessions/onboarding")); startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime }); assert.deepEqual(files(path.join(f.target, ".claude/agents/head/sessions/onboarding")), beforeStart);
  const history = path.join(f.target, ".claude/agents/head/sessions/onboarding/history.md");
  fs.writeFileSync(history, "<!-- restore-ids\nclaude: \nopencode: ses_onboarding\nlast_runtime: opencode\nupdated_at: 2026-08-06T00:00:00Z\n-->\n");
  const sessionBefore = files(path.join(f.target, ".claude/agents/head/sessions/onboarding")); const count = fake.calls.length, second = startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime }); assert.equal(second.reused, true); assert.equal(second.openCodeSessionId, "ses_onboarding"); assert.deepEqual(fake.calls.slice(count), [["tab", "focus", "tab-2"]]); assert.deepEqual(files(path.join(f.target, ".claude/agents/head/sessions/onboarding")), sessionBefore);
});

test("malformed restore history rejects onboarding reuse before any mutation", async (t) => {
  const f = await fixture(t), fake = fakeRuntime(), session = path.join(f.target, ".claude/agents/head/sessions/onboarding");
  fs.mkdirSync(session); fs.writeFileSync(path.join(session, "context.md"), onboardingContract.context); fs.writeFileSync(path.join(session, "session-state.json"), `${JSON.stringify({ schema: 1, generation: 0, mode: "session", activeRun: null }, null, 2)}\n`);
  fs.writeFileSync(path.join(session, "history.md"), "<!-- restore-ids\nclaude: prose\nopencode: ses_onboarding\nlast_runtime: opencode\nupdated_at: 2026-08-06T00:00:00Z\n-->\n");
  const before = files(f.target); assert.throws(() => startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime }), /incompatible restore history/); assert.deepEqual(files(f.target), before); assert.deepEqual(fake.calls, []);
});

test("onboarding identifies a protocol-19 workspace from its root pane when workspace cwd is absent", async (t) => {
  const f = await fixture(t), fake = fakeRuntime();
  fake.state.workspaces.push({ workspace_id: "workspace-existing" });
  fake.state.tabs.push({ workspace_id: "workspace-existing", tab_id: "tab-existing", label: "1" });
  fake.state.panes.push({ workspace_id: "workspace-existing", tab_id: "tab-existing", pane_id: "pane-existing", terminal_id: "terminal-existing", cwd: f.target });
  const result = startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime });
  assert.equal(result.workspaceId, "workspace-existing");
  assert.equal(fake.calls.some((argv) => argv[0] === "workspace"), false);
});

test("ambiguous topology and invalid registration fail without changing project authorities", async (t) => {
  const f = await fixture(t), fake = fakeRuntime(), before = files(f.target);
  fake.state.workspaces.push({ workspace_id: "workspace-a", cwd: f.target }, { workspace_id: "workspace-b", cwd: f.target });
  assert.throws(() => startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime }), /ambiguous project workspaces/); assert.deepEqual(files(f.target).filter(([name]) => !name.startsWith(".claude/agents/head/sessions/onboarding/")), before); assert.deepEqual(fake.calls, []);
  fs.writeFileSync(path.join(f.target, ".claude/head-runtime.json"), JSON.stringify({ version: 1, projectId: "other" })); const project = JSON.parse(fs.readFileSync(path.join(f.target, ".claude/head-project.json"), "utf8")); project.projectId = "other"; fs.writeFileSync(path.join(f.target, ".claude/head-project.json"), JSON.stringify(project)); assert.throws(() => startOnboarding({ target: f.target, env: f.env, runtime: fake.runtime }), /exact host registration/);
});
