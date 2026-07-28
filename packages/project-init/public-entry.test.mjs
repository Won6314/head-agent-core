import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publicInit } from "./public-entry.mjs";

const host = { status: "installed", release: "release-id", endpoint: "http://127.0.0.1:4444", current: "/installed/current", command: "/bin/head" };

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
  assert.deepEqual(hostFailure.resume, { command: "./head", args: argv });
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

test("the extracted release-root head performs one isolated public initialization", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-public-init-"));
  const release = path.join(root, "release"), bin = path.join(root, "bin"), state = path.join(root, "herdr-state.json"), socket = path.join(root, "herdr.sock");
  const source = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  for (const name of ["project-init", "coordination", "opencode-runtime", "core", "agents", "skills"]) fs.cpSync(path.join(source, "packages", name), path.join(release, "packages", name), { recursive: true });
  fs.copyFileSync(path.join(source, "release-manifest.json"), path.join(release, "release-manifest.json"));
  fs.writeFileSync(path.join(release, "head"), "#!/bin/sh\nexec node \"$(dirname \"$0\")/packages/project-init/public-entry.mjs\" \"$@\"\n", { mode: 0o700 });
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
if(a[0]==='pane'&&a[1]==='run'){let p=x.panes.find(p=>p.pane_id===a[2]),text=a.at(-1),files=[...text.matchAll(/(?:exact regular file before finishing:|write one JSON object to) \\x60([^\\x60]+)\\x60/g)].map(m=>m[1]);p.agent='opencode';p.agent_status='done';p.agent_session={source:'herdr:opencode',value:'ses_'+p.pane_id};for(const f of files)fs.writeFileSync(f,f.endsWith('.json')?JSON.stringify({status:'completed',outputReferences:[],evidenceReferences:[]}):'completed worker handoff\\n');write(x);out({});process.exit()}
if(a[0]==='pane'&&a[1]==='read'){process.stdout.write('completed worker output\\n');process.exit()}
out({});
`, { mode: 0o700 });
  fs.writeFileSync(systemctl, "#!/usr/bin/env node\nconst fs=require('fs'),cp=require('child_process'),path=require('path');const pid=path.join(process.env.XDG_STATE_HOME,'head','fake-daemon.pid');if(process.argv[3]==='restart'){const config=path.join(process.env.XDG_CONFIG_HOME,'head','host.json'),host=JSON.parse(fs.readFileSync(config)),log=fs.openSync(path.join(process.env.XDG_STATE_HOME,'daemon.log'),'w');const child=cp.spawn(process.execPath,[path.join(host.releaseRoot,'packages/project-init/head.mjs'),'daemon','--config',config],{detached:true,stdio:['ignore',log,log],env:process.env});child.unref();fs.mkdirSync(path.dirname(pid),{recursive:true});fs.writeFileSync(pid,String(child.pid));}if(process.argv[3]==='stop'&&fs.existsSync(pid)){try{process.kill(Number(fs.readFileSync(pid)))}catch{}}\n", { mode: 0o700 });
  const server = net.createServer(); await new Promise((resolve) => server.listen(socket, resolve));
  const env = { ...process.env, HOME: path.join(root, "home"), XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), XDG_STATE_HOME: path.join(root, "state"), XDG_BIN_HOME: path.join(root, "user-bin"), PATH: `${bin}:${process.env.PATH}`, HERDR_SOCKET_PATH: socket, TEST_HERDR_STATE: state };
  fs.mkdirSync(env.XDG_STATE_HOME, { recursive: true, mode: 0o700 }); fs.chmodSync(env.XDG_STATE_HOME, 0o700);
  fs.mkdirSync(path.join(env.XDG_STATE_HOME, "head"), { mode: 0o700 }); fs.chmodSync(path.join(env.XDG_STATE_HOME, "head"), 0o700);
  t.after(() => { try { childProcess.execFileSync(systemctl, ["--user", "stop", "head-coordination.service"], { env }); } catch {} server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const target = path.join(root, "project"), first = childProcess.spawnSync(path.join(release, "head"), ["init", target], { env, encoding: "utf8", timeout: 20_000 });
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
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "quick_task", arguments: { task_id: "proof-task", agent: "head", command: "complete proof" } } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "frozen_wave", arguments: { wave_id: "proof-wave", nodes: [{ node_id: "one", agent: "head", command: "complete frozen proof", dependencies: [] }] } } },
  ]);
  assert.ok(taskResponses[1].result, JSON.stringify(taskResponses)); assert.ok(taskResponses[2].result, JSON.stringify(taskResponses)); assert.equal(taskResponses[1].result.structuredContent.status, "running"); assert.equal(taskResponses[2].result.structuredContent.status, "running");
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  const taskFile = path.join(env.XDG_STATE_HOME, "head", "projects", "project", "agent-task", "quick-tasks", "proof-task.json");
  const waveFile = path.join(env.XDG_STATE_HOME, "head", "projects", "project", "agent-task", "frozen-waves", "proof-wave.json");
  assert.equal(JSON.parse(fs.readFileSync(taskFile, "utf8")).status, "completed"); assert.equal(JSON.parse(fs.readFileSync(waveFile, "utf8")).status, "completed");
  const commHead = bridge("agent-comm", headCaller, [{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
  const commDeveloper = bridge("agent-comm", { HERDR_WORKSPACE_ID: "workspace1", HERDR_TAB_ID: "developer-tab", HERDR_PANE_ID: "developer-pane" }, [
    { jsonrpc: "2.0", id: 1, method: "initialize" },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "send_message", arguments: { to: "head", content: "worker proof", idempotency_key: "proof-message" } } },
  ]);
  assert.ok(commHead[0].result.sessionId); assert.ok(commDeveloper[1].result.structuredContent.message_id);
  const inbox = bridge("agent-comm", headCaller, [{ jsonrpc: "2.0", id: 1, method: "initialize" }, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_inbox", arguments: {} } }]);
  assert.equal(inbox[1].result.structuredContent[0].content, "worker proof");
  const beforeRetry = JSON.parse(fs.readFileSync(state));
  const second = childProcess.spawnSync(path.join(release, "head"), ["init", target], { env, encoding: "utf8", timeout: 20_000 }); assert.equal(second.status, 0, second.stderr); assert.equal(JSON.parse(second.stdout).converged, true);
  const afterRetry = JSON.parse(fs.readFileSync(state)); assert.equal(afterRetry.workspaces.length, beforeRetry.workspaces.length); assert.equal(afterRetry.tabs.length, beforeRetry.tabs.length); assert.equal(afterRetry.promptCount, beforeRetry.promptCount);
  const collision = path.join(root, "project-collision"); fs.writeFileSync(collision, "not a directory\n");
  const failedProject = childProcess.spawnSync(path.join(release, "head"), ["init", collision], { env, encoding: "utf8", timeout: 20_000 }); assert.notEqual(failedProject.status, 0); const projectResult = JSON.parse(failedProject.stdout); assert.deepEqual(projectResult.resume, { command: path.join(env.XDG_BIN_HOME, "head"), args: ["project", "init", collision] }); assert.equal(fs.existsSync(path.join(collision, ".claude")), false);
  const failedOnboardingTarget = path.join(root, "onboarding-failure");
  const failedOnboarding = childProcess.spawnSync(path.join(release, "head"), ["init", failedOnboardingTarget], { env: { ...env, TEST_FAIL_ONBOARDING: "1" }, encoding: "utf8", timeout: 20_000 }); assert.notEqual(failedOnboarding.status, 0); const onboardingResult = JSON.parse(failedOnboarding.stdout); assert.deepEqual(onboardingResult.resume, { command: path.join(env.XDG_BIN_HOME, "head"), args: ["onboarding", "start", failedOnboardingTarget] }); assert.equal(fs.existsSync(path.join(failedOnboardingTarget, ".claude/head-runtime.json")), true);
});
