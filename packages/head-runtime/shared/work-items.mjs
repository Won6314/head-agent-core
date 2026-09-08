#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { latestValidCheckpoint } from "./checkpoint-ledger.mjs";

const PORTFOLIO_PATH = ".claude/agents/head/work-items.json";
const USAGE = "Usage: work-items [--root project-root] open <id> <title> [--source <reference>] | focus <id> <session> | complete | list";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReturnReference(value) {
  return isObject(value)
    && typeof value.session === "string"
    && isObject(value.checkpoint)
    && typeof value.checkpoint.path === "string"
    && typeof value.checkpoint.id === "string";
}

function isItem(value) {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && (value.source === undefined || typeof value.source === "string")
    && ["open", "active", "done"].includes(value.status)
    && (value.returnReference === undefined || isReturnReference(value.returnReference));
}

export function isValidPortfolio(value) {
  return isObject(value)
    && Array.isArray(value.items)
    && value.items.every(isItem)
    && (value.activeFocus === null || typeof value.activeFocus === "string")
    && new Set(value.items.map((item) => item.id)).size === value.items.length
    && value.items.filter((item) => item.status === "active").length === (value.activeFocus === null ? 0 : 1)
    && (value.activeFocus === null || value.items.some((item) => item.id === value.activeFocus && item.status === "active"));
}

function portfolioPath(root) {
  return path.join(root, PORTFOLIO_PATH);
}

export function readPortfolio(root) {
  const target = portfolioPath(root);
  if (!fs.existsSync(target)) return { items: [], activeFocus: null };
  const portfolio = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!isValidPortfolio(portfolio)) throw new Error("work-item portfolio does not satisfy the schema");
  return portfolio;
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

export function writePortfolio(root, portfolio) {
  if (!isValidPortfolio(portfolio)) throw new Error("work-item portfolio does not satisfy the schema");
  const target = portfolioPath(root);
  const directory = path.dirname(target);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  let temporary = "";
  try {
    temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, `${JSON.stringify(portfolio, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
    } finally { fs.closeSync(descriptor); }
    fs.renameSync(temporary, target);
    temporary = "";
    syncDirectory(directory);
  } finally {
    if (temporary) { try { fs.unlinkSync(temporary); } catch {} }
  }
}

function requireValue(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function sessionDirectory(root, session) {
  const sessions = path.resolve(root, ".claude/agents/head/sessions");
  const candidate = path.resolve(sessions, session);
  if (path.relative(sessions, candidate).startsWith("..") || path.isAbsolute(path.relative(sessions, candidate))) {
    throw new Error("session must be within .claude/agents/head/sessions");
  }
  return candidate;
}

export function openItem(root, { id, title, source }) {
  const itemId = requireValue(id, "id");
  const itemTitle = requireValue(title, "title");
  const portfolio = readPortfolio(root);
  if (portfolio.items.some((item) => item.id === itemId)) throw new Error(`work item already exists: ${itemId}`);
  const item = { id: itemId, title: itemTitle, status: "open" };
  if (source !== undefined) item.source = requireValue(source, "source");
  portfolio.items.push(item);
  writePortfolio(root, portfolio);
  return item;
}

export function focusItem(root, { id, session }) {
  const itemId = requireValue(id, "id");
  const sessionName = requireValue(session, "session");
  const portfolio = readPortfolio(root);
  const item = portfolio.items.find((candidate) => candidate.id === itemId);
  if (!item || item.status !== "open") throw new Error(`open work item not found: ${itemId}`);
  if (portfolio.activeFocus !== null) throw new Error(`active focus already exists: ${portfolio.activeFocus}`);
  const checkpoint = latestValidCheckpoint(sessionDirectory(root, sessionName));
  if (!checkpoint) throw new Error(`latest valid checkpoint not found for session: ${sessionName}`);
  item.status = "active";
  item.returnReference = {
    session: sessionName,
    checkpoint: {
      path: path.relative(root, checkpoint.path),
      id: checkpoint.record.id,
    },
  };
  portfolio.activeFocus = item.id;
  writePortfolio(root, portfolio);
  return item;
}

export function completeItem(root) {
  const portfolio = readPortfolio(root);
  const item = portfolio.items.find((candidate) => candidate.id === portfolio.activeFocus && candidate.status === "active");
  if (!item) throw new Error("active focus not found");
  item.status = "done";
  portfolio.activeFocus = null;
  writePortfolio(root, portfolio);
  return { item, returnReference: item.returnReference };
}

export function listItems(root) {
  return readPortfolio(root);
}

function parseArguments(argumentsList) {
  let root = process.env.HEAD_PROJECT_ROOT || process.cwd();
  const args = [...argumentsList];
  if (args[0] === "--root") {
    root = requireValue(args[1], "root");
    args.splice(0, 2);
  }
  return { root: path.resolve(root), command: args.shift(), args };
}

export function run(argumentsList) {
  const { root, command, args } = parseArguments(argumentsList);
  if (command === "open") {
    const [id, title, ...rest] = args;
    let source;
    if (rest.length) {
      if (rest.length !== 2 || rest[0] !== "--source") throw new Error(USAGE);
      source = rest[1];
    }
    return openItem(root, { id, title, source });
  }
  if (command === "focus" && args.length === 2) return focusItem(root, { id: args[0], session: args[1] });
  if (command === "complete" && args.length === 0) return completeItem(root);
  if (command === "list" && args.length === 0) return listItems(root);
  throw new Error(USAGE);
}

const THIS_FILE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  try {
    console.log(JSON.stringify(run(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
