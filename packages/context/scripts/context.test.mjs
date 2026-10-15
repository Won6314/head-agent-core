import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistory} from './history.mjs';
import {workStatus} from './board.mjs';

test('legacy summary fallback preserves identifiers, Markdown headings and cursor',()=>{
  const parse=body=>parseHistory(`## 2026-10-11T00:00:00.000Z work:A\n\n${body}\n\n다음: later`)[0];
  assert.equal(parse('# **charchat_image**와 _context_run_, __proj_chatbot_mvp__, a-b.v1').summary,'charchat_image와 context_run, proj_chatbot_mvp, a-b.v1');
  assert.equal(parse('---\n\n###\n\n- **context_run** 결과').summary,'context_run 결과');
  assert.equal(parse('---\n\n***').summary,'(요약 없음)');
  assert.equal(parse('## 2026-09-29 HM-30 X 픽셀 rg283 교체\n\n본문').summary,'2026-09-29 HM-30 X 픽셀 rg283 교체');
  assert.equal(parse('body').next,'later');
  const legacy=parseHistory('## 2020-01-01 run:old\n\nold body\n다음: next');assert.equal(legacy[0].summary,'old body');
});
test('attention precedence and ended/dead parents remain unchanged',()=>{
  const c=status=>({conversation_id:'c',status});const children=[{parent_conversation_id:'c',status:'running'}];
  assert.equal(workStatus([c('working')],[],()=>true),'running');assert.equal(workStatus([c('waiting')],children,()=>true),'running');
  assert.equal(workStatus([c('blocked')],children,()=>true),'waiting');assert.equal(workStatus([c('working'),c('waiting')],[],()=>true),'waiting');
  assert.equal(workStatus([c('ended')],children,()=>true),'stopped');assert.equal(workStatus([c('working')],children,()=>false),'stopped');
});
