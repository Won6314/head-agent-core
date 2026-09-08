/**
 * Runnable non-active MCP candidate adapter.  It has no project root, PATHS,
 * legacy imports, or fallback handlers: every lifecycle call crosses the
 * shared HostAgentTaskService boundary.
 */
export function createCandidateHandler(service) {
  if (!service || typeof service.create !== "function") throw new TypeError("A HostAgentTaskService is required.");
  return async function handleToolCall(name, args = {}, request) {
    if (name === "quick_task") return service.create(request, { taskId: args.task_id, agent: args.agent, command: args.command, runtime: args.runtime, model: args.model, reviewMode: args.review_mode });
    if (name === "save_head") return service.saveHead(request, args);
    if (name === "load_head") return service.loadHead(request, args);
    if (name === "migrate_head") return service.migrateHead(request, args);
    throw new Error(`Unknown candidate tool: ${name}`);
  };
}
