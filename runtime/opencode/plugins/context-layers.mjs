import { buildHeadPrompt, logRuntimeEvent, projectRoot } from "../bin/render-runtime-config.mjs";

export function createContextLayers({ root, buildPrompt = buildHeadPrompt } = {}) {
  const activeRoot = projectRoot(root);
  return { "experimental.chat.system.transform": async (input, output) => {
    const sessionID = input?.sessionID || "";
    if (!sessionID || !Array.isArray(output?.system)) return;
    const payload = buildPrompt({ sessionID, agent: "head", root: activeRoot }).prompt;
    if (!payload.trim()) return;
    output.system.push(payload);
  } };
}
export const ContextLayers = async ({ client, root, directory, worktree } = {}) => {
  const activeRoot = projectRoot(root || directory || worktree);
  logRuntimeEvent("plugin-init", { plugin: "context-layers", directory: directory || "", worktree: worktree || "", rootResolved: Boolean(activeRoot) }, activeRoot);
  return createContextLayers({ client, root: activeRoot });
};
