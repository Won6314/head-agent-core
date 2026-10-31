import './test-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from './history.mjs';

test('legacy summary fallback preserves identifiers, Markdown headings and cursor', () => {
  const parse = (body) => parseHistory(`## 2026-10-11T00:00:00.000Z work:A\n\n${body}\n\n다음: later`)[0];
  assert.equal(
    parse('# **demo_image**와 _context_run_, __my_project_dir__, a-b.v1').summary,
    'demo_image와 context_run, my_project_dir, a-b.v1',
  );
  assert.equal(parse('---\n\n###\n\n- **context_run** 결과').summary, 'context_run 결과');
  assert.equal(parse('---\n\n***').summary, '(요약 없음)');
  assert.equal(parse('## 2026-09-29 HM-30 X 픽셀 rg283 교체\n\n본문').summary, '2026-09-29 HM-30 X 픽셀 rg283 교체');
  assert.equal(parse('body').next, 'later');
  const legacy = parseHistory('## 2020-01-01 run:old\n\nold body\n다음: next');
  assert.equal(legacy[0].summary, 'old body');
});
