import './test-env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN = [
  { name: 'posix-home', pattern: new RegExp('/' + 'ho' + 'me/') },
  { name: 'darwin-users', pattern: new RegExp('/' + 'Us' + 'ers/') },
  {
    name: 'product',
    pattern: new RegExp('noah' + 'chat|Noah' + 'Chat|him' + 'itsu|Him' + 'itsu|노아' + '챗|proj_' + 'chatbot_mvp'),
  },
  { name: 'project-session', pattern: new RegExp('\\.claude/agents/head/ses' + 'sions/') },
];

// file:reason — empty is the goal. Herdr is a host adapter and is allowed.
const ALLOWED = {};

function walk(directory, files = []) {
  for (const name of fs.readdirSync(directory).sort()) {
    if (name === 'node_modules' || name === '.git' || name === '.head') continue;
    const full = path.join(directory, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (stat.isFile()) files.push(full);
  }
  return files;
}

function isText(buffer) {
  return !buffer.includes(0);
}

test('plugin tree has no absolute paths, product names, or project session paths', () => {
  const hits = [];
  for (const file of walk(repoRoot)) {
    const relative = path.relative(repoRoot, file);
    if (ALLOWED[relative]) continue;
    const buffer = fs.readFileSync(file);
    if (!isText(buffer)) continue;
    const lines = buffer.toString('utf8').split(/\n/);
    lines.forEach((line, index) => {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(line)) hits.push(`${relative}:${index + 1}:${rule.name}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});
