import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLinuxOpenCodeListeners } from "./opencode-sessions.mjs";
import { readSavedHeads, registerSavedHead, requireSavedHead } from "./saved-head-registry.mjs";
import { superviseHeadMigration } from "./head-migration.mjs";

test("listener discovery binds loopback OpenCode ports to their exact process", () => {
  const value = parseLinuxOpenCodeListeners([
    'LISTEN 0 512 127.0.0.1:41001 0.0.0.0:* users:(("opencode",pid=111,fd=22))',
    'LISTEN 0 512 127.0.0.1:41002 0.0.0.0:* users:(("opencode",pid=222,fd=22))',
    'LISTEN 0 512 0.0.0.0:9999 0.0.0.0:* users:(("other",pid=333,fd=1))',
  ].join("\n"));
  assert.deepEqual(value, [{ origin: "http://127.0.0.1:41001", pid: 111 }, { origin: "http://127.0.0.1:41002", pid: 222 }]);
});

test("Core saved HEAD registry is private and immutable by name", () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "core-saved-head-"));
  fs.chmodSync(stateRoot, 0o700);
  const file = path.join(stateRoot, "projects", "proof", "agent-task", "saved-heads", "heads.json");
  const saved = registerSavedHead({ file, stateRoot, name: "accepted", sessionId: "ses_saved1", source: "problem" });
  assert.equal(saved.name, "accepted");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(requireSavedHead({ file, stateRoot, name: "accepted" }), "ses_saved1");
  assert.throws(() => registerSavedHead({ file, stateRoot, name: "accepted", sessionId: "ses_saved2" }), /already exists/);
  fs.writeFileSync(file, `${JSON.stringify({ legacy: "ses_legacy1" })}\n`, { mode: 0o600 });
  assert.throws(() => readSavedHeads(file, stateRoot), /invalid record/);
});

test("same-pane migration starts the saved child before sending its activation command", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-head-migration-")), file = path.join(root, "migration.json");
  fs.writeFileSync(file, JSON.stringify({ schema: 1, id: "migration-proof", status: "armed", command: "Activate Runner", pane: { socket: "socket", paneId: "pane" }, private: { parentSessionId: "ses_parent", childSessionId: "ses_child" } }));
  let started = false;
  const calls = [];
  const runtime = {
    invoke: (_socket, argv) => {
      calls.push(argv);
      if (argv[0] === "pane" && argv[1] === "process-info") return { process_info: { foreground_processes: [{ argv: started ? ["/usr/bin/opencode", "-s", "ses_child"] : ["/bin/bash"], cmdline: started ? "/usr/bin/opencode -s ses_child" : "/bin/bash" }] } };
      if (argv[0] === "pane" && argv[1] === "get") return { pane: started ? { agent: "opencode" } : { agent_status: "unknown" } };
      if (argv[0] === "agent" && argv[1] === "start") started = true;
      return {};
    },
    invokeVoid: (_socket, argv) => calls.push(argv),
  };
  await superviseHeadMigration(file, { runtime });
  assert.equal(JSON.parse(fs.readFileSync(file)).status, "committed");
  const start = calls.findIndex((argv) => argv[0] === "agent" && argv[1] === "start"), prompt = calls.findIndex((argv) => argv[0] === "agent" && argv[1] === "prompt");
  assert.ok(start >= 0 && prompt > start);
  assert.ok(calls.some((argv) => argv.join(" ") === "agent start migration-proof --kind opencode --pane pane -- -s ses_child"));
});
