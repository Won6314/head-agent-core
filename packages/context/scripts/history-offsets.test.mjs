import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistory } from '../core/history.mjs';

// Frozen original implementation: prefix byte counts are the reference.
function summaryLine(line) {
  let text = line.replace(/^(?:#{1,6}(?:\s+|$)|>\s*|[-+*](?:\s+|$)|\d+[.)]\s+)/, '').trim();
  // Strip emphasis wrappers, not punctuation inside identifiers (context_run, a-b.v1).
  text = text
    .replace(/(\*{1,3})(?=\S)(.+?\S|\S)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)(.+?\S|\S)\1(?![\p{L}\p{N}_])/gu, '$2');
  if (/^[-*_`~#\s]+$/.test(text)) return '';
  return text;
}
function referenceParseHistory(text) {
  // Date-only descriptive headings inside a checkpoint are Markdown body, not records.
  const matches = [
    ...text.matchAll(
      /^##[ \t]+\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})[^\n]*|(?:[ \t]+(?:work:|run:)[^\n]*)?[ \t]*\r?$)/gm,
    ),
  ];
  return matches.map((m, i) => {
    const body = text.slice(m.index, matches[i + 1]?.index ?? text.length).trimEnd();
    const tokens = m[0]
      .replace(/^##\s+/, '')
      .trim()
      .split(/\s+/);
    const lines = body
      .slice(m[0].length)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const explicit = lines
      .find((l) => l.startsWith('요약:'))
      ?.slice(3)
      .trim();
    const fallback = lines
      .filter((l) => !/^(다음:|상태:|기록:|브랜치:|이유:|이름표:|참조파일:)/.test(l))
      .map(summaryLine)
      .find(Boolean);
    const summary =
      explicit ||
      Array.from(fallback || '(요약 없음)')
        .slice(0, 80)
        .join('');
    // A main-line index entry: one line naming the branch label and the file the body is in.
    const index = lines.map((l) => /^이름표: (.*) · 본문: (\S+)$/.exec(l)).find(Boolean);
    return {
      conversation: '',
      timestamp: tokens[0],
      label: index?.[1] || '',
      source: index?.[2] || '',
      explicit_summary: explicit || null,
      work: tokens.find((t) => t.startsWith('work:'))?.slice(5) || '',
      summary,
      status:
        lines
          .find((l) => l.startsWith('상태:'))
          ?.slice(3)
          .trim() || '열림',
      branch:
        lines
          .find((l) => l.startsWith('브랜치:'))
          ?.slice(4)
          .trim() || '',
      record:
        lines
          .find((l) => l.startsWith('기록:'))
          ?.slice(3)
          .trim() || '',
      reason:
        lines
          .find((l) => l.startsWith('이유:'))
          ?.slice(3)
          .trim() || '',
      ended: ['상태: 끝남', '상태: 멈춤', '상태: 중단'].some((l) => lines.includes(l)),
      next: lines.at(-1)?.startsWith('다음:') ? lines.at(-1).slice(3).trim() : '',
      body,
      start: Buffer.byteLength(text.slice(0, m.index)),
      end: Buffer.byteLength(text.slice(0, m.index + body.length)),
    };
  });
}

const stamp = '2026-11-15T12:00:00.000Z';
const cases = [
  [
    'mixed Korean and English records',
    `머리말 preamble\n\n## ${stamp} work:구현\n요약: 한글 English\n상태: 끝남\n브랜치: 작업\n기록: 저장\n이유: 확인\n다음: next\n\n## 2026-11-15T13:00:00+09:00 work:review\n이름표: 검토 · 본문: work/review/history.md\n**본문 fallback**\n\n`,
  ],
  [
    'surrogate pairs at body ends and immediately before heading lines',
    `머리말😀\n## ${stamp}\n본문 끝😀\n## 2026-11-15T13:00:00Z\n🚀 second body 🧑‍💻\t \n\n## 2026-11-15T14:00:00Z\n마지막🎉`,
  ],
  ['CRLF records', `소개\r\n## ${stamp} work:줄바꿈\r\n요약: 확인😀\r\n\r\n## 2026-11-16\r\nEnglish 한글\r\n\t\r\n`],
  ['zero records, empty', ''],
  ['zero records, text only', '한글 English 😀\n## 제목\n일반 본문\n'],
  ['one record', `소개\n## ${stamp}\n본문 하나😀\n\n`],
  ['duplicate timestamps', `## ${stamp} work:첫째\n첫 본문\n\n## ${stamp} work:둘째\n요약: second\n둘 본문😀\n`],
  ['descriptive date heading within body', `## ${stamp}\n첫 본문\n## 2026-11-15 회의 메모\n날짜 설명 본문😀\n`],
  ['bare date heading', `## ${stamp}\n첫 본문\n## 2026-11-15\n날짜 기록 본문😀\n`],
];

for (const [name, text] of cases) {
  test(`parseHistory matches original prefix offsets and all fields: ${name}`, () => {
    assert.deepEqual(parseHistory(text), referenceParseHistory(text));
  });
}
