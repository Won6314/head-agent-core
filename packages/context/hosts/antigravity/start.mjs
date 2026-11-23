import fs from 'node:fs';
import path from 'node:path';
import { locations, recordFile } from '../../core/storage.mjs';

// Client writes after session/new, before the first prompt. Only SessionStart
// consumes it; no model/tool call is needed to choose this conversation's work.
export function takeStart(project, id) {
  const now = Date.now();
  const state = locations(project).state;
  const file = recordFile(state, 'start', id, 'antigravity');
  const dir = path.dirname(file);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  for (const name of entries) {
    if (!name.isFile() || !/^antigravity-[A-Za-z0-9_-]+\.json$/.test(name.name)) continue;
    const old = path.join(dir, name.name);
    try {
      if (now - fs.statSync(old).mtimeMs > 86400000) fs.unlinkSync(old);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  // A consumed request (including a bad one or one overridden by the env) must
  // not unexpectedly attach a later start. Errors go to the hook's one-line notice.
  fs.unlinkSync(file);
  if (process.env.HEAD_CONTEXT_SESSION) return null;
  const value = JSON.parse(text);
  if (!value || typeof value.session !== 'string' || !value.session.trim())
    throw new Error('시작 파일의 session은 비어 있지 않은 작업 세션 이름이어야 합니다.');
  if (value.branch !== undefined && (typeof value.branch !== 'string' || !value.branch.trim()))
    throw new Error('시작 파일의 branch는 비어 있지 않은 작업 브랜치 이름이어야 합니다.');
  return value;
}
