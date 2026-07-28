import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bootstrapOnboardingSession } from "../packages/opencode-runtime/runtime/opencode/bin/bootstrap-onboarding-session.mjs";
import { projectSessionRecovery } from "../packages/opencode-runtime/runtime/opencode/bin/session-lifecycle.mjs";
import HeadCoreFirstPlugin from "../packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs";
import { releaseIdentity } from "../packages/project-init/host-installer.mjs";

const repository = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-bootstrap-"));
  const head = path.join(root, ".claude", "agents", "head");
  fs.mkdirSync(path.join(head, "sessions"), { recursive: true });
  return { root, head };
}

test("packaged Core-first plugin preserves other system entries", async () => {
  const plugin = await HeadCoreFirstPlugin();
  const headCore = "Instructions from: /installed/HEAD_CORE.md\n# HEAD Principles\nCore";
  const output = { system: ["project", headCore, "context"] };
  await plugin["experimental.chat.system.transform"]({}, output);
  assert.deepEqual(output.system, [headCore, "project", "context"]);
});

test("base release selects the packaged runtime and recovery Skill without browser-query", () => {
  const release = releaseIdentity(repository);
  assert.ok(release.files.includes("packages/opencode-runtime/runtime/opencode/plugins/head-core-first.mjs"));
  assert.ok(release.files.includes("packages/opencode-runtime/runtime/opencode/bin/bootstrap-onboarding-session.mjs"));
  assert.ok(release.files.includes("packages/skills/restore-session/SKILL.md"));
  assert.equal(release.files.some((file) => file.startsWith("packages/skills/browser-query/")), false);
});

test("bootstrap publishes exactly the Session context and state and recovery reads Session mode", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const session = bootstrapOnboardingSession({ headDirectory: value.head, name: "onboarding", context: "# Initial context\n" });
  assert.deepEqual(fs.readdirSync(session).sort(), ["context.md", "session-state.json"]);
  assert.equal(fs.readFileSync(path.join(session, "context.md"), "utf8"), "# Initial context\n");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(session, "session-state.json"), "utf8")), { schema: 1, generation: 0, mode: "session", activeRun: null });
  assert.equal(projectSessionRecovery({ headDirectory: value.head, liveSessionName: "onboarding" }).metadata.mode, "session");
});

test("bootstrap rejects collision, unsafe paths, and incomplete input without publication", (t) => {
  const value = fixture();
  t.after(() => fs.rmSync(value.root, { recursive: true, force: true }));
  const session = bootstrapOnboardingSession({ headDirectory: value.head, name: "onboarding", context: "context" });
  const before = fs.readdirSync(session).sort();
  assert.throws(() => bootstrapOnboardingSession({ headDirectory: value.head, name: "onboarding", context: "new context" }));
  assert.deepEqual(fs.readdirSync(session).sort(), before);
  assert.throws(() => bootstrapOnboardingSession({ headDirectory: value.head, name: "incomplete", context: "" }));
  assert.equal(fs.existsSync(path.join(value.head, "sessions", "incomplete")), false);
  fs.symlinkSync(path.join(value.root, "missing"), path.join(value.head, "sessions", "linked"));
  assert.throws(() => bootstrapOnboardingSession({ headDirectory: value.head, name: "linked", context: "context" }));
  const unsafeRoot = path.join(value.root, "outside");
  fs.mkdirSync(unsafeRoot);
  fs.rmSync(path.join(value.head, "sessions"), { recursive: true });
  fs.symlinkSync(unsafeRoot, path.join(value.head, "sessions"));
  assert.throws(() => bootstrapOnboardingSession({ headDirectory: value.head, name: "unsafe", context: "context" }));
  assert.equal(fs.existsSync(path.join(unsafeRoot, "unsafe")), false);
});
