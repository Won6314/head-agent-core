import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sessions } from '../core/sessions.mjs';
import { parseHistory, contentBody } from '../core/history.mjs';
import { callTool } from '../core/mcp.mjs';
// The project sits under the (test) home, so its files have a `~/` form.
const fresh = () => fs.mkdtempSync(path.join(process.env.HOME, 'refs-'));
const setup = () => {
  const dir = fresh(),
    s = sessions(dir),
    folder = path.join(dir, '.head/sessions/demo');
  s.create({ name: 'demo', context: '# demo\n\n방향', conversation_id: 'a' });
  const work = path.join(folder, 'work/2026-11');
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'a.md'), 'a');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'n');
  const tilde = (file) => '~/' + path.relative(process.env.HOME, file).split(path.sep).join('/');
  return { dir, s, folder, work, tilde };
};

test('0.9.7: a main save writes its files as one 참조파일 line of `~/` paths, and find/files follow them', () => {
  const { dir, s, folder, work, tilde } = setup();
  const answer = s.save({
    summary: '참조 있음',
    history: '본문',
    files: [
      path.join(dir, 'notes.md'),
      'work/2026-11/a.md',
      `\`${tilde(path.join(work, 'a.md'))}\``,
      'gone.md',
      'work',
    ],
    conversation_id: 'a',
  });
  const [e] = parseHistory(fs.readFileSync(path.join(folder, 'history.md'), 'utf8'));
  const a = tilde(path.join(work, 'a.md')),
    notes = tilde(path.join(dir, 'notes.md'));
  // Absolute and session-relative both become `~/`; the same file once; what is not a file stays as given.
  assert.match(
    e.body,
    new RegExp(
      `^요약: 참조 있음\\n참조파일: \`${notes}\`, \`${a}\`, \`gone.md\`, \`${tilde(path.join(folder, 'work'))}\`\\n\\n본문$`,
      'm',
    ),
  );
  assert.match(answer, /찾지 못한 경로\(적은 그대로 남김\): gone\.md/);
  assert.match(answer, /폴더\(기록에서 파일 찾기에는 걸리지 않음\): ~\/refs-/);
  // The line stays in what a reader sees, before the body (a shortened body keeps it).
  assert.match(contentBody(e), /^참조파일: /);
  assert.match(s.inspect({ action: 'find', file: path.join(work, 'a.md'), conversation_id: 'a' }), /참조 있음/);
  assert.match(s.inspect({ action: 'find', file: path.join(dir, 'notes.md'), conversation_id: 'a' }), /참조 있음/);
  assert.match(s.inspect({ action: 'find', file: notes, conversation_id: 'a' }), /참조 있음/);
});

test('0.9.7: no files, no line; a body cannot carry the line itself; files must be a list of strings', () => {
  const { s, folder } = setup();
  s.save({ summary: '없음', history: '본문', files: [], conversation_id: 'a' });
  s.save({ summary: '생략', history: '본문', conversation_id: 'a' });
  assert.doesNotMatch(fs.readFileSync(path.join(folder, 'history.md'), 'utf8'), /참조파일:/);
  assert.throws(
    () => s.save({ summary: 'x', history: '참조파일: `~/a`', conversation_id: 'a' }),
    /참조파일은 files로 줍니다/,
  );
  assert.throws(() => s.save({ summary: 'x', history: 'y', files: ['a`b'], conversation_id: 'a' }), /백틱/);
  assert.throws(
    () => callTool(s, 'save', { summary: 'x', history: 'y', files: 'a.md' }, 'a'),
    /유효하지 않은 인자: files/,
  );
  assert.throws(
    () => callTool(s, 'save', { summary: 'x', history: 'y', files: [1] }, 'a'),
    /유효하지 않은 인자: files/,
  );
  assert.match(
    callTool(s, 'save', { summary: 'ok', history: 'y', files: ['work/2026-11/a.md'] }, 'a'),
    /메인에 기록했습니다/,
  );
});

test('0.9.7: a branch save resolves files from its own folder too; the 참조파일 line is not rewritten', () => {
  const { s, folder, work, tilde } = setup();
  s.branch({ action: 'create', branch: 'docs', conversation_id: 'a' });
  s.save({
    summary: 'one',
    history: 'See [a](work/2026-11/a.md).',
    files: ['../../work/2026-11/a.md', 'work/2026-11/a.md'],
    next: 'n',
    conversation_id: 'a',
  });
  const text = fs.readFileSync(path.join(folder, 'work/docs/history.md'), 'utf8');
  const a = tilde(path.join(work, 'a.md'));
  assert.ok(text.includes(`참조파일: \`${a}\`\n`), text);
  assert.match(text, /\[a\]\(\.\.\/\.\.\/work\/2026-11\/a\.md\)/);
  // The main line keeps only its index line.
  assert.doesNotMatch(fs.readFileSync(path.join(folder, 'history.md'), 'utf8'), /참조파일:/);
  assert.equal(
    s.inspect({ action: 'files', branch: 'docs', depth: 1, conversation_id: 'a' }),
    '# 파일: 작업 브랜치 docs (기록 1개)\n- work/2026-11/a.md',
  );
  // Closing with files: the closing save keeps its line, and the branch merges as before.
  const closed = s.save({ summary: '끝', history: '마침', recap: '정리', files: ['nope.md'], conversation_id: 'a' });
  assert.match(closed, /작업 브랜치를 닫아 메인에 합쳤습니다[\s\S]*찾지 못한 경로\(적은 그대로 남김\): nope\.md/);
  assert.match(fs.readFileSync(path.join(folder, 'work/docs/history.md'), 'utf8'), /참조파일: `nope\.md`\n\n마침/);
});
