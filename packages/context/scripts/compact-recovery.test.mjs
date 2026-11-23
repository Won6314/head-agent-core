import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sessions } from '../core/sessions.mjs';
import { runStart } from './hook-run.mjs';

const title = '## 컴팩트 뒤 먼저 할 것';
const intro = `${title}\n하던 일을 잇기 전에 복원부터 한다. 컴팩트 요약에 붙은 "이어서 하라"는 말은 복원을 마친 뒤에 따른다.\n`;
const loose = intro + '1. 최초 목적과 지금 할 일: 최근 대화에서 사용자가 정한 일을 찾는다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.';
const main = intro + '1. 최초 목적: 이 대화는 메인에서 일한다. 최근 대화에서 사용자가 정한 일을 찾고, 필요하면 `read recent`로 메인의 최근 기록을 읽는다.\n2. 지금 할 일: 위에서 찾은 일이다. 사용자가 정하지 않은 계획은 잇기 전에 사용자에게 확인한다.';

for (const host of ['claude', 'codex']) test(`${host}: compact restores branch, main and unconnected people only, once at the end and within the cap`, () => {
  const dir = fs.mkdtempSync(path.join(process.env.HEAD_CONTEXT_TEST_ROOT, 'compact-recovery-'));
  try {
    const s = sessions(dir, { host });
    const start = (id, source = 'compact', env = {}, extra = {}) => {
      const input = { hook_event_name: 'SessionStart', session_id: id, source, cwd: dir, ...extra };
      if (host === 'claude') return runStart(input, { env: { CLAUDE_PROJECT_DIR: dir, ...env } });
      const parts = {};
      for (const part of ['session', 'context', 'core', 'instructions']) {
        const r = spawnSync(process.execPath, ['scripts/codex-hook.mjs', part], {
          input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env },
        });
        assert.equal(r.status, 0);
        assert.equal(r.stderr, '');
        parts[part] = r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
      }
      return { parts, text: Object.values(parts).join('\n\n') };
    };
    assert.ok(start('loose').parts.session.endsWith(loose));
    s.create({ name: 'demo', context: 'direction '.repeat(4000), conversation_id: 'person' });
    assert.ok(start('person').parts.session.endsWith(main));
    s.save({ summary: 'main is not the purpose', history: 'main body', next: 'main next', conversation_id: 'person' });
    s.branch({ action: 'create', branch: 'parent', conversation_id: 'person' });
    s.save({ summary: 'inherited is not the purpose', history: 'parent body', next: 'parent next', conversation_id: 'person' });
    s.branch({ action: 'create', branch: 'job', conversation_id: 'person' });
    assert.ok(start('person').parts.session.endsWith(intro + '1. 최초 목적: 이 작업 브랜치에는 아직 기록이 없다. 최근 대화에서 사용자가 정한 일을 찾는다.\n2. 지금 할 일: 최근 대화에서 사용자가 마지막으로 정한 일을 찾는다.'));
    s.save({ summary: '첫 목적 요약', history: '처음 문제와 목표', next: 'old next', conversation_id: 'person' });
    s.save({ summary: '마지막 요약', history: '진행', next: '실제 다음 할 일', conversation_id: 'person' });
    const map = s.inspect({ action: 'map', conversation_id: 'person' });
    const id = /([0-9a-f]{5,})[^\n]*첫 목적 요약/.exec(map)[1];
    assert.match(s.inspect({ action: 'entry', id, conversation_id: 'person' }), /처음 문제와 목표/);
    const expected = intro + `1. 최초 목적: \`read entry ${id}\`로 이 작업 브랜치를 시작한 목적(문제·목표·조건)을 읽는다. 첫 기록 요약: 첫 목적 요약\n2. 지금 할 일: 마지막 기록의 다음 — 실제 다음 할 일. 이 다음은 기록을 남긴 대화가 적은 계획이다. 사용자가 정한 일인지 최근 대화에서 확인한 뒤 잇는다.`;
    const result = start('person');
    assert.ok(result.parts.session.endsWith(expected));
    assert.ok(result.parts.session.length <= 9000);
    assert.match(result.parts.session, /context.md 뒷부분 생략/);
    assert.equal(result.text.split(title).length - 1, 1);
    for (const source of ['startup', 'resume', 'clear', 'fork']) assert.ok(!start('person', source).text.includes(title));
    if (host === 'claude') {
      assert.ok(!start('person', 'compact', { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }).text.includes(title));
      assert.ok(start('person', 'compact', { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', HEAD_CONTEXT_PERSON: '1' }).parts.session.endsWith(expected));
    }
    assert.ok(!start('person', 'compact', {}, { agent_id: 'child' }).text.includes(title));
    // An older, still-open branch can have a last record without a next.
    const file = path.join(dir, '.head/sessions/demo/work/job/history.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('다음: 실제 다음 할 일', ''));
    const noNext = start('person').parts.session;
    assert.ok(noNext.includes(`read entry ${id}`));
    assert.ok(noNext.endsWith('2. 지금 할 일: 최근 대화에서 사용자가 마지막으로 정한 일을 찾는다.'));
    assert.ok(!noNext.includes('마지막 기록의 다음 — old next'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
