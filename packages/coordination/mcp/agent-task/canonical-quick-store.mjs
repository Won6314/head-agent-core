import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const CANONICAL_QUICK_TERMINAL = new Set([
  "completed", "output_failed", "launch_failed", "wait_failed", "read_failed", "delivery_failed", "cleanup_failed",
]);

export function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function atomicWrite(file, value, { filesystem = fs } = {}) {
  filesystem.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  filesystem.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  filesystem.renameSync(temporary, file);
}

export class CanonicalQuickStore {
  constructor({ stateRoot, filesystem = fs, clock = () => new Date().toISOString() } = {}) {
    if (typeof stateRoot !== "string" || !path.isAbsolute(stateRoot)) throw new TypeError("A host state root is required.");
    this.filesystem = filesystem;
    this.clock = clock;
    this.stateRoot = path.resolve(stateRoot);
    this.taskRoot = path.join(this.stateRoot, "quick-tasks");
    this.logRoot = path.join(this.taskRoot, "logs");
    this.handoffRoot = path.join(this.taskRoot, "handoffs");
  }

  paths(taskId) {
    if (!TASK_ID.test(String(taskId))) throw new TypeError("A canonical task ID is required.");
    const paths = {
      stateFile: path.join(this.taskRoot, `${taskId}.json`),
      logFile: path.join(this.logRoot, `${taskId}.log`),
      handoffFile: path.join(this.handoffRoot, `${taskId}.md`),
    };
    if (!Object.values(paths).every((file) => contained(this.stateRoot, file))) throw new TypeError("Canonical task paths must remain contained.");
    return paths;
  }

  reserve(task) {
    const paths = this.paths(task.taskId);
    this.filesystem.mkdirSync(this.taskRoot, { recursive: true, mode: 0o700 });
    this.filesystem.mkdirSync(this.logRoot, { recursive: true, mode: 0o700 });
    this.filesystem.mkdirSync(this.handoffRoot, { recursive: true, mode: 0o700 });
    this.filesystem.writeFileSync(paths.stateFile, "", { flag: "wx", mode: 0o600 });
    atomicWrite(paths.stateFile, { ...task, ...paths, stateRoot: this.stateRoot, updatedAt: this.clock() }, { filesystem: this.filesystem });
    return this.load(paths.stateFile);
  }

  load(stateFile) {
    if (!contained(this.stateRoot, stateFile)) throw new TypeError("State file escapes the host state root.");
    return JSON.parse(this.filesystem.readFileSync(stateFile, "utf8"));
  }

  save(task) {
    if (!task?.stateFile || !contained(this.stateRoot, task.stateFile)) throw new TypeError("State file escapes the host state root.");
    atomicWrite(task.stateFile, { ...task, updatedAt: this.clock() }, { filesystem: this.filesystem });
    return this.load(task.stateFile);
  }

  handoff(task) {
    if (!contained(this.handoffRoot, task.handoffFile)) return { ok: false, status: "output_failed", error: "Handoff path escapes its reserved root." };
    try {
      const entry = this.filesystem.lstatSync(task.handoffFile);
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size < 1) return { ok: false, status: "output_failed", error: "Handoff is not a nonempty direct regular file." };
      const value = this.filesystem.readFileSync(task.handoffFile, "utf8");
      if (!value.trim()) return { ok: false, status: "output_failed", error: "Handoff is empty." };
      return { ok: true, path: task.handoffFile, bytes: entry.size, value };
    } catch (error) {
      return { ok: false, status: "output_failed", error: error.message || String(error) };
    }
  }
}
