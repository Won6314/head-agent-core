// AST 기반 심볼 그래프 추출기 — JavaScript(ESM .mjs) 패키지 하나.
//
//   node extract_js.mjs <package root> <out.json> [--typescript <typescript.js>]
//
// 정의(파일·함수·메서드·클래스·맨 위 변수)와 그 사이 참조(call, callback, framework-invoked)를
// 구문 트리와 TypeScript 타입 검사기로 뽑는다. 패키지 코드는 실행하지 않는다. LLM 판단 없음.
// 같은 파일이면 같은 결과(정렬된 JSON). ID·종류 꼴:
// 코드 ID `code:<파일>#<한정 이름>`, 파일은 `code:<파일>`, 이름이 겹치면 `@<줄>`.
//
// 참조 종류:
//   call               부름(함수·메서드 호출, new)
//   callback           부르지 않고 가리킴(인자로 넘김, 값으로 씀, 맨 위 변수 읽기)
//   framework-invoked  경로로 실행(실행 인자 속 이 패키지 .mjs 파일 경로), 부수 효과 import — 대상은 그 파일
// 맨 위 코드(함수 밖)의 참조는 파일 노드가 주인이다.
// 사실(facts): 바깥과 닿는 호출(fs·net·child_process·readline), process.env 읽기 — 주인 정의와 줄.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const tsPath = opt('--typescript') || path.join(process.env.HOME, '.local/opt/typescript-5.9.3/lib/typescript.js');
const ts = createRequire(import.meta.url)(tsPath);
const root = path.resolve(args[0]);
const outFile = path.resolve(args[1]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'types']);
const rel = f => path.relative(root, f).split(path.sep).join('/');
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir).sort(byText)) {
    const full = path.join(dir, name), st = fs.lstatSync(full);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) out.push(...walk(full)); }
    else if (name.endsWith('.mjs')) out.push(full);
  }
  return out;
}
// 시험 파일은 뺀다(code_map.mjs와 같은 규칙): *.test.mjs, test-* 파일, node:assert를 import 하는 파일,
// 시험이 띄우는 보조 파일 폴더 scripts/fixtures/(0.9.9에서 생김).
const all = walk(root);
const isTest = f => {
  const b = path.basename(f);
  if (b.endsWith('.test.mjs') || b.startsWith('test-')) return true;
  if (rel(f).startsWith('scripts/fixtures/')) return true;
  return /from\s+['"](node:)?assert(\/strict)?['"]/.test(fs.readFileSync(f, 'utf8'));
};
const files = all.filter(f => !isTest(f));
const tests = all.filter(isTest).map(rel);

const program = ts.createProgram(files, {
  allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  skipLibCheck: true, types: [], noLib: false,
});
const checker = program.getTypeChecker();
const inScope = new Set(files.map(f => path.resolve(f)));
const sources = program.getSourceFiles().filter(sf => inScope.has(path.resolve(sf.fileName)))
  .sort((a, b) => byText(rel(a.fileName), rel(b.fileName)));

// ---- 정의 ----
const defs = new Map();
const declToDef = new Map();
const lineOf = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
const isFn = e => !!e && (ts.isParenthesizedExpression(e) ? isFn(e.expression) : ts.isArrowFunction(e) || ts.isFunctionExpression(e));
const hasMod = (node, kind) => {
  let n = node;
  if (ts.isVariableDeclaration(n)) n = n.parent?.parent;
  return !!(n && ts.canHaveModifiers(n) && ts.getModifiers(n)?.some(m => m.kind === kind));
};
const nameText = n => {
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
  return null;
};
function addDef(node, sf, parentId, name, kind) {
  const file = rel(sf.fileName);
  const parent = defs.get(parentId);
  const qual = parent.kind !== 'module' ? `${parent.qualname}.${name}` : name;
  let id = `code:${file}#${qual}`;
  if (defs.has(id)) id = `${id}@${lineOf(sf, node.getStart(sf))}`;
  defs.set(id, { id, kind, name, qualname: qual, file, line: lineOf(sf, node.getStart(sf)), end_line: lineOf(sf, node.getEnd()),
    parent: parentId, exported: hasMod(node, ts.SyntaxKind.ExportKeyword) });
  declToDef.set(node, id);
  return id;
}
function defSpec(node, parentDef) {
  const top = parentDef.kind === 'module';
  if (ts.isFunctionDeclaration(node)) {
    if (node.name) return [node.name.text, top ? 'function' : 'local_function'];
    if (top && hasMod(node, ts.SyntaxKind.DefaultKeyword)) return ['default', 'function'];
  }
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) return [node.name.text, 'class'];
  if (ts.isMethodDeclaration(node)) { const n = nameText(node.name); return n === null ? null : [n, ts.isObjectLiteralExpression(node.parent) ? 'property_function' : 'method']; }
  if (ts.isConstructorDeclaration(node)) return ['constructor', 'method'];
  if (ts.isPropertyDeclaration(node) && isFn(node.initializer)) { const n = nameText(node.name); return n === null ? null : [n, 'method']; }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    // 맨 위 변수는 파일 바로 아래 문장의 것만(맨 위 try·if 블록 안의 지역 값은 정의로 세우지 않는다)
    const fileLevel = top && node.parent?.parent && ts.isVariableStatement(node.parent.parent) && ts.isSourceFile(node.parent.parent.parent);
    if (top && !fileLevel) return isFn(node.initializer) ? [node.name.text, 'local_function'] : null;
    if (top) return [node.name.text, isFn(node.initializer) ? 'function' : 'variable'];
    if (isFn(node.initializer)) return [node.name.text, 'local_function'];
  }
  if (ts.isPropertyAssignment(node) && isFn(node.initializer) && ts.isObjectLiteralExpression(node.parent)) {
    const n = nameText(node.name); return n === null ? null : [n, 'property_function'];
  }
  return null;
}
const owner = new Map(); // ts.Node -> def id (가장 안쪽 정의)
for (const sf of sources) {
  const file = rel(sf.fileName), id = `code:${file}`;
  defs.set(id, { id, kind: 'module', name: file.split('/').pop(), qualname: '', file, line: 1, end_line: lineOf(sf, sf.getEnd()), parent: null, exported: true });
  declToDef.set(sf, id);
  const visit = (node, cur) => {
    let here = cur;
    const spec = defSpec(node, defs.get(cur));
    if (spec) here = addDef(node, sf, cur, spec[0], spec[1]);
    owner.set(node, here);
    ts.forEachChild(node, c => visit(c, here));
  };
  ts.forEachChild(sf, c => visit(c, id));
}

// ---- 참조 ----
function defOfSymbol(sym) {
  if (!sym) return null;
  if (sym.flags & ts.SymbolFlags.Alias) { try { sym = checker.getAliasedSymbol(sym); } catch { return null; } }
  for (const d of sym.declarations ?? []) {
    let n = d;
    if (ts.isSourceFile(n)) return declToDef.get(n) ?? null;
    // const f = () => {} 의 화살표 함수 자체가 아니라 선언으로
    if (declToDef.has(n)) return declToDef.get(n);
    if (ts.isShorthandPropertyAssignment(n)) { const s = checker.getShorthandAssignmentValueSymbol(n); if (s && s !== sym) return defOfSymbol(s); }
  }
  return null;
}
const refs = new Map(); // from|to -> {from,to,kinds:[],line}
// 함수인 정의: 부르지 않고 가리키면 callback. 값(맨 위 변수 등)을 읽는 것은 02a의 reference 종류가 아니라 잇지 않는다.
const FUNC_KINDS = new Set(['function', 'local_function', 'method', 'property_function', 'class']);
const declOfDef = new Map(); // def id -> 선언 node
// 콜백 인자: 패키지 함수 F(…, (p) => …)에 넘긴 함수 — 나중에 F가 그 콜백에 무엇을 넣어 부르는지로 p의 클래스를 정한다
const callbackArgs = []; // {fn: def id, index, lambda, sf}
const thisArgs = []; // {fn: def id, index, cls: class def id}
const values = []; // 값(맨 위 변수)을 읽는 자리 — reference가 아니다. 출력 문구 상수의 사용처를 찾을 때만 쓴다
// process.env 별칭: 기본값·초기값이 process.env인 이름(예: person(env = process.env), { env = process.env })
const isProcessEnv = e => !!e && ts.isPropertyAccessExpression(e) && e.expression.getText() === 'process' && e.name.text === 'env';
function addRef(from, to, kind, line) {
  if (!from || !to || from === to) return;
  const k = `${from}|${to}`;
  const r = refs.get(k);
  if (!r) refs.set(k, { from, to, kinds: [kind], line, lines: new Set([line]) });
  else {
    if (!r.kinds.includes(kind)) r.kinds.push(kind);
    r.lines.add(line);
    if (line < r.line) r.line = line;
  }
}
const facts = [];
const OUTSIDE = new Set(['fs', 'net', 'child_process', 'readline']);
const unresolved = new Map(); // callee text -> count (패키지 안을 가리키는 것만 셀 수 없어 이름만)

for (const sf of sources) {
  const file = rel(sf.fileName);
  // 이 파일이 import한 바깥 모듈 이름: 지역 이름 -> 모듈
  const outsideLocal = new Map();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause) continue;
    const mod = st.moduleSpecifier.text.replace(/^node:/, '').split('/')[0];
    if (!OUTSIDE.has(mod)) continue;
    const c = st.importClause;
    if (c.name) outsideLocal.set(c.name.text, { mod, member: null });
    const nb = c.namedBindings;
    if (nb && ts.isNamespaceImport(nb)) outsideLocal.set(nb.name.text, { mod, member: null });
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) outsideLocal.set(e.name.text, { mod, member: (e.propertyName ?? e.name).text });
  }
  // 부수 효과 import(`import '../hosts/claude/hook.mjs'`): 불러오면 그 파일의 맨 위 코드가 돈다 — 그 파일로 framework-invoked
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause || !st.moduleSpecifier.text.startsWith('.')) continue;
    const target = rel(path.resolve(path.dirname(sf.fileName), st.moduleSpecifier.text));
    if (defs.has(`code:${target}`)) addRef(`code:${file}`, `code:${target}`, 'framework-invoked', lineOf(sf, st.getStart(sf)));
  }
  const visit = node => {
    const from = owner.get(node) ?? `code:${file}`;
    const line = () => lineOf(sf, node.getStart(sf));
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // (c ? F : G)(…)는 F와 G를 둘 다 부르는 것으로 본다(0.9.9 sessions.read의 files 갈래)
      const callees = e => {
        while (ts.isParenthesizedExpression(e)) e = e.expression;
        if (ts.isConditionalExpression(e)) return [...callees(e.whenTrue), ...callees(e.whenFalse)];
        return [ts.isPropertyAccessExpression(e) ? e.name : e];
      };
      for (const target of callees(node.expression)) {
      const d = defOfSymbol(checker.getSymbolAtLocation(target));
      if (d) addRef(from, d, 'call', line());
      // new C(…)는 C의 constructor도 부른다
      if (d && ts.isNewExpression(node) && defs.get(d).kind === 'class' && defs.has(`${d}.constructor`)) addRef(from, `${d}.constructor`, 'call', line());
      if (d && FUNC_KINDS.has(defs.get(d).kind))
        (node.arguments ?? []).forEach((a, index) => {
          if (isFn(a)) callbackArgs.push({ fn: d, index, lambda: ts.isParenthesizedExpression(a) ? a.expression : a, sf });
          // F(this, …)를 클래스 C의 메서드 안에서 부르면 F의 그 매개변수는 C다
          if (a.kind === ts.SyntaxKind.ThisKeyword) {
            let c = node.parent;
            while (c && !ts.isClassDeclaration(c) && !ts.isClassExpression(c)) c = c.parent;
            const cd = c && declToDef.get(c);
            if (cd) thisArgs.push({ fn: d, index, cls: cd });
          }
        });
      }
      const ce = node.expression;
      // 바깥 호출
      let api = null;
      if (ts.isPropertyAccessExpression(ce) && ts.isIdentifier(ce.expression) && outsideLocal.has(ce.expression.text)) {
        api = { ...outsideLocal.get(ce.expression.text), member: ce.name.text };
      } else if (ts.isIdentifier(ce) && outsideLocal.has(ce.text)) api = outsideLocal.get(ce.text);
      if (api) {
        const a0 = node.arguments?.[0];
        const fact = { type: 'outside', def: from, module: api.mod, api: api.member, file, line: line() };
        if (a0 && ts.isNumericLiteral(a0)) fact.fd = Number(a0.text); // 0 표준 입력, 1 표준 출력 — 파일이 아님
        facts.push(fact);
      }
    }
    // 경로로 실행: import 밖의 문자열·템플릿 글이 이 패키지의 .mjs 파일 경로로 끝나면
    if ((ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) && !ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) {
      const text = ts.isTemplateExpression(node) ? node.templateSpans.at(-1).literal.text : node.text;
      const m = /([\w./-]+\.mjs)$/.exec(text);
      if (m) {
        const tail = m[1].replace(/^\.?\//, '');
        const hits = [...defs.values()].filter(x => x.kind === 'module' && (x.file === tail || x.file.endsWith('/' + tail)));
        if (hits.length === 1) addRef(from, hits[0].id, 'framework-invoked', line());
      }
    }
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isCallee = (ts.isCallExpression(p) || ts.isNewExpression(p)) && p.expression === node;
      const isDeclName = (ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isClassDeclaration(p) || ts.isParameter(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isExportSpecifier(p)) && p.name === node;
      const isMember = ts.isPropertyAccessExpression(p) && p.name === node;
      const memberCallee = isMember && (ts.isCallExpression(p.parent) || ts.isNewExpression(p.parent)) && p.parent.expression === p;
      // 바깥 API를 부르지 않고 값으로 넘김(예: 기본 인자 `run = spawn`) — 그 자리에서 바깥에 닿는 것으로 센다
      const imp = outsideLocal.get(node.text);
      if (imp?.member && !isCallee && !isDeclName && !isMember && !ts.isImportSpecifier(p))
        facts.push({ type: 'outside', def: from, module: imp.mod, api: imp.member, file, line: line(), via: 'value' });
      if (!isCallee && !isDeclName && !memberCallee) {
        const d = defOfSymbol(checker.getSymbolAtLocation(node));
        if (d && FUNC_KINDS.has(defs.get(d).kind)) {
          // 함수가 돌려주는 객체 글({ load, save, … })에 자기 안의 지역 함수를 담는 것은 부르는 것도 넘기는 것도 아니고,
          // 그 함수가 정의해 내놓는 핸들러다 — 02a의 defines. 02b 조회는 defines를 따라가지 않는다.
          const inReturnObj = (ts.isShorthandPropertyAssignment(p) || (ts.isPropertyAssignment(p) && p.initializer === node)) &&
            ts.isObjectLiteralExpression(p.parent) && ts.isReturnStatement(p.parent.parent);
          const target = defs.get(d);
          addRef(from, d, inReturnObj && target.parent === from ? 'defines' : 'callback', line());
        } else if (d && defs.get(d).kind === 'variable') values.push({ from, to: d, line: line() }); // 값 쓰임: 연결로 두지 않고 따로 남김
      }
    } else if (ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sf) === 'process' && node.expression.name.text === 'env') {
      facts.push({ type: 'env', def: from, name: node.name.text, file, line: line() });
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && /^[A-Z][A-Z0-9_]+$/.test(node.name.text)) {
      // 별칭으로 읽는 env: 그 이름의 선언(매개변수·변수·구조 분해)의 기본값·초기값이 process.env
      const sym = checker.getSymbolAtLocation(node.expression);
      const dcl = sym?.declarations?.[0];
      if (dcl && (ts.isParameter(dcl) || ts.isVariableDeclaration(dcl) || ts.isBindingElement(dcl)) && isProcessEnv(dcl.initializer))
        facts.push({ type: 'env', def: from, name: node.name.text, file, line: line(), via: 'alias' });
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

// ---- 콜백 인자의 메서드 호출 ----
// 규칙: F(…, (p) => … p.m(…) …)에서, F의 선언 안에 그 매개변수 이름을 x(인자)로 부르는 곳이 있고
// 인자가 `new C(…)`이거나 `new C(…)`를 넣은 지역 이름이면 p는 C다. 그러면 p.m(…)을 C.m으로 잇는다(call).
// JavaScript라 타입이 없으므로 이 패키지 안에서 그 콜백이 무엇으로 불리는지만 본다.
for (const [n, id] of declToDef) declOfDef.set(id, n);
const fnNode = n => (ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isPropertyDeclaration(n)) ? n.initializer : n;
const classOfCallback = new Map();
function callbackClass(fnId, index) {
  const k = `${fnId}|${index}`;
  if (classOfCallback.has(k)) return classOfCallback.get(k);
  classOfCallback.set(k, null); // 돌아 들어오는 호출을 막는다
  let result = null;
  const decl = declOfDef.get(fnId), f = decl && fnNode(decl);
  const param = f?.parameters?.[index];
  if (param && ts.isIdentifier(param.name)) {
    const pname = param.name.text, news = new Map(); // 지역 이름 -> 클래스 def
    const classDef = ne => ne && ts.isNewExpression(ne) ? defOfSymbol(checker.getSymbolAtLocation(ne.expression)) : null;
    const walk = n => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && classDef(n.initializer)) news.set(n.name.text, classDef(n.initializer));
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && classDef(n.right)) news.set(n.left.text, classDef(n.right));
      ts.forEachChild(n, walk);
    };
    walk(f);
    const find = n => {
      if (result) return;
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === pname && n.arguments[0]) {
        const a = n.arguments[0];
        result = classDef(a) || (ts.isIdentifier(a) ? news.get(a.text) : null) || null;
      }
      // 받은 콜백을 다른 패키지 함수 G에 그대로 넘기면(withGraphRead → withGraph) G가 넘기는 클래스를 쓴다
      if (!result && ts.isCallExpression(n))
        n.arguments.forEach((a, j) => {
          if (result || !ts.isIdentifier(a) || a.text !== pname) return;
          const g = defOfSymbol(checker.getSymbolAtLocation(ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression));
          if (g && FUNC_KINDS.has(defs.get(g).kind)) result = callbackClass(g, j);
        });
      ts.forEachChild(n, find);
    };
    find(f);
  }
  classOfCallback.set(k, result);
  return result;
}
let callbackLinks = 0;
for (const { fn, index, lambda, sf } of callbackArgs) {
  const C = callbackClass(fn, index);
  const p0 = lambda.parameters?.[0];
  if (!C || !p0 || !ts.isIdentifier(p0.name)) continue;
  const pname = p0.name.text;
  const look = n => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === pname) {
      const target = `${C}.${n.expression.name.text}`;
      if (defs.has(target)) { addRef(owner.get(n) ?? `code:${rel(sf.fileName)}`, target, 'call', lineOf(sf, n.getStart(sf))); callbackLinks++; }
    }
    // p를 다른 패키지 함수 G에 그대로 넘기면 G의 그 매개변수도 C다(아래 this 규칙과 같이 처리)
    if (ts.isCallExpression(n)) {
      const g = defOfSymbol(checker.getSymbolAtLocation(ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression));
      if (g && FUNC_KINDS.has(defs.get(g).kind))
        n.arguments.forEach((a, index) => { if (ts.isIdentifier(a) && a.text === pname) thisArgs.push({ fn: g, index, cls: C }); });
    }
    ts.forEachChild(n, look);
  };
  look(lambda.body);
}
// F(this, …)로 받은 매개변수 p의 p.m(…)을 C.m으로 잇는다(같은 규칙, 인자가 this인 경우).
// F가 p를 또 다른 패키지 함수 H에 그대로 넘기면 H의 그 매개변수도 C다(0.9.20 검수 M1:
// withGraphRead((g) => recoveryText(g)) → recoveryText가 g를 conversationRecords 등에 넘김). 본 것은 건너뛴다.
const seenThis = new Set();
for (let i = 0; i < thisArgs.length; i++) {
  const { fn, index, cls } = thisArgs[i];
  const key = `${fn}|${index}|${cls}`;
  if (seenThis.has(key)) continue;
  seenThis.add(key);
  const decl = declOfDef.get(fn), f = decl && fnNode(decl);
  const param = f?.parameters?.[index];
  if (!param || !ts.isIdentifier(param.name) || !f.body) continue;
  const pname = param.name.text, fsf = f.getSourceFile();
  const look = n => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === pname) {
      const target = `${cls}.${n.expression.name.text}`;
      if (defs.has(target)) { addRef(owner.get(n) ?? fn, target, 'call', lineOf(fsf, n.getStart(fsf))); callbackLinks++; }
    }
    if (ts.isCallExpression(n)) {
      const h = defOfSymbol(checker.getSymbolAtLocation(ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression));
      if (h && FUNC_KINDS.has(defs.get(h).kind))
        n.arguments.forEach((a, j) => { if (ts.isIdentifier(a) && a.text === pname) thisArgs.push({ fn: h, index: j, cls }); });
    }
    ts.forEachChild(n, look);
  };
  look(f.body);
}
console.error(`callback-arg method calls linked: ${callbackLinks}`);

const sortedDefs = [...defs.values()].sort((a, b) => byText(a.file, b.file) || a.line - b.line || byText(a.id, b.id));
// lines: 이 참조가 나온 줄 전부(파일 맨 위 코드의 분기마다 따로 따질 때 쓴다). line은 그중 처음.
const sortedRefs = [...refs.values()].map(r => ({ from: r.from, to: r.to, kind: r.kinds.join(','), line: r.line, lines: [...r.lines].sort((a, b) => a - b) }))
  .sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to));
facts.sort((a, b) => byText(a.file, b.file) || a.line - b.line || byText(a.type, b.type) || byText(String(a.api ?? a.name), String(b.api ?? b.name)));
fs.writeFileSync(outFile, JSON.stringify({ files: sources.map(s => rel(s.fileName)), tests, defs: sortedDefs, refs: sortedRefs, facts,
  values: [...new Map(values.map(v => [`${v.from}|${v.to}|${v.line}`, v])).values()].sort((a, b) => byText(a.from, b.from) || byText(a.to, b.to) || a.line - b.line) }, null, 1) + '\n');
const kinds = {};
for (const d of sortedDefs) kinds[d.kind] = (kinds[d.kind] ?? 0) + 1;
const rk = {};
for (const r of sortedRefs) for (const k of r.kind.split(',')) rk[k] = (rk[k] ?? 0) + 1;
console.error(`files ${sources.length} (tests skipped ${tests.length}) defs ${sortedDefs.length} ${JSON.stringify(kinds)} refs ${sortedRefs.length} ${JSON.stringify(rk)} facts ${facts.length}`);
