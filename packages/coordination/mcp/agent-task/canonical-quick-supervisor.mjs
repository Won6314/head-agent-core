import { CANONICAL_QUICK_TERMINAL } from "./canonical-quick-store.mjs";

const keys = ["socket", "workspaceId", "tabId", "paneId", "terminalId"];
const exact = (left, right) => keys.every((key) => left?.[key] === right?.[key]);

export async function superviseCanonicalQuick(lifecycle, stateFile) {
  let task = lifecycle.store.load(stateFile);
  // A restart after durable terminalization must finish a previously delivered
  // cleanup claim, but never repeat an already claimed delivery.
  if (task.status === "completed") {
    const handoff = lifecycle.store.handoff(task);
    return handoff.ok
      ? deliverAndClose(lifecycle, task, handoff.value)
      : lifecycle.terminal(task, "output_failed", { handoff });
  }
  if (CANONICAL_QUICK_TERMINAL.has(task.status)) return task;
  if (task.status !== "running") return task;
  try {
    const done = await lifecycle.effects.wait({ task, provenance: task.provenance, context: lifecycle.context });
    if (!exact(done, task.provenance)) return lifecycle.terminal(task, "wait_failed", { waitError: "Completion evidence did not match the owned worker." });
  } catch (error) {
    return lifecycle.terminal(task, "wait_failed", { waitError: error.message || String(error) });
  }
  try {
    const diagnostic = await lifecycle.effects.read({ task, provenance: task.provenance, context: lifecycle.context });
    lifecycle.store.filesystem.writeFileSync(task.logFile, String(diagnostic), { mode: 0o600, flag: "w" });
  } catch (error) {
    return lifecycle.terminal(task, "read_failed", { readError: error.message || String(error) });
  }
  const handoff = lifecycle.store.handoff(task);
  if (!handoff.ok) return lifecycle.terminal(task, "output_failed", { handoff });
  task = lifecycle.terminal(task, "completed", { handoff: { path: handoff.path, bytes: handoff.bytes }, notification: { state: "pending" } });
  return deliverAndClose(lifecycle, task, handoff.value);
}

async function deliverAndClose(lifecycle, task, handoff) {
  if (task.notification?.state === "pending") {
    task = lifecycle.store.save({ ...task, notification: { state: "started", startedAt: lifecycle.store.clock() } });
    try {
      const delivered = await lifecycle.effects.notify({ task, caller: lifecycle.context.caller, handoff, context: lifecycle.context });
      if (delivered !== true) return lifecycle.terminal(task, "delivery_failed", { notification: { state: "failed" } });
      task = lifecycle.store.save({ ...task, notification: { state: "delivered", deliveredAt: lifecycle.store.clock() } });
    } catch (error) {
      return lifecycle.terminal(task, "delivery_failed", { notification: { state: "failed", error: error.message || String(error) } });
    }
  }
  if (task.notification?.state === "started") return lifecycle.terminal(task, "delivery_failed", { notification: { state: "failed", error: "Delivery claim was interrupted." } });
  if (task.notification?.state !== "delivered") return task;
  if (task.cleanup?.state === "pending") {
    task = lifecycle.store.save({ ...task, cleanup: { state: "started", startedAt: lifecycle.store.clock() } });
    try {
      const closed = await lifecycle.effects.close({ task, provenance: task.provenance, context: lifecycle.context });
      if (closed !== true) return lifecycle.terminal(task, "cleanup_failed", { cleanup: { state: "failed" } });
      return lifecycle.store.save({ ...task, cleanup: { state: "closed", closedAt: lifecycle.store.clock() } });
    } catch (error) {
      return lifecycle.terminal(task, "cleanup_failed", { cleanup: { state: "failed", error: error.message || String(error) } });
    }
  }
  if (task.cleanup?.state === "started") return lifecycle.terminal(task, "cleanup_failed", { cleanup: { state: "failed", error: "Cleanup claim was interrupted." } });
  return task;
}
