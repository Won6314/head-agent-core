// Compaction instruction (PreCompact): the host's own summary would stand in for what
// the start hooks put back after the compact (the work session, the work context and the
// recent exchanges as said). It is turned into one pointer line instead. The hook's
// standard output is added to the compaction prompt as custom instructions.
const POINTER = '이전 대화는 요약하지 않는다. 압축 직전의 최근 대화(원문)와 작업 세션·작업 맥락은 이 메시지 뒤의 자동 컨텍스트에 있고, 전체 기록은 대화 기록 파일에 있다.';
export function compactInstruction() {
  return [
    'OVERRIDE FOR THIS SUMMARY: do not produce the numbered sections described above.',
    'Inside <summary> write exactly this one line and nothing else:',
    POINTER,
    'Keep <analysis> to one line.',
    'Do not repeat or paraphrase the conversation (the recent exchanges are attached verbatim after this summary).',
    'Do not write next steps, pending tasks, recommendations, or any instruction about how to continue.',
  ].join('\n');
}
