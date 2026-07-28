import assert from "node:assert/strict";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, "../../../..");
const packageRuntime = path.join(repository, "packages", "opencode-runtime", "runtime", "opencode", "herdr-runtime.cjs");
const compatibilityRuntime = path.join(repository, "runtime", "opencode", "herdr-runtime.cjs");
const compatibilityRenderer = path.join(repository, "runtime", "opencode", "bin", "render-runtime-config.mjs");

test("compatibility renderer loads the packaged Herdr runtime and resolves a direct HEAD session", () => {
  assert.equal(fs.realpathSync(compatibilityRuntime), fs.realpathSync(packageRuntime));

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

  const source = `import { detectHerdrLocation } from ${JSON.stringify(pathToFileURL(compatibilityRenderer).href)};\nconst value = detectHerdrLocation(process.env, undefined, ${JSON.stringify(root)});\nprocess.stdout.write(JSON.stringify(value));`;
  const output = childProcess.execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    encoding: "utf8",
    cwd: root,
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
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
