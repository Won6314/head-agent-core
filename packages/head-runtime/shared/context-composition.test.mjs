import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, "../../..");
const packageRuntime = path.join(repository, "packages", "head-runtime", "shared", "herdr-runtime.cjs");
const packageRenderer = path.join(repository, "packages", "head-runtime", "shared", "context-composition.mjs");

test("packaged renderer loads the packaged Herdr runtime and resolves a direct HEAD session", () => {
  assert.ok(fs.statSync(packageRuntime).isFile());

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-runtime-package-"));
  const head = path.join(root, ".claude", "agents", "head");
  const bin = path.join(root, "bin");
  fs.mkdirSync(path.join(head, "sessions", "maf-research"), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# project\n");
  fs.writeFileSync(path.join(head, "CLAUDE.md"), "# head\n");

  const snapshot = {
    result: {
      snapshot: {
        tabs: [{ workspace_id: "workspace", tab_id: "tab", label: "maf-research" }],
        panes: [{ workspace_id: "workspace", tab_id: "tab", pane_id: "pane", terminal_id: "terminal", cwd: head }],
      },
    },
  };
  const herdr = path.join(bin, "herdr");
  fs.writeFileSync(herdr, `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify(snapshot))});\n`, { mode: 0o700 });

  const source = `import { detectHerdrLocation } from ${JSON.stringify(pathToFileURL(packageRenderer).href)};\nconst value = detectHerdrLocation(process.env, undefined, ${JSON.stringify(root)});\nprocess.stdout.write(JSON.stringify(value));`;
  const output = childProcess.execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    encoding: "utf8",
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
      HERDR_BIN: herdr,
      HERDR_SOCKET_PATH: path.join(root, "herdr.sock"),
      HERDR_WORKSPACE_ID: "workspace",
      HERDR_TAB_ID: "tab",
      HERDR_PANE_ID: "pane",
    },
  });
  const location = JSON.parse(output);
  assert.equal(location.sessionName, "maf-research");
  assert.equal(location.terminalId, "terminal");
});

test("logJsonl rotates the active file at 50MB and keeps one generation", async () => {
  const { logRuntimeEvent, headStateDir } = await import(pathToFileURL(packageRenderer).href);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "head-runtime-logrot-"));
  const head = path.join(root, ".claude", "agents", "head");
  fs.mkdirSync(head, { recursive: true });
  fs.writeFileSync(path.join(root, "CLAUDE.md"), "# project\n");
  fs.writeFileSync(path.join(head, "CLAUDE.md"), "# head\n");
  const logs = path.join(headStateDir(root), "logs");
  fs.mkdirSync(logs, { recursive: true });
  const current = path.join(logs, "rotate-test.jsonl");
  fs.writeFileSync(current, "x".repeat(50 * 1024 * 1024 + 1));
  logRuntimeEvent("rotate-test", { n: 1 }, root);
  const rotated = path.join(logs, "rotate-test.1.jsonl");
  assert.equal(fs.statSync(rotated).size, 50 * 1024 * 1024 + 1);
  const line = fs.readFileSync(current, "utf8").trim();
  assert.match(line, /"n":1/);
});
