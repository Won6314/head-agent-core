/**
 * Runnable non-active MCP candidate adapter.  It has no project root, PATHS,
 * legacy imports, or fallback handlers: every lifecycle call crosses the
 * shared HostAgentTaskService boundary.
 */
export function createCandidateHandler(service) {
  if (!service || !["create", "interrupt", "complete", "continue", "reconcile"].every((name) => typeof service[name] === "function")) throw new TypeError("A HostAgentTaskService is required.");
  return async function handleToolCall(name, args = {}, request) {
    if (name === "quick_task") return service.create(request, { taskId: args.task_id, agent: args.agent, command: args.command, runtime: args.runtime, model: args.model, reviewMode: args.review_mode });
    if (name === "quick_task_control") {
      if (args.action === "interrupt") return service.interrupt(request, args.task_id);
      if (args.action === "continue") return service.continue(request, args.task_id, { taskId: args.new_task_id, command: args.command, strategy: args.strategy });
      if (args.action === "complete") return service.complete(request, args.task_id, { status: args.status });
    }
    if (name === "quick_task_reconcile") return service.reconcile(request);
    throw new Error(`Unknown candidate tool: ${name}`);
  };
}
