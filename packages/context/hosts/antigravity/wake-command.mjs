import path from 'node:path';
// The one registration command line. The PreInvocation hook shows it and the PreToolUse
// hook auto-approves exactly this string, so both must build it here.
export const safeRoot = (root) =>
  typeof root === 'string' && path.isAbsolute(root) && !/["$`\\\r\n]/.test(root);
export const registerCommand = (root) =>
  `node "${path.join(root, 'scripts', 'antigravity-wake-register.mjs')}"`;
