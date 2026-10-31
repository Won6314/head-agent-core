function summaryLine(line) {
  let text = line.replace(/^(?:#{1,6}(?:\s+|$)|>\s*|[-+*](?:\s+|$)|\d+[.)]\s+)/, '').trim();
  // Strip emphasis wrappers, not punctuation inside identifiers (context_run, a-b.v1).
  text = text
    .replace(/(\*{1,3})(?=\S)(.+?\S|\S)\1/g, '$2')
    .replace(/(?<![\p{L}\p{N}_])(_{1,3})(?=\S)(.+?\S|\S)\1(?![\p{L}\p{N}_])/gu, '$2');
  if (/^[-*_`~#\s]+$/.test(text)) return '';
  return text;
}
export function parseHistory(text) {
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
      .filter((l) => !/^(다음:|상태:|기록:|브랜치:|이유:|이름표:)/.test(l))
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
export function mapSummary(entry) {
  if (entry.explicit_summary) return { text: entry.explicit_summary, source: 'summary' };
  if (entry.work) return { text: entry.work, source: 'label' };
  return { text: entry.summary, source: 'body' };
}
// The body as a reader needs it: no heading, no summary/marker lines, no trailing cursor.
// Summary lives in the map line, and only the newest entry's cursor is shown by the load.
export function contentBody(entry) {
  const lines = entry.body.split('\n').slice(1);
  if (lines.length && /^다음:/.test(lines.findLast((l) => l.trim())?.trim() || ''))
    lines.splice(
      lines.findLastIndex((l) => l.trim()),
      1,
    );
  return lines
    .filter((l) => !/^(요약|상태|브랜치|기록|이유):/.test(l.trim()))
    .join('\n')
    .trim();
}
