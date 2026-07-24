/** Local-only admin API: intentionally not imported by the MCP transport. */
import { createHostBindingRegistry } from "../agent-task/runtime-context.mjs";
export function createHostAdmin({ hostStateRoot } = {}) {
  const registry = createHostBindingRegistry({ hostStateRoot });
  return Object.freeze({ register: (input) => registry.register(input), rotate: (input) => registry.setAuthorityGeneration(input), inspect: () => [...registry.refresh().byWorkspace.values()].map((binding) => ({ ...binding })) });
}
