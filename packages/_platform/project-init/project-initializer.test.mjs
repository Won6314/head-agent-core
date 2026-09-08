import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { initializeProject } from "./project-initializer.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const snapshot = (root) => {
  const entries = [];
  const visit = (current) => { for (const name of fs.readdirSync(current).sort()) { const file = path.join(current, name); const relative = path.relative(root, file); const stat = fs.lstatSync(file); if (stat.isDirectory()) visit(file); else entries.push([relative, fs.readFileSync(file).toString("base64"), stat.mode & 0o777]); } };
  visit(root); return entries;
};
async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-project-init-"));
  const home = path.join(root, "home"), data = path.join(root, "data"), config = path.join(root, "config"), state = path.join(root, "state"), release = path.join(root, "release");
  fs.mkdirSync(state, { recursive: true, mode: 0o700 }); fs.cpSync(path.join(repository, "packages"), path.join(release, "packages"), { recursive: true });
  const source = "const http=require('node:http');const server=http.createServer(async(q,s)=>{let b='';for await(const c of q)b+=c;const endpoint=q.url==='/agent-task'?'task':q.url==='/agent-comm'?'comm':'';s.setHeader('content-type','application/json');s.end(JSON.stringify({jsonrpc:'2.0',id:JSON.parse(b).id,result:{endpoint}}))});server.listen(0,'127.0.0.1',()=>process.stdout.write(String(server.address().port)+'\\n'));";
  const server = childProcess.spawn(process.execPath, ["-e", source], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve) => server.stdout.once("data", (value) => resolve(Number(value.toString()))));
  const endpoint = `http://127.0.0.1:${port}`;
  fs.mkdirSync(path.join(data, "head"), { recursive: true, mode: 0o700 }); fs.symlinkSync(release, path.join(data, "head", "current"));
  fs.mkdirSync(path.join(config, "head"), { recursive: true, mode: 0o700 }); fs.writeFileSync(path.join(config, "head", "host.json"), JSON.stringify({ schemaVersion: 1, releaseRoot: release, stateRoot: state, endpoint }));
  return { root, state, release, server, env: { HOME: home, XDG_DATA_HOME: data, XDG_CONFIG_HOME: config, XDG_STATE_HOME: state } };
}

test("file-only project init creates generic composition and converges", async (t) => {
  const f = await fixture(); t.after(() => f.server.kill()); const target = path.join(f.root, "Sample Project");
  const first = JSON.parse(childProcess.execFileSync(process.execPath, [path.join(f.release, "packages/_platform/project-init/head.mjs"), "project", "init", target], { env: { ...process.env, ...f.env }, encoding: "utf8" }));
  assert.deepEqual(first.registration, { projectId: "sample-project", projectRoot: target });
  assert.equal(first.readiness, "onboarding");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target, ".claude/head-runtime.json"))), { version: 1, projectId: "sample-project" });
  assert.equal(fs.statSync(path.join(target, "scripts/resume-session.sh")).mode & 0o111, 0o100);
  for (const role of ["head", "developer", "coder", "reviewer"]) {
    const config = fs.readFileSync(path.join(target, ".claude/agents", role, "opencode.json"), "utf8");
    assert.match(config, /packages/); assert.doesNotMatch(config, /model|provider|noahchat/i);
  }
  const headConfig = JSON.parse(fs.readFileSync(path.join(target, ".claude/agents/head/opencode.json"), "utf8"));
  assert.deepEqual(headConfig.skills.paths, [path.join(f.env.XDG_DATA_HOME, "head/current/packages/skills"), path.join(target, ".claude/skills")]);
  assert.equal(headConfig.skills.paths.some((entry) => entry.includes("packages/procedures")), false);
  assert.equal(fs.existsSync(path.join(f.release, "packages/procedures/plan-run/planning/activate-runner.md")), true);
  assert.equal(fs.readdirSync(path.join(target, ".claude/agents/head/sessions")).length, 0);
  const before = snapshot(target); initializeProject({ target, env: f.env }); assert.deepEqual(snapshot(target), before);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.state, "bindings.json"), "utf8")).length, 1);
});

test("project-owned prose is preserved and unsafe collisions fail before mutation", async (t) => {
  const f = await fixture(); t.after(() => f.server.kill()); const target = path.join(f.root, "existing"); fs.mkdirSync(target); fs.writeFileSync(path.join(target, "CLAUDE.md"), "owned prose\n"); fs.writeFileSync(path.join(target, "opencode.json"), "{\"owned\":true}\n");
  initializeProject({ target, env: f.env }); assert.equal(fs.readFileSync(path.join(target, "CLAUDE.md"), "utf8"), "owned prose\n"); assert.equal(fs.readFileSync(path.join(target, "opencode.json"), "utf8"), "{\"owned\":true}\n");
  const collision = path.join(f.root, "collision"); fs.mkdirSync(collision); fs.mkdirSync(path.join(collision, ".claude")); fs.writeFileSync(path.join(collision, ".claude/head-runtime.json"), "foreign");
  assert.throws(() => initializeProject({ target: collision, env: f.env }), /Managed file collision/);
  assert.equal(fs.existsSync(path.join(collision, ".claude/agents")), false);
  const direct = path.join(f.root, "direct"); const linked = path.join(f.root, "linked"); fs.mkdirSync(direct); fs.symlinkSync(direct, linked); assert.throws(() => initializeProject({ target: path.join(linked, "target"), env: f.env }), /symlink/); assert.equal(fs.existsSync(path.join(direct, "target")), false);
});

test("registration collision, broken current, and unhealthy endpoint leave target absent", async (t) => {
  const f = await fixture(); t.after(() => f.server.kill()); const first = path.join(f.root, "first"); initializeProject({ target: first, projectId: "same", env: f.env });
  const collision = path.join(f.root, "second"); assert.throws(() => initializeProject({ target: collision, projectId: "same", env: f.env }), /already registered/); assert.equal(fs.existsSync(collision), false);
  const current = path.join(f.env.XDG_DATA_HOME, "head/current"); fs.unlinkSync(current); fs.symlinkSync(path.join(f.root, "wrong"), current); const broken = path.join(f.root, "broken"); assert.throws(() => initializeProject({ target: broken, env: f.env })); assert.equal(fs.existsSync(broken), false);
  fs.unlinkSync(current); fs.symlinkSync(f.release, current); const hostFile = path.join(f.env.XDG_CONFIG_HOME, "head", "host.json"); const host = JSON.parse(fs.readFileSync(hostFile, "utf8")); host.endpoint = "http://127.0.0.1:1"; fs.writeFileSync(hostFile, JSON.stringify(host)); const unhealthy = path.join(f.root, "unhealthy"); assert.throws(() => initializeProject({ target: unhealthy, env: f.env })); assert.equal(fs.existsSync(unhealthy), false);
});
