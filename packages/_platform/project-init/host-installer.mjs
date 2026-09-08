import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfiguredOpenCodeBinary } from "../coordination/mcp/host-coordination/worker-launcher.mjs";
import { createRealHerdrCliAdapter } from "../coordination/mcp/host-coordination/real-herdr-cli-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fail = (message) => { throw new Error(message); };
const real = (value) => fs.realpathSync(value);
const exists = (file) => fs.existsSync(file);
const locations = (env) => { const home = env.HOME || os.homedir(); return { data: env.XDG_DATA_HOME || path.join(home, ".local", "share"), config: env.XDG_CONFIG_HOME || path.join(home, ".config"), state: env.XDG_STATE_HOME || path.join(home, ".local", "state"), bin: env.XDG_BIN_HOME || path.join(home, ".local", "bin") }; };
const write = (file, value, mode = 0o600) => { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); const temp = `${file}.${crypto.randomUUID()}`; fs.writeFileSync(temp, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { mode, flag: "wx" }); fs.renameSync(temp, file); };
const link = (target, file) => { const temp = `${file}.${crypto.randomUUID()}`; fs.symlinkSync(target, temp); fs.renameSync(temp, file); };
const copy = (source, destination) => { const stat = fs.lstatSync(source); if (stat.isSymbolicLink()) fail("Release sources may not contain symlinks."); if (stat.isDirectory()) { fs.mkdirSync(destination, { recursive: true, mode: 0o700 }); for (const name of fs.readdirSync(source).sort()) if (!name.endsWith(".test.mjs")) copy(path.join(source, name), path.join(destination, name)); } else if (stat.isFile()) { fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 }); fs.copyFileSync(source, destination); fs.chmodSync(destination, stat.mode & 0o111 ? 0o500 : 0o400); } else fail("Release source is not regular."); };

export function releaseIdentity(releaseRoot) {
  const manifestFile = path.join(releaseRoot, "release-manifest.json");
  if (!exists(manifestFile)) fail("Generated release has no release manifest.");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.packages)) fail("Release manifest is incompatible.");
  const files = ["release-manifest.json"];
  for (const pkg of manifest.packages) for (const selected of pkg.paths || []) {
    const source = path.join(releaseRoot, selected); if (!exists(source)) fail(`Release manifest source is missing: ${selected}`);
    const visit = (item) => { const stat = fs.lstatSync(item); if (stat.isSymbolicLink()) fail("Release sources may not contain symlinks."); if (stat.isDirectory()) { for (const name of fs.readdirSync(item).sort()) if (!name.endsWith(".test.mjs")) visit(path.join(item, name)); } else if (stat.isFile()) files.push(path.relative(releaseRoot, item)); else fail(`Release source is not regular: ${item}`); };
    visit(source);
  }
  const hash = crypto.createHash("sha256"); for (const name of files.sort()) hash.update(`${name}\0`).update(fs.readFileSync(path.join(releaseRoot, name))).update("\0");
  return { identity: hash.digest("hex"), manifest, files: files.sort() };
}
function discover(command, explicit, env) { const value = explicit || (env.PATH || "").split(path.delimiter).map((dir) => path.join(dir, command)).find(exists); if (!value) fail(`No ${command} executable was discovered.`); return real(value); }
function assertSafeDestination(root) { let current = path.parse(path.resolve(root)).root; for (const part of path.relative(current, path.resolve(root)).split(path.sep).filter(Boolean)) { current = path.join(current, part); if (exists(current) && fs.lstatSync(current).isSymbolicLink()) fail("Host destination may not be a symlink."); } }
function service(platform, config, command) { if (platform === "linux") return { kind: "systemd", file: `[Unit]\nDescription=HEAD coordination host\n[Service]\nExecStart=${JSON.stringify(command)} daemon --config ${JSON.stringify(config)}\nRestart=on-failure\n[Install]\nWantedBy=default.target\n` }; if (platform === "darwin") return { kind: "launchd", file: `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>Label</key><string>dev.head.coordination</string><key>ProgramArguments</key><array><string>${command}</string><string>daemon</string><string>--config</string><string>${config}</string></array><key>RunAtLoad</key><true/></dict></plist>\n` }; fail("Only Linux user-systemd and macOS LaunchAgent service hosts are supported."); }
function freePort(port) { const script = `const n=require('net'),p=Number(process.argv[1]);const s=n.createServer();s.once('error',()=>process.exit(2)).listen(p||0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})`; try { return Number(childProcess.execFileSync(process.execPath, ["-e", script, String(port || 0)], { encoding: "utf8" }).trim()); } catch { fail(port ? "Port is occupied." : "No free loopback port is available."); } }
function integration(binary, env) {
  const run = (args) => childProcess.execFileSync(binary, args, { encoding: "utf8", env, timeout: 10_000 });
  const status = () => {
    const lines = run(["integration", "status"]).split(/\r?\n/).filter((line) => line.startsWith("opencode:"));
    if (lines.length !== 1) fail("Herdr OpenCode integration status must contain exactly one OpenCode line.");
    const value = lines[0].slice("opencode:".length).trim();
    if (/^current(?:\s+\([^\r\n()]+\))*$/.test(value)) return "current";
    if (/^(?:not installed|outdated)(?:\s+\([^\r\n()]+\))*$/.test(value)) return "non-current";
    fail("Herdr OpenCode integration status is malformed.");
  };
  if (status() === "current") return;
  run(["integration", "install", "opencode"]);
  if (status() !== "current") fail("Herdr OpenCode integration did not become current.");
}
function health(endpoint, expected) { const script = `fetch(process.argv[1],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'health'})}).then(async r=>{const b=await r.json();process.exit(r.ok&&b.result?.endpoint===process.argv[2]?0:1)}).catch(()=>process.exit(1))`; childProcess.execFileSync(process.execPath, ["-e", script, endpoint, expected], { stdio: "ignore", timeout: 1_000 }); }
function pause(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function ready(endpoint, expected, timeoutMs = 10_000) { const deadline = Date.now() + timeoutMs; let last; while (Date.now() <= deadline) { try { health(endpoint, expected); return; } catch (error) { last = error; pause(100); } } fail(`Installed ${expected} endpoint did not become healthy before the readiness deadline${last ? "." : ""}`); }
function readyBoth(endpoint) { ready(`${endpoint}/agent-task`, "task"); ready(`${endpoint}/agent-comm`, "comm"); }
function defaultAdapter(platform) { if (platform === "linux") return { restart: () => { childProcess.execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "ignore" }); childProcess.execFileSync("systemctl", ["--user", "restart", "head-coordination.service"], { stdio: "ignore" }); }, stop: () => childProcess.execFileSync("systemctl", ["--user", "stop", "head-coordination.service"], { stdio: "ignore" }) }; if (platform === "darwin") { const domain = `gui/${process.getuid()}`; const target = `${domain}/dev.head.coordination`; return { restart: ({ serviceFile }) => { try { childProcess.execFileSync("launchctl", ["bootout", target], { stdio: "ignore" }); } catch {} childProcess.execFileSync("launchctl", ["bootstrap", domain, serviceFile], { stdio: "ignore" }); childProcess.execFileSync("launchctl", ["kickstart", "-k", target], { stdio: "ignore" }); }, stop: () => { try { childProcess.execFileSync("launchctl", ["bootout", target], { stdio: "ignore" }); } catch {} } }; } fail("Only Linux user-systemd and macOS LaunchAgent service hosts are supported."); }
function snapshot(file) { return exists(file) ? { value: fs.readFileSync(file), mode: fs.statSync(file).mode & 0o777 } : null; }
function restore(file, prior) { if (exists(file) || fs.lstatSync(path.dirname(file)).isDirectory()) { try { fs.unlinkSync(file); } catch {} } if (prior) { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.writeFileSync(file, prior.value, { mode: prior.mode }); } }

export function installHost({ releaseRoot = path.resolve(here, "../../.."), opencode, herdr, socket, port, platform = process.platform, env = process.env, adapter } = {}) {
  releaseRoot = real(releaseRoot); const where = locations(env), release = releaseIdentity(releaseRoot);
  const dataRoot = path.join(where.data, "head"), configRoot = path.join(where.config, "head"), stateRoot = path.join(where.state, "head"), releases = path.join(dataRoot, "releases"), version = path.join(releases, release.identity), current = path.join(dataRoot, "current"), command = path.join(where.bin, "head-host"), config = path.join(configRoot, "host.json"), serviceFile = platform === "linux" ? path.join(where.config, "systemd", "user", "head-coordination.service") : platform === "darwin" ? path.join(env.HOME || os.homedir(), "Library", "LaunchAgents", "dev.head.coordination.plist") : fail("Only Linux user-systemd and macOS LaunchAgent service hosts are supported.");
  // This entire block is deliberately mutation-free.
  [dataRoot, configRoot, stateRoot, where.bin, serviceFile].forEach(assertSafeDestination);
  const opencodePath = discover("opencode", opencode, env), herdrPath = discover("herdr", herdr, env); resolveConfiguredOpenCodeBinary({ executable: opencodePath });
  const socketPath = real(socket || env.HERDR_SOCKET_PATH || fail("A configured Herdr socket is required.")); createRealHerdrCliAdapter({ socketPath, herdrPath });
  const oldConfig = exists(config) ? JSON.parse(fs.readFileSync(config, "utf8")) : null;
  const entry = path.join(current, "packages", "_platform", "project-init", "head.mjs"), descriptor = service(platform, config, command), serviceAdapter = adapter || defaultAdapter(platform);
  if (oldConfig?.release === release.identity && exists(current) && real(current) === version && exists(command) && fs.readFileSync(command, "utf8") === `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(entry)} "$@"\n` && exists(serviceFile) && fs.readFileSync(serviceFile, "utf8") === descriptor.file) {
    let healthy = true;
    try { readyBoth(oldConfig.endpoint); } catch { healthy = false; }
    if (healthy) {
      integration(herdrPath, { ...env, HERDR_SOCKET_PATH: socketPath });
      return { status: "installed", release: release.identity, current, command, config, serviceFile, endpoint: oldConfig.endpoint, converged: true };
    }
  }
  const requestedPort = port ?? (oldConfig?.endpoint ? Number(new URL(oldConfig.endpoint).port) : 0);
  let retained = false;
  if (oldConfig && port == null) { try { readyBoth(oldConfig.endpoint); retained = true; } catch {} }
  const selectedPort = retained ? requestedPort : freePort(requestedPort);
  const prior = { current: exists(current) ? real(current) : null, command: snapshot(command), config: snapshot(config), service: snapshot(serviceFile) };
  try {
    fs.mkdirSync(releases, { recursive: true, mode: 0o700 }); if (!exists(version)) { const staging = path.join(releases, `.${release.identity}.${crypto.randomUUID()}`); fs.mkdirSync(staging, { mode: 0o700 }); for (const pkg of release.manifest.packages) for (const selected of pkg.paths) copy(path.join(releaseRoot, selected), path.join(staging, selected)); copy(path.join(releaseRoot, "release-manifest.json"), path.join(staging, "release-manifest.json")); fs.renameSync(staging, version); }
    const installed = { schemaVersion: 1, release: release.identity, releaseRoot: version, opencodePath, herdrPath, socketPath, stateRoot, endpoint: `http://127.0.0.1:${selectedPort}`, service: descriptor.kind };
    if (retained) serviceAdapter.stop?.();
    fs.mkdirSync(path.dirname(current), { recursive: true, mode: 0o700 }); link(version, current); write(command, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(entry)} "$@"\n`, 0o700); write(config, installed); write(serviceFile, descriptor.file); integration(herdrPath, { ...env, HERDR_SOCKET_PATH: socketPath }); serviceAdapter.restart({ serviceFile, config, command, platform }); readyBoth(installed.endpoint);
    return { status: "installed", release: release.identity, current, command, config, serviceFile, endpoint: installed.endpoint };
  } catch (error) {
    try { serviceAdapter.stop?.(); } catch {} if (exists(current)) fs.unlinkSync(current); if (prior.current) link(prior.current, current); restore(command, prior.command); restore(config, prior.config); restore(serviceFile, prior.service); if (prior.current) { serviceAdapter.restart({ serviceFile, config, command, platform }); const restored = JSON.parse(fs.readFileSync(config, "utf8")); readyBoth(restored.endpoint); }
    return { status: "rolled_back", release: release.identity, previousRelease: prior.current ? path.basename(prior.current) : "", error: error.message };
  }
}
