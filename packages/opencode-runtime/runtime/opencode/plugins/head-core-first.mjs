const HEAD_CORE_MARKER = "# HEAD Principles";

function instructionWrappers(entry) {
  const wrappers = [];
  const wrapperPattern = /^Instructions from:\s*(.+)$/gm;
  let match;

  while ((match = wrapperPattern.exec(entry)) !== null) {
    wrappers.push({ offset: match.index, source: match[1].trim() });
  }

  return wrappers;
}

function isHeadCoreSource(source) {
  return /(?:^|[\\/])HEAD_CORE\.md$/.test(source);
}

export function moveHeadCoreBlockFirst(entry) {
  if (typeof entry !== "string") return entry;

  const wrappers = instructionWrappers(entry);
  const headIndex = wrappers.findIndex(({ source }) => isHeadCoreSource(source));
  if (headIndex <= 0) return entry;

  const firstOffset = wrappers[0].offset;
  const headOffset = wrappers[headIndex].offset;
  const headEnd = wrappers[headIndex + 1]?.offset ?? entry.length;
  const headBlock = entry.slice(headOffset, headEnd);

  return (
    entry.slice(0, firstOffset) +
    headBlock +
    entry.slice(firstOffset, headOffset) +
    entry.slice(headEnd)
  );
}

function isHeadCoreEntry(entry) {
  if (typeof entry !== "string") return false;
  return entry
    .split("\n")
    .some((line) => line.trimStart().startsWith(HEAD_CORE_MARKER));
}

export function moveHeadCoreFirst(system = []) {
  if (!Array.isArray(system)) return system;

  for (let index = 0; index < system.length; index += 1) {
    system[index] = moveHeadCoreBlockFirst(system[index]);
  }

  const index = system.findIndex(isHeadCoreEntry);
  if (index <= 0) return system;

  const [headCore] = system.splice(index, 1);
  system.unshift(headCore);
  return system;
}

export default async function HeadCoreFirstPlugin() {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      moveHeadCoreFirst(output.system);
    },
  };
}
