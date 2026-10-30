import readline from 'node:readline';
import { sessions, CONTEXT_REQUIRED } from './sessions.mjs';
import { setupTool } from './project.mjs';
export const instructions = `일을 시작할 때는 먼저 start-job 스킬을 불러옵니다.

작업 세션
- 무엇: 이어지는 큰 일의 묶음입니다. 목적은 context.md에 있습니다. 호스트가 말하는 "세션"은 이 대화이며 작업 세션과 다릅니다.
- 언제: 대화에서 이어질 일이 시작됐는데 작업 세션이 없으면, 목록(list)에서 맞는 것을 찾아 사용자에게 묻고 불러옵니다. 없으면 사용자와 목적을 정하고, 새로 만들지 물은 뒤 만듭니다. context.md는 사용자 동의 없이 고치지 않습니다.

작업 브랜치
- 무엇: 작업 세션 안에서 열리고 닫히는 한 번의 일입니다. 이름이 있고, 여러 개가 동시에 열릴 수 있으며, 닫히면 메인에 합쳐집니다.
- 언제: 작업에 착수할 때 엽니다. 불러온 작업 맥락에 이어 갈 작업 브랜치가 있으면 골라 이어 갑니다.

저장
- 무엇: 작업 브랜치에 남기는 기록 한 번입니다. 작업 요약, 근거 파일 링크, 파일에 빠진 내용을 씁니다.
- 언제: 결과나 결정이 생기면 남깁니다. 이어 갈 일이 있으면 다음을 적고, 끝났으면 다음 없이 정리를 줍니다. 그 저장으로 작업 브랜치가 닫힙니다.
- 작업 파일: 작업 세션 폴더의 work/YYYY-MM/YYYY-MM-DD-<이름>.md에 둡니다(여러 개면 같은 이름 폴더). 커진 작업은 work/<작업명>/으로 옮기고 그 파일을 가리키던 기록의 링크도 고칩니다. 포크·에이전트에 맡길 때는 결과 파일 경로를 이 규칙대로 정해 줍니다.

할 일
- 무엇: 작업 세션에 남는 나중에 할 일입니다. 작업 브랜치가 닫혀도 남습니다.
- 언제: 사용자가 나중에 하자고 하거나 미룬 일이 생기면 남깁니다(todo add). 끝나면 끝냄으로 표시합니다(todo done).

다른 대화
- 무엇: 이 프로젝트에서 살아 있는 대화와, 각 대화가 일하는 작업 세션·작업 브랜치입니다.
- 언제: 다른 대화에 말을 전하거나 그 대화가 무엇을 하는지 알아야 할 때 먼저 목록(conversations)을 봅니다. 보낼 때는 목록의 보낼 곳으로 SendMessage를 씁니다.`;
// Codex has its own send_message_to_thread, but it reaches Codex conversations only: there the
// plugin's own send reaches both apps. The rest is the same for both apps.
export const instructionsFor = host => (host === 'codex' ? instructions.replace('보낼 때는 목록의 보낼 곳으로 SendMessage를 씁니다.', '보낼 때는 목록의 보낼 곳을 이 플러그인의 send(threadId: 보낼 곳, prompt)에 줍니다. Codex의 send_message_to_thread는 Claude 대화로 보내지 못하니 대화 간 메시지에는 send를 씁니다.') : instructions);
export const VERSION = '0.9.0';
const string = { type: 'string' };
// 필수 인자가 빠졌을 때 이유까지 알리는 문구. 없으면 일반 문구를 쓴다.
const missing = { create: { context: CONTEXT_REQUIRED } };
// Tools that change a record or a connection. A call made by a task running inside the
// conversation that called it (the host fills agent_id) may read but not write.
export const WRITES = { load: true, create: true, save: true, branch: true, todo: args => args.action !== 'list' };
export const FORK_WRITE_REFUSED = '이 작업에서는 작업 기록을 쓰지 않습니다(읽기만 됩니다). 결과를 돌려주면 부른 대화가 확인하고 저장합니다.';
// Said once to a task that runs inside the conversation that called it (the host's
// SubagentStart: a fork made with the Agent tool or a subagent). A copy that becomes a
// conversation of its own (a desktop side session) gets nothing and saves like any other.
export const SUBAGENT_NOTICE = '이 작업은 부른 대화 안에서 맡은 일 하나를 합니다. 끝나면 결과를 돌려주세요. 부른 대화가 결과를 확인하고 저장합니다. 작업 기록 도구(load, save 등)는 읽기만 됩니다.';
export const definitions = [
  ['list', '작업 세션 목록을 읽습니다: 이름, context.md 첫 문장, 메인의 최신 요약, 열린 작업 브랜치 수를 최근 기록 순으로. 기록 지도는 read map입니다.', {}, []],
  ['load', '작업 세션을 불러와 이 대화를 연결하고 작업 맥락을 돌려줍니다: context.md, 이 대화의 작업 브랜치(최근 기록과 다음), 열린 작업 브랜치, 할 일, 흐름 지도(git 그래프 모양, 최신이 위). branch를 주면 그 작업 브랜치를 이어 갑니다(닫힌 것은 다시 열립니다). branch=main은 메인에서 일합니다. 생략하면 이 작업 세션에서 쓰던 작업 브랜치, 처음이면 메인입니다.',
    { name: string, branch: string, history_count: { type: 'integer', minimum: 0, default: 3 }, map_limit: { type: 'integer', minimum: 0, default: 30, description: '흐름 지도 줄 최대 수. 0은 전체.' } }, []],
  ['create', '새 작업 세션을 만들고 이 대화를 그 메인에 연결합니다. context(목적)는 필수이며 없거나 공백뿐이면 만들지 않고 거절합니다. 기존 파일은 덮어쓰지 않습니다. context는 context.md 본문입니다. 첫 줄은 `# 이름`, 바로 아래에는 이 작업 세션이 무엇을 하는지 한 문장을 씁니다(작업 세션 목록에 그대로 나갑니다). 그 아래에는 방향·전제·범위·다른 작업 세션과의 경계 중 정해진 것만 둡니다. 진행 상황·최근 작업·파일 목록은 쓰지 않습니다.',
    { name: string, context: { type: 'string', description: '필수. 사용자와 정한 이 작업 세션의 목적·방향. 비어 있으면 만들지 않습니다.' } }, ['name', 'context']],
  ['save', '이 대화가 일하는 작업 브랜치(없으면 메인)에 기록 하나를 남깁니다. summary는 한 줄 요약, history는 본문, next는 이어 갈 일이 있을 때만 한 줄. 본문은 작업 요약, 근거 파일 링크와 그 내용, 파일에 빠진 내용입니다. 작업 내용이 아직 파일에 없으면 먼저 파일로 남기고 링크합니다(작업 세션 폴더의 work/YYYY-MM/YYYY-MM-DD-<이름>.md, 여러 개면 같은 이름 폴더, 커진 작업은 work/<작업명>/으로 옮기고 가리키던 기록 링크도 고침). 사용자 원문, 진행 경과, 실행 증거(ID·명령·로그)는 넣지 않습니다. 저장할 때마다 최근 기록이 밀려나므로 잘게 나눠 저장하지 말고, 같은 경계의 일은 모아 한 번에 저장합니다. 작업 브랜치에서 next 없이 저장하면 recap(그 작업 브랜치에서 한 일 전체 정리)이 필수이고, 그 저장으로 작업 브랜치가 닫혀 메인에 합쳐집니다. next와 recap은 함께 줄 수 없습니다.',
    { summary: string, history: string, next: string, recap: { type: 'string', description: '작업 브랜치를 닫는 저장(next 없음)에만. 그 작업 브랜치에서 한 일 전체 정리.' } }, ['summary', 'history']],
  ['branch','작업 브랜치 다루기. create는 branch 이름(필수, 그 일을 나타내는 짧은 이름)으로 새 작업 브랜치를 열고 이 대화를 거기에 둡니다(parent 생략은 이 대화의 작업 브랜치, 없으면 메인). attach는 있는 작업 브랜치를 이어 갑니다(다른 대화가 같은 작업 브랜치에 있어도 됩니다). abandon은 사용자가 그만둔 작업 브랜치를 reason과 함께 중단합니다. 다른 작업 브랜치로 옮겨도 떠난 작업 브랜치는 열린 채 남습니다.',
    {action:{type:'string',enum:['create','attach','abandon']},branch:string,parent:string,reason:string},['action']],
  ['read','연결을 바꾸지 않고 기록을 읽습니다: overview(둘러보기: 불러올 때와 같은 작업 맥락 — context.md 전문, 열린 작업 브랜치와 다음, 할 일, 흐름 지도, 작업 세션 전체의 최근 기록 — 을 연결 없이) / map(흐름 지도) / recent(최근 본문) / entry(지도의 짧은 ID 또는 전체 ID) / find(file은 그 파일을 가리키는 기록, query는 본문 낱말) / files(id 기록 또는 branch 작업 브랜치 기록 전체가 가리킨 파일과, 그 파일들이 링크·백틱 경로로 가리킨 파일을 나무 모양으로. depth 1~3, 기본 2, 파일 50개까지). name은 다른 작업 세션, branch는 그 작업 브랜치(부모 포함). limit는 지도·결과 건수(보통 기본값 30으로 충분합니다), 0 전체.',
    {action:{type:'string',enum:['overview','map','recent','entry','find','files']},name:string,branch:string,limit:{type:'integer',minimum:0,default:30},count:{type:'integer',minimum:0,default:5},id:string,file:string,query:string,depth:{type:'integer',minimum:1,default:2}},['action']],
  ['todo','작업 세션의 할 일(todo.md). 사용자가 나중에 할 일을 말하면 add, 할 일을 물으면 list, 끝났다고 하면 done. add의 text는 나중에 오해가 없도록 할 일과 범위를 분명히 쓰고 사용자 원문을 근거로 인용합니다. 사용자가 정하지 않은 것을 확정사항으로 쓰지 않습니다. 기한이 있으면 상대 날짜를 실제 날짜로 바꿔 due(YYYY-MM-DD)에 넣습니다. done은 match가 열린 항목 하나에만 맞을 때 끝냅니다. name 생략은 이 대화의 작업 세션입니다.',
    {action:{type:'string',enum:['add','list','done']},text:string,due:string,match:string,name:string},['action']],
  ['conversations','다른 대화에 말을 전하기 전에 받을 대화를 고르는 목록입니다. 살아 있는 대화를 작업 세션 → 작업 브랜치 → 대화로 보여 주고(작업 세션에 안 붙은 대화는 따로), 대화마다 이름, 보낼 곳, 종류(사람 / 포크·워커), 마지막 활동, 하는 일 한 줄을 붙입니다. 포크·워커는 띄운 대화가 살아 있으면 그 대화 아래에 들여 써서 한 번만 보입니다. 하는 일은 포크·워커면 맡은 일, 작업 브랜치면 그 이름(주제), 그리고 사람이 마지막으로 시킨 말이고, 메인이면 메인의 마지막 저장이 붙습니다. 고르는 법: 1) 전할 내용과 맞는 작업 세션·작업 브랜치(주제) 아래의 대화를 고릅니다. 2) 같은 곳에 여럿이면 사람 대화 가운데 하는 일이 맞고 마지막 활동이 가장 최근인 것을 고릅니다. 포크·워커에는 그 대화가 맡은 일에 관한 말만 보냅니다. 3) 그래도 하나로 좁혀지지 않으면 보내지 말고 후보(작업 브랜치·이름·하는 일)를 사용자에게 보여 고르게 합니다. 같은 말을 여러 대화에 한꺼번에 보내지 않습니다. 보내기는 이 앱의 보내기 도구(Claude Code는 SendMessage(to), Codex는 이 플러그인의 send(threadId))에 목록의 보낼 곳을 그대로 줍니다. Claude Code와 Codex 대화가 한 목록에 함께 나옵니다. 이름(head-2b 같은 것)은 여러 대화가 같을 수 있으니 보낼 곳을 씁니다. 보낼 곳은 대화가 다시 시작하면 바뀌므로 방금 읽은 목록의 것을 씁니다. name을 주면 그 작업 세션만.',
    {name:string},[]]
].map(([name, description, properties, required]) => ({ name, description,
  inputSchema: { type: 'object', properties: { ...properties, conversation_id: { type: 'string', description: '호스트 연결 전용. 모델은 지정하지 않습니다.' }, agent_id: { type: 'string', description: '호스트 연결 전용. 모델은 지정하지 않습니다.' } }, required, additionalProperties: false } }));
// Project-level, not conversation-level: no conversation_id.
definitions.push({ name: 'setup', description: '프로젝트 첫 실행의 유일한 쓰기 도구. 사용자가 동의했을 때만 부릅니다. action=setup: 이 프로젝트에서 코어 지침을 켜고(다음 시작부터 시작·/clear·압축 때 들어감, 사본은 .head/core.md), 프로젝트 .claude/settings.json에 기본 포크를 켜는 env.CLAUDE_CODE_FORK_SUBAGENT="1"과 이 플러그인의 마켓(extraKnownMarketplaces, 자동 업데이트)·enabledPlugins를 더하고(다른 설정은 그대로, 이미 있으면 그대로) 초기설정을 끝남으로 기록한 뒤 코어 지침 본문을 돌려줍니다. 이 대화부터 그 지침을 따르세요. action=never_ask: 사용자가 다시 묻지 말라고 한 단계(step=setup 또는 survey)를 기록합니다. action=survey_done: 프로젝트 조사를 끝남으로 기록합니다.',
  inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['setup', 'never_ask', 'survey_done'] }, step: { type: 'string', enum: ['setup', 'survey'] } }, required: ['action'], additionalProperties: false } });
const METHODS = { read: 'inspect' };
// readOnly: the host says this conversation is run by a program (a fork or worker started
// with claude -p); it may read but not write, like a task inside a conversation.
export function callTool(store, name, args, conversation_id, project, readOnly = false, host = 'claude') {
  const tool = definitions.find(t => t.name === name);
  if (!tool) throw new Error(`알 수 없는 도구: ${name}`);
  for (const [key, value] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[key];
    if (!schema || (schema.type === 'string' ? typeof value !== 'string' : schema.type==='boolean'?typeof value!=='boolean':!Number.isInteger(value)) || (schema.enum&&!schema.enum.includes(value)) || (schema.minimum!==undefined&&value<schema.minimum)) throw new Error(`유효하지 않은 인자: ${key}`);
  }
  for (const key of tool.inputSchema.required) if (!(key in args)) throw new Error(missing[name]?.[key] || `필수 인자: ${key}`);
  const { agent_id, ...rest } = args;
  // First-run setup writes project settings: the calling conversation does it, not a task inside it.
  if (name === 'setup') { if (agent_id || readOnly) throw new Error(FORK_WRITE_REFUSED); return setupTool(project, args, { host }); }
  const writes = WRITES[name];
  if ((agent_id || readOnly) && (typeof writes === 'function' ? writes(rest) : writes)) throw new Error(FORK_WRITE_REFUSED);
  return store[METHODS[name] || name]({ ...rest, conversation_id });
}
// project: the one project of this server (Claude: CLAUDE_PROJECT_DIR). projectOf(request):
// the project of each call, for a host that starts its server outside the project (Codex);
// options may then be a function of the project.
export const PROJECT_UNKNOWN = '이 대화의 프로젝트를 알 수 없습니다. 대화를 새로 시작하거나 다시 열어 주세요(시작할 때 프로젝트를 등록합니다).';
// tools: a host's own tools beside these ([{definition, call({project, args, conversation_id,
// request}) → text}], awaited): Codex's send.
// agentOf(request): the task inside the conversation that makes this call, when the host names
// it on the call itself (Codex); it makes the call read-only like a host-filled agent_id.
export async function serve({ project, projectOf, host, conversationOf, agentOf = () => null, options = {}, readOnly = () => false, tools = [] }) {
  const stores = new Map();
  const storeOf = dir => { if (!stores.has(dir)) stores.set(dir, sessions(dir, { host, ...(typeof options === 'function' ? options(dir) : options) })); return stores.get(dir); };
  const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let request;
    try { request = JSON.parse(line); }
    catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    if (request.id === undefined) continue;
    const { id, method, params = {} } = request;
    if (method === 'initialize') send({ id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'head-context', version: VERSION }, instructions: instructionsFor(host) } });
    else if (method === 'ping') send({ id, result: {} });
    else if (method === 'tools/list') send({ id, result: { tools: [...definitions, ...tools.map(t => t.definition)] } });
    else if (method === 'tools/call') {
      try {
        const dir = projectOf ? projectOf(request) : project;
        if (!dir) throw new Error(PROJECT_UNKNOWN);
        const own = tools.find(t => t.definition.name === params.name);
        const text = own ? await own.call({ project: dir, args: params.arguments || {}, conversation_id: conversationOf(request), request })
          : callTool(storeOf(dir), params.name, params.arguments || {}, conversationOf(request), dir, readOnly(request) || Boolean(agentOf(request)), host);
        send({ id, result: { content: [{ type: 'text', text }] } });
      }
      catch (error) { send({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    } else send({ id, error: { code: -32601, message: 'Method not found' } });
  }
}
