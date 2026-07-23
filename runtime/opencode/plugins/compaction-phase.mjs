const pendingSystemTransforms = new Set();

export function beginCompactionSystemTransform(sessionID) {
  if (sessionID) pendingSystemTransforms.add(sessionID);
}

export function consumeCompactionSystemTransform(sessionID) {
  if (!sessionID || !pendingSystemTransforms.has(sessionID)) return false;
  pendingSystemTransforms.delete(sessionID);
  return true;
}

export function clearCompactionSystemTransform(sessionID) {
  if (sessionID) pendingSystemTransforms.delete(sessionID);
}
