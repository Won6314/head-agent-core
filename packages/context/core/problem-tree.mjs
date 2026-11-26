export function normTitle(s) {
  return String(s).trim().replace(/\s+/g, ' ').normalize('NFC');
}
export function emptyTree(rootTitle) {
  return { root: { title: rootTitle, parent: null, children: [] }, current: null, count: 0 };
}
function childOf(state, parent, title) {
  let node = parent.children.find((n) => n.title === title);
  if (!node) {
    node = { title, parent, children: [] };
    parent.children.push(node);
    state.count++;
  }
  return node;
}
function ancestorOf(state, node, title) {
  for (let a = node.parent; a; a = a.parent) if ((a === state.root ? normTitle(a.title) : a.title) === title) return a;
  return null;
}
export function applyRecord(state, problem, relation) {
  const P = problem ? normTitle(problem) : '';
  if (!P) return;
  const R = ['아래', '옆', '위'].includes(relation) ? relation : null;
  const rootN = normTitle(state.root.title),
    cur = state.current;
  if (cur === null) {
    if (P !== rootN) state.current = childOf(state, state.root, P);
  } else if (P !== cur.title) {
    if (R === '아래') state.current = childOf(state, cur, P);
    else if (R === '옆' || R === null) state.current = childOf(state, cur.parent, P);
    else {
      const a = ancestorOf(state, cur, P);
      state.current = a === state.root ? null : a || childOf(state, state.root, P);
    }
  }
}
export function rebuild(entries, rootTitle) {
  const state = emptyTree(rootTitle);
  for (const e of entries) applyRecord(state, e.problem, e.relation);
  return state;
}
export function judge(state, { problem, relation }) {
  const prev = pathOf(state) || '없음';
  const refuse = (message) => {
    throw new Error(`바로 전 문제: ${prev}\n${message}`);
  };
  const badTitle = () => refuse("지금 문제는 한 줄, 120자 이하이고 '›'를 넣을 수 없습니다.");
  if (typeof problem === 'string' && /[\r\n]/.test(problem)) badTitle();
  const P = typeof problem === 'string' ? normTitle(problem) : '',
    R = relation;
  const rootN = normTitle(state.root.title),
    cur = state.current;
  if (P !== '') {
    const exempt = P === rootN && (cur === null || (R === '위' && P !== cur.title));
    if (!exempt && (Array.from(P).length > 120 || P.includes('›'))) badTitle();
  }
  if (cur === null) return P === '' || P === rootN ? {} : { problem: P };
  if (P === '')
    refuse(
      '이 작업 브랜치에는 지금 문제가 있습니다. 같은 문제면 바로 전 문제를 그대로 problem에 적고, 바뀌었으면 새 문제와 relation(아래·옆·위)을 적어 다시 저장하세요.',
    );
  if (P === cur.title) return { problem: P };
  if (R === undefined)
    refuse(
      '지금 문제가 바로 전 문제와 다릅니다. 같은 문제면 바로 전 문제를 그대로 적고, 바뀌었으면 relation(아래·옆·위)을 함께 적어 다시 저장하세요. 아래: 바로 전 문제를 풀려다 생긴 문제 / 옆: 같은 위 문제의 다른 문제 / 위: 바로 전 문제의 위 문제 중 하나로 돌아감(problem에 그 위 문제의 글자).',
    );
  if (R === '위' && ancestorOf(state, cur, P) === null)
    refuse(
      `'${P}'는 바로 전 문제의 위 문제가 아닙니다. 위로 갈 때는 위 경로에 있는 글자를 그대로 적습니다. 위 문제의 다른 문제로 가려면 먼저 '위'로 그 위 문제에 돌아가 저장하고, 다음 저장에서 '옆'이나 '아래'로 가세요.`,
    );
  return { problem: P, relation: R };
}
export function pathOf(state) {
  if (!state.current) return null;
  const titles = [];
  for (let n = state.current; n; n = n.parent) titles.unshift(n.title);
  return titles.join(' › ');
}
export function spotOf(state) {
  return pathOf(state) || state.root.title;
}
export function drawTree(state, { mode = 'full', mark = '← 지금', stem } = {}) {
  const marked = state.current || state.root;
  const label = (node) => node.title + (node === marked ? `   ${mark}` : '');
  const lines = [label(state.root)];
  if (mode === 'path') {
    const nodes = [];
    for (let n = state.current; n && n !== state.root; n = n.parent) nodes.unshift(n);
    nodes.forEach((n, i) => lines.push('   '.repeat(i) + '└─ ' + label(n)));
    const omitted = state.count - nodes.length;
    if (omitted > 0) lines.push(`(외 ${omitted}개 — read map branch=${stem})`);
  } else {
    const visit = (parent, prefix) =>
      parent.children.forEach((n, i) => {
        const last = i === parent.children.length - 1;
        lines.push(prefix + (last ? '└─ ' : '├─ ') + label(n));
        visit(n, prefix + (last ? '   ' : '│  '));
      });
    visit(state.root, '');
  }
  return lines;
}
export function treeSection(state, { mode, mark, stem }) {
  return ['## 문제 트리: ' + state.root.title, ...drawTree(state, { mode, mark, stem })];
}
