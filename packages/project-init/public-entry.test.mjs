import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { publicInit } from "./public-entry.mjs";

const host = { status: "installed", release: "release-id", endpoint: "http://127.0.0.1:4444", current: "/installed/current", command: "/bin/head" };
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("public init composes project and onboarding through the installed command", () => {
  const calls = [];
  const run = (command, argv) => {
    calls.push([command, argv]);
    if (argv[0] === "project") return { projectId: "sample", projectRoot: argv[2], registration: { projectId: "sample", projectRoot: argv[2] } };
    return { session: "onboarding", workspaceId: "workspace", tabId: "tab", paneId: "pane", openCodeSessionId: "ses_onboarding", reused: false };
  };
  const result = publicInit({ argv: ["init", "sample", "--project-id", "sample"], install: () => host, run });
  assert.equal(result.status, "ready");
  assert.deepEqual(calls, [["/bin/head", ["project", "init", path.resolve("sample"), "--project-id", "sample"]], ["/bin/head", ["onboarding", "start", path.resolve("sample")]]]);
});

test("public init returns the exact installed resume command after a committed project", () => {
  const result = publicInit({ argv: ["init", "sample"], install: () => host, run: (_command, argv) => {
    if (argv[0] === "project") return { projectId: "sample", projectRoot: argv[2] };
    throw new Error("onboarding unavailable");
  } });
  assert.deepEqual(result, { status: "failed", phase: "onboarding", error: "onboarding unavailable", resume: { command: "/bin/head", args: ["onboarding", "start", path.resolve("sample")] }, release: "release-id", host: "http://127.0.0.1:4444", project: "sample" });
});

test("public init preserves the complete public invocation for host failure and remaining argv for project failure", () => {
  const argv = ["init", "sample", "--project-id", "sample", "--socket", "/tmp/herdr.sock"];
  const hostFailure = publicInit({ argv, install: () => { throw new Error("host unavailable"); } });
  assert.deepEqual(hostFailure.resume, { command: process.execPath, args: [path.join(repository, "packages/project-init/public-entry.mjs"), ...argv] });
  const projectFailure = publicInit({ argv, install: () => host, run: () => { throw new Error("project unavailable"); } });
  assert.deepEqual(projectFailure.resume, { command: "/bin/head", args: ["project", "init", path.resolve("sample"), "--project-id", "sample"] });
});

test("public init rejects unknown, duplicate, and missing public options before host mutation", () => {
  for (const argv of [["init"], ["init", "sample", "--unknown", "x"], ["init", "sample", "--socket", "x", "--socket", "y"]]) {
    let installed = false;
    assert.throws(() => publicInit({ argv, install: () => { installed = true; return host; } }));
    assert.equal(installed, false);
  }
});

test("the extracted release public command performs one isolated initialization", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-public-init-"));
  const release = path.join(root, "release"), bin = path.join(root, "bin"), state = path.join(root, "herdr-state.json"), socket = path.join(root, "herdr.sock");
  const source = repository;
  for (const name of ["project-init", "coordination", "opencode-runtime", "core", "agents", "skills", "procedures"]) fs.cpSync(path.join(source, "packages", name), path.join(release, "packages", name), { recursive: true });
  fs.copyFileSync(path.join(source, "release-manifest.json"), path.join(release, "release-manifest.json"));
  fs.writeFileSync(path.join(release, "package.json"), "{\"type\":\"module\"}\n");
  fs.mkdirSync(bin); fs.writeFileSync(state, JSON.stringify({ workspaces: [], tabs: [], panes: [], promptCount: 0 }));
  const herdr = path.join(bin, "herdr"), opencode = path.join(bin, "opencode"), systemctl = path.join(bin, "systemctl");
  fs.writeFileSync(opencode, "#!/bin/sh\nprintf '{\"ok\":true}\\n'\n", { mode: 0o700 });
  fs.writeFileSync(herdr, `#!/usr/bin/env node
const fs=require('fs'),s=process.env.TEST_HERDR_STATE,a=process.argv.slice(2),read=()=>JSON.parse(fs.readFileSync(s)),write=x=>fs.writeFileSync(s,JSON.stringify(x)),out=x=>process.stdout.write(JSON.stringify({result:x})+'\\n'),value=n=>a[a.indexOf(n)+1],next=p=>p+String(read().tabs.length+1);let x=read();
if(a[0]==='integration'){if(a[1]==='status')process.stdout.write('opencode: current (v9)\\n');else out({});process.exit()}
if(a[0]==='api'){out({snapshot:{protocol:17,...x}});process.exit()}
if(a[0]==='workspace'){let id='workspace1';x.workspaces.push({workspace_id:id,cwd:a[3]});write(x);out({workspace_id:id});process.exit()}
if(a[0]==='tab'&&a[1]==='create'){let id=next('tab'),p=next('pane');x.tabs.push({workspace_id:value('--workspace'),tab_id:id,label:value('--label')});x.panes.push({workspace_id:value('--workspace'),tab_id:id,pane_id:p,terminal_id:next('terminal'),cwd:value('--cwd')});write(x);out({tab:{id},root_pane:{id:p,terminal_id:x.panes.at(-1).terminal_id}});process.exit()}
if(a[0]==='tab'&&a[1]==='close'){x.tabs=x.tabs.filter(t=>t.tab_id!==a[2]);x.panes=x.panes.filter(p=>p.tab_id!==a[2]);write(x);out({});process.exit()}
if(a[0]==='agent'&&a[1]==='start'){if(process.env.TEST_FAIL_ONBOARDING){process.stdout.write(JSON.stringify({error:'forced onboarding failure'})+'\\n');process.exit()}x.panes[0].agent='opencode';x.panes[0].agent_session={source:'herdr:opencode',value:'ses_onboarding'};write(x);out({});process.exit()}
if(a[0]==='agent'&&a[1]==='prompt'){x.promptCount++;write(x);out({});process.exit()}
if(a[0]==='pane'&&a[1]==='run'){let p=x.panes.find(p=>p.pane_id===a[2]),text=a.at(-1),files=[...text.matchAll(/(?:exact regular file before finishing:|write one JSON object to) ([^\\n]+?)\\.(?: It|$)/g)].map(m=>m[1]);p.agent='opencode';p.agent_status='done';p.agent_session={source:'herdr:opencode',value:'ses_'+p.pane_id};for(const f of files)fs.writeFileSync(f,f.endsWith('.json')?JSON.stringify({status:'completed',outputReferences:[],evidenceReferences:[]}):'completed worker handoff\\n');write(x);out({});process.exit()}
if(a[0]==='pane'&&a[1]==='read'){process.stdout.write('completed worker output\\n');process.exit()}
out({});
`, { mode: 0o700 });
  fs.writeFileSync(systemctl, "#!/usr/bin/env node\nconst fs=require('fs'),cp=require('child_process'),path=require('path');const pid=path.join(process.env.XDG_STATE_HOME,'head','fake-daemon.pid');if(process.argv[3]==='restart'){const config=path.join(process.env.XDG_CONFIG_HOME,'head','host.json'),host=JSON.parse(fs.readFileSync(config)),log=fs.openSync(path.join(process.env.XDG_STATE_HOME,'daemon.log'),'w');const child=cp.spawn(process.execPath,[path.join(host.releaseRoot,'packages/project-init/head.mjs'),'daemon','--config',config],{detached:true,stdio:['ignore',log,log],env:process.env});child.unref();fs.mkdirSync(path.dirname(pid),{recursive:true});fs.writeFileSync(pid,String(child.pid));}if(process.argv[3]==='stop'&&fs.existsSync(pid)){try{process.kill(Number(fs.readFileSync(pid)))}catch{}}\n", { mode: 0o700 });
  const server = net.createServer(); await new Promise((resolve) => server.listen(socket, resolve));
  const env = { ...process.env, HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state"), XDG_BIN_HOME: path.join(root, "user-bin"), PATH: `${bin}:${process.env.PATH}`, HERDR_SOCKET_PATH: socket, TEST_HERDR_STATE: state };
  fs.mkdirSync(env.XDG_STATE_HOME, { recursive: true, mode: 0o700 }); fs.chmodSync(env.XDG_STATE_HOME, 0o700);
  fs.mkdirSync(path.join(env.XDG_STATE_HOME, "head"), { mode: 0o700 }); fs.chmodSync(path.join(env.XDG_STATE_HOME, "head"), 0o700);
  t.after(() => { try { childProcess.execFileSync(systemctl, ["--user", "stop", "head-coordination.service"], { env }); } catch {} server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const publicCommand = path.join(release, "packages", "project-init", "public-entry.mjs");
  const target = path.join(root, "project"), first = childProcess.spawnSync(process.execPath, [publicCommand, "init", target], { env, encoding: "utf8", timeout: 20_000 });
  assert.equal(first.status, 0, `${first.stderr}\n${first.stdout}\n${fs.existsSync(path.join(env.XDG_STATE_HOME, "daemon.log")) ? fs.readFileSync(path.join(env.XDG_STATE_HOME, "daemon.log"), "utf8") : "no daemon log"}`); const result = JSON.parse(first.stdout); assert.equal(result.status, "ready"); assert.equal(fs.existsSync(path.join(target, ".claude/agents/head/sessions/onboarding/context.md")), true);
  const observed = JSON.parse(fs.readFileSync(state)); assert.ok(observed.workspaces.length >= 1); assert.ok(observed.tabs.length >= 1); assert.ok(observed.promptCount >= 1);
  const bridge = (endpoint, caller, requests) => {
    const response = childProcess.spawnSync(path.join(env.XDG_BIN_HOME, "head"), [endpoint], { env: { ...env, ...caller }, input: `${requests.map(JSON.stringify).join("\n")}\n`, encoding: "utf8", timeout: 20_000 });
    assert.equal(response.status, 0, response.stderr);
    return response.stdout.trim().split(/\r?\n/).map(JSON.parse);
  };
  const headCaller = { HERDR_WORKSPACE_ID: "workspace1", HERDR_TAB_ID: "tab1", HERDR_PANE_ID: "pane1" };
  observed.tabs.push({ workspace_id: "workspace1", tab_id: "developer-tab", label: "developer" });
  observed.panes.push({ workspace_id: "workspace1", tab_id: "developer-tab", pane_id: "developer-pane", terminal_id: "developer-terminal", cwd: path.join(target, ".claude/agents/developer") });
  fs.writeFileSync(state, JSON.stringify(observed));
  assert.ok(fs.lstatSync(path.join(target, ".claude/agents/head")).isDirectory());
   const taskResponses = bridge("agent-task", headCaller, [
     { jsonrpc: "2.0", id: 1, method: "initialize" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "quick_task", arguments: { task_id: "proof-task", agent: "developer", command: "complete proof" } } },
    { jsonrpc: "2.0", id: 3, method: "tools/list" },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "quick_task", arguments: { task_id: "unowned", agent: "head", command: "must fail" } } },
  ]);
  assert.ok(taskResponses[1].result, JSON.stringify(taskResponses)); assert.equal(taskResponses[1].result.structuredContent.status, "running"); assert.deepEqual(taskResponses[2].result.tools.map((tool) => tool.name), ["quick_task"]); assert.equal(taskResponses[3].error.data.code, "UNKNOWN_AGENT");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  const taskFile = path.join(env.XDG_STATE_HOME, "head", "projects", "project", "agent-task", "quick-tasks", "proof-task.json");
  const completedTask = JSON.parse(fs.readFileSync(taskFile, "utf8")); assert.equal(completedTask.status, "completed"); assert.equal(completedTask.cleanup, "closed"); assert.equal(completedTask.handoffFile, path.join(env.XDG_STATE_HOME, "head", "projects", "project", "agent-task", "quick-tasks", "results", "proof-task.handoff.md")); assert.equal(path.relative(target, completedTask.handoffFile).startsWith(".."), true); assert.match(fs.readFileSync(completedTask.handoffFile, "utf8"), /completed worker handoff/);
  const commHead = bridge("agent-comm", headCaller, [{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
  const commDeveloper = bridge("agent-comm", { HERDR_WORKSPACE_ID: "workspace1", HERDR_TAB_ID: "developer-tab", HERDR_PANE_ID: "developer-pane" }, [
    { jsonrpc: "2.0", id: 1, method: "initialize" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "send_message", arguments: { to: "head", content: "worker proof", idempotency_key: "proof-message" } } },
  ]);
  assert.ok(commHead[0].result.sessionId); assert.ok(commDeveloper[1].result.structuredContent.message_id);
  const inbox = bridge("agent-comm", headCaller, [{ jsonrpc: "2.0", id: 1, method: "initialize" }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_inbox", arguments: {} } }]);
  assert.equal(inbox[1].result.structuredContent[0].content, "worker proof");
  const beforeRetry = JSON.parse(fs.readFileSync(state));
  const second = childProcess.spawnSync(process.execPath, [publicCommand, "init", target], { env, encoding: "utf8", timeout: 20_000 }); assert.equal(second.status, 0, second.stderr); assert.equal(JSON.parse(second.stdout).converged, true);
  const afterRetry = JSON.parse(fs.readFileSync(state)); assert.equal(afterRetry.workspaces.length, beforeRetry.workspaces.length); assert.equal(afterRetry.tabs.length, beforeRetry.tabs.length); assert.equal(afterRetry.promptCount, beforeRetry.promptCount);
  const session = path.join(target, ".claude", "agents", "head", "sessions", "onboarding");
  const run = path.join(session, "runs", "recovery-proof");
  fs.mkdirSync(path.join(run, "ledger"), { recursive: true }); fs.mkdirSync(path.join(run, "slices"));
  fs.writeFileSync(path.join(run, "run.md"), "# Recovery proof Run\n");
  fs.writeFileSync(path.join(run, "slices", "01-recovery-proof.md"), "# Recovery proof Slice\n");
  fs.writeFileSync(path.join(run, "ledger", "0000.json"), JSON.stringify({ id: "cp-0000", at: "2026-08-06T00:00:00Z", horizon: { slice: null, wave: null }, expected: "recovery", observed: "prepared", evidence: [], decision: { type: "START", reason: "public proof" }, next: { output: "recover", slice: "slices/01-recovery-proof.md", wave: null } }));
  const { createSessionTransitions } = await import(path.join(release, "packages", "opencode-runtime", "runtime", "opencode", "bin", "session-transitions.mjs"));
  const { buildHeadPrompt, detectHerdrLocation } = await import(path.join(release, "packages", "opencode-runtime", "runtime", "opencode", "bin", "render-runtime-config.mjs"));
  const bindings = new Map([["ses_proof", { sessionName: "onboarding" }]]);
  const liveLocation = detectHerdrLocation(
    { HERDR_SOCKET_PATH: socket, HERDR_WORKSPACE_ID: "workspace1", HERDR_TAB_ID: "tab1", HERDR_PANE_ID: "pane1" },
    (caller) => ({ ...caller, terminalId: "terminal1", cwd: path.join(target, ".claude", "agents", "head"), tabLabel: "onboarding" }),
    target,
  );
  const sessionRecovery = buildHeadPrompt({ root: target, sessionID: "ses_proof", location: liveLocation });
  assert.equal(sessionRecovery.metadata.mode, "session"); assert.match(sessionRecovery.prompt, /New project onboarding/);
  const transition = createSessionTransitions({
    headDirectory: path.join(target, ".claude", "agents", "head"),
    identity: { live: () => ({ sessionName: "onboarding", tabLabel: "onboarding" }) },
    binding: { read: (id) => bindings.get(id) },
  });
  assert.deepEqual(transition({ action: "start_run", sessionID: "ses_proof", run_id: "recovery-proof" }), { ok: true, session: "onboarding", mode: "run", activeRun: "recovery-proof", generation: 1 });
  const recovery = buildHeadPrompt({ root: target, sessionID: "ses_proof", location: liveLocation });
  assert.equal(recovery.metadata.mode, "run"); assert.match(recovery.prompt, /Recovery proof Run|Recovery proof Slice|cp-0000/);
  assert.deepEqual(recovery.metadata.loadedPaths, ["context.md", "runs/recovery-proof/run.md", "runs/recovery-proof/ledger/0000.json", "runs/recovery-proof/slices/01-recovery-proof.md"]);
  const canonicalFiles = [
    path.join(session, "context.md"),
    path.join(session, "session-state.json"),
    path.join(run, "run.md"),
    path.join(run, "ledger", "0000.json"),
    path.join(run, "slices", "01-recovery-proof.md"),
  ];
  const canonicalBefore = new Map(canonicalFiles.map((file) => [file, fs.readFileSync(file)]));
  const { CompactRecovery } = await import(path.join(release, "packages", "opencode-runtime", "runtime", "opencode", "plugins", "compact-recovery-core.mjs"));
  const submitted = [];
  const client = { session: {
    messages: async () => ({ data: [{ info: { role: "user", model: { providerID: "openai", modelID: "proof-model" } } }] }),
    summarize: async () => ({ data: true }),
    promptAsync: async (request) => { submitted.push(request); return { data: { ok: true } }; },
  } };
  const scalar = { optional() { return this; }, describe() { return this; } };
  const compact = await CompactRecovery({ root: target, client, schema: { string: () => scalar }, detectLocation: () => ({ tabLabel: "onboarding", sessionName: "onboarding" }) });
  await compact.tool.checkpoint_compact.execute({ next_instruction: "Resume the recovery proof." }, { sessionID: "ses_proof", messageID: "request-one" });
  await compact.event({ event: { type: "session.idle", properties: { sessionID: "ses_proof" } } });
  const compacting = { prompt: "", context: ["native supplemental context"] };
  await compact["experimental.session.compacting"]({ sessionID: "ses_proof" }, compacting);
  assert.match(compacting.prompt, /non-canonical runtime continuity/);
  assert.deepEqual(compacting.context, []);
  const compactionSystem = { system: [] };
  await compact["experimental.chat.system.transform"]({ sessionID: "ses_proof" }, compactionSystem);
  assert.deepEqual(compactionSystem.system, []);
  const nativeAutocontinue = { enabled: true };
  await compact["experimental.compaction.autocontinue"]({ sessionID: "ses_proof" }, nativeAutocontinue);
  assert.equal(nativeAutocontinue.enabled, false);
  await compact.event({ event: { type: "session.compacted", properties: { sessionID: "ses_proof" } } });
  assert.deepEqual(submitted, [{ path: { id: "ses_proof" }, body: { parts: [{ type: "text", text: "Resume the recovery proof." }] } }]);
  const recoverySystem = { system: [] };
  await compact["experimental.chat.system.transform"]({ sessionID: "ses_proof" }, recoverySystem);
  assert.match(recoverySystem.system.join("\n"), /Recovery proof Run|Recovery proof Slice|cp-0000/);
  await compact.event({ event: { type: "session.compacted", properties: { sessionID: "ses_proof" } } });
  assert.equal(submitted.length, 1);
  await compact.tool.checkpoint_compact.execute({ next_instruction: "This must be superseded." }, { sessionID: "ses_proof", messageID: "request-two" });
  await compact.event({ event: { type: "session.idle", properties: { sessionID: "ses_proof" } } });
  await compact["chat.message"]({ sessionID: "ses_proof", messageID: "real-user-turn" }, { message: { role: "user" }, parts: [{ type: "text", text: "Use this new instruction instead." }] });
  await compact.event({ event: { type: "session.compacted", properties: { sessionID: "ses_proof" } } });
  assert.equal(submitted.length, 1);
  for (const [file, body] of canonicalBefore) assert.deepEqual(fs.readFileSync(file), body, file);
  fs.mkdirSync(path.join(target, ".claude", "agents", "head", "sessions", "different-live-tab"));
  const conflict = buildHeadPrompt({ root: target, sessionID: "ses_proof", location: { sessionName: "different-live-tab" } });
  assert.match(conflict.prompt, /SESSION_IDENTITY_CONFLICT/); assert.equal(conflict.metadata.shouldInject, false);
  const collision = path.join(root, "project-collision"); fs.writeFileSync(collision, "not a directory\n");
  const failedProject = childProcess.spawnSync(process.execPath, [publicCommand, "init", collision], { env, encoding: "utf8", timeout: 20_000 }); assert.notEqual(failedProject.status, 0); const projectResult = JSON.parse(failedProject.stdout); assert.deepEqual(projectResult.resume, { command: path.join(env.XDG_BIN_HOME, "head"), args: ["project", "init", collision] }); assert.equal(fs.existsSync(path.join(collision, ".claude")), false);
  const failedOnboardingTarget = path.join(root, "onboarding-failure");
  const failedOnboarding = childProcess.spawnSync(process.execPath, [publicCommand, "init", failedOnboardingTarget], { env: { ...env, TEST_FAIL_ONBOARDING: "1" }, encoding: "utf8", timeout: 20_000 }); assert.notEqual(failedOnboarding.status, 0); const onboardingResult = JSON.parse(failedOnboarding.stdout); assert.deepEqual(onboardingResult.resume, { command: path.join(env.XDG_BIN_HOME, "head"), args: ["onboarding", "start", failedOnboardingTarget] }); assert.equal(fs.existsSync(path.join(failedOnboardingTarget, ".claude/head-runtime.json")), true);
});
