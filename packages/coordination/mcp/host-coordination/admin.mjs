/** Local-only admin API: intentionally not imported by the MCP transport. */
import { createHostBindingRegistry } from "../agent-task/runtime-context.mjs";
export function createHostAdmin({ hostStateRoot } = {}) {
  const registry = createHostBindingRegistry({ hostStateRoot });
  return Object.freeze({ register: (input) => registry.register(input), unregister: (input) => registry.unregister(input), inspect: () => [...registry.refresh().byProjectId.values()].map((registration) => ({ ...registration })) });
}
