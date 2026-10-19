import readline from 'node:readline';
import { sessions, CONTEXT_REQUIRED } from './sessions.mjs';
import { setupTool } from './project.mjs';
export const instructions = `일을 시작할 때는 먼저 start-job 스킬을 불러옵니다.

작업 세션
- 무엇: 이어지는 큰 일의 묶음입니다. 목적은 context.md에 있습니다. 호스트가 말하는 "세션"은 이 대화이며 작업 세션과 다릅니다.
- 언제: 대화에서 이어질 일이 시작됐는데 작업 세션이 없으면, 목록(session_list)에서 맞는 것을 찾아 사용자에게 묻고 불러옵니다. 없으면 목적을 정해 새로 만듭니다. context.md는 사용자 동의 없이 고치지 않습니다.

작업 브랜치
- 무엇: 작업 세션 안에서 열리고 닫히는 한 번의 일입니다. 이름이 있고, 여러 개가 동시에 열릴 수 있으며, 닫히면 메인에 합쳐집니다.
- 언제: 작업에 착수할 때 엽니다. 불러온 작업 맥락에 이어 갈 작업 브랜치가 있으면 골라 이어 갑니다.

저장
- 무엇: 작업 브랜치에 남기는 기록 한 번입니다. 작업 요약, 근거 파일 링크, 파일에 빠진 내용을 씁니다.
- 언제: 결과나 결정이 생기면 남깁니다. 이어 갈 일이 있으면 다음을 적고, 끝났으면 다음 없이 정리를 줍니다. 그 저장으로 작업 브랜치가 닫힙니다.
- 기본 포크와 하위 에이전트는 저장하지 않습니다. 결과는 부모 대화가 받아 저장합니다.

할 일
- 무엇: 작업 세션에 남는 나중에 할 일입니다. 작업 브랜치가 닫혀도 남습니다.
- 언제: 사용자가 나중에 하자고 하거나 미룬 일이 생기면 남깁니다(session_todo add). 끝나면 끝냄으로 표시합니다(session_todo done).

다른 대화
- 무엇: 이 프로젝트에서 살아 있는 대화와, 각 대화가 일하는 작업 세션·작업 브랜치입니다.
- 언제: 다른 대화에 말을 전하거나 그 대화가 무엇을 하는지 알아야 할 때 먼저 목록(session_conversations)을 봅니다. 보낼 때는 목록의 주소로 SendMessage를 씁니다.`;
const string = { type: 'string' };
// 필수 인자가 빠졌을 때 이유까지 알리는 문구. 없으면 일반 문구를 쓴다.
const missing = { session_create: { context: CONTEXT_REQUIRED } };
// Tools that change a record or a connection. A call made inside a fork or a subagent
// (the host fills agent_id) may read but not write.
export const WRITES = { session_load: true, session_create: true, session_save: true, session_branch: true, session_todo: args => args.action !== 'list' };
export const FORK_WRITE_REFUSED = '기본 포크와 하위 에이전트는 작업 기록을 쓰지 않습니다(읽기만 됩니다). 결과는 부모 대화에 돌려주세요. 부모 대화가 저장합니다.';
export const definitions = [
  ['session_list', '작업 세션 목록을 읽습니다: 이름, context.md 첫 문장, 메인의 최신 요약, 열린 작업 브랜치 수를 최근 기록 순으로. 기록 지도는 session_read map입니다.', {}, []],
  ['session_load', '작업 세션을 불러와 이 대화를 연결하고 작업 맥락을 돌려줍니다: context.md, 이 대화의 작업 브랜치(최근 기록과 다음), 열린 작업 브랜치, 할 일, 흐름 지도(git 그래프 모양, 최신이 위). branch를 주면 그 작업 브랜치를 이어 갑니다(닫힌 것은 다시 열립니다). branch=main은 메인에서 일합니다. 생략하면 이 작업 세션에서 쓰던 작업 브랜치, 처음이면 메인입니다.',
    { name: string, branch: string, history_count: { type: 'integer', minimum: 0, default: 3 }, map_limit: { type: 'integer', minimum: 0, default: 30, description: '흐름 지도 줄 최대 수. 0은 전체.' } }, []],
  ['session_create', '새 작업 세션을 만들고 이 대화를 그 메인에 연결합니다. context(목적)는 필수이며 없거나 공백뿐이면 만들지 않고 거절합니다. 기존 파일은 덮어쓰지 않습니다. context는 context.md 본문입니다. 첫 줄은 `# 이름`, 바로 아래에는 이 작업 세션이 무엇을 하는지 한 문장을 씁니다(작업 세션 목록에 그대로 나갑니다). 그 아래에는 방향·전제·범위·다른 작업 세션과의 경계 중 정해진 것만 둡니다. 진행 상황·최근 작업·파일 목록은 쓰지 않습니다.',
    { name: string, context: { type: 'string', description: '필수. 사용자와 정한 이 작업 세션의 목적·방향. 비어 있으면 만들지 않습니다.' } }, ['name', 'context']],
  ['session_save', '이 대화가 일하는 작업 브랜치(없으면 메인)에 기록 하나를 남깁니다. summary는 한 줄 요약, history는 본문, next는 이어 갈 일이 있을 때만 한 줄. 본문은 작업 요약, 근거 파일 링크와 그 내용, 파일에 빠진 내용입니다. 작업 내용이 아직 파일에 없으면 먼저 파일로 남기고 링크합니다. 사용자 원문, 진행 경과, 실행 증거(ID·명령·로그)는 넣지 않습니다. 저장할 때마다 최근 기록이 밀려나므로 잘게 나눠 저장하지 말고, 같은 경계의 일은 모아 한 번에 저장합니다. 작업 브랜치에서 next 없이 저장하면 recap(그 작업 브랜치에서 한 일 전체 정리)이 필수이고, 그 저장으로 작업 브랜치가 닫혀 메인에 합쳐집니다. next와 recap은 함께 줄 수 없습니다.',
    { summary: string, history: string, next: string, recap: { type: 'string', description: '작업 브랜치를 닫는 저장(next 없음)에만. 그 작업 브랜치에서 한 일 전체 정리.' } }, ['summary', 'history']],
  ['session_branch','작업 브랜치 다루기. create는 branch 이름(필수, 그 일을 나타내는 짧은 이름)으로 새 작업 브랜치를 열고 이 대화를 거기에 둡니다(parent 생략은 이 대화의 작업 브랜치, 없으면 메인). attach는 있는 작업 브랜치를 이어 갑니다(다른 대화가 같은 작업 브랜치에 있어도 됩니다). abandon은 사용자가 그만둔 작업 브랜치를 reason과 함께 중단합니다. 다른 작업 브랜치로 옮겨도 떠난 작업 브랜치는 열린 채 남습니다.',
    {action:{type:'string',enum:['create','attach','abandon']},branch:string,parent:string,reason:string},['action']],
  ['session_read','연결을 바꾸지 않고 기록을 읽습니다: map(흐름 지도) / recent(최근 본문) / entry(지도의 짧은 ID 또는 전체 ID) / find(file은 그 파일을 가리키는 기록, query는 본문 낱말). name은 다른 작업 세션, branch는 그 작업 브랜치(부모 포함). limit는 지도·결과 건수, 0 전체.',
    {action:{type:'string',enum:['map','recent','entry','find']},name:string,branch:string,limit:{type:'integer',minimum:0,default:30},count:{type:'integer',minimum:0,default:5},id:string,file:string,query:string},['action']],
  ['session_todo','작업 세션의 할 일(todo.md). 사용자가 나중에 할 일을 말하면 add, 할 일을 물으면 list, 끝났다고 하면 done. add의 text는 나중에 오해가 없도록 할 일과 범위를 분명히 쓰고 사용자 원문을 근거로 인용합니다. 사용자가 정하지 않은 것을 확정사항으로 쓰지 않습니다. 기한이 있으면 상대 날짜를 실제 날짜로 바꿔 due(YYYY-MM-DD)에 넣습니다. done은 match가 열린 항목 하나에만 맞을 때 끝냅니다. name 생략은 이 대화의 작업 세션입니다.',
    {action:{type:'string',enum:['add','list','done']},text:string,due:string,match:string,name:string},['action']],
  ['session_conversations','살아 있는 대화를 작업 세션 → 작업 브랜치 → 대화로 보여 줍니다(작업 세션에 안 붙은 대화는 따로). 대화마다 제목, 주소, 마지막 활동. 다른 대화에 메시지를 보내기 전에 이 목록에서 대화를 고르고, 호스트의 메시지 도구(SendMessage)의 받는 쪽에 주소를 그대로 씁니다. name을 주면 그 작업 세션만.',
    {name:string},[]]
].map(([name, description, properties, required]) => ({ name, description,
  inputSchema: { type: 'object', properties: { ...properties, conversation_id: { type: 'string', description: '호스트 연결 전용. 모델은 지정하지 않습니다.' }, agent_id: { type: 'string', description: '호스트 연결 전용. 모델은 지정하지 않습니다.' } }, required, additionalProperties: false } }));
// Project-level, not conversation-level: no conversation_id.
definitions.push({ name: 'project_setup', description: '프로젝트 첫 실행의 유일한 쓰기 도구. 사용자가 동의했을 때만 부릅니다. action=setup: 코어 지침을 .head/core.md에 쓰고 프로젝트 CLAUDE.md에 @.head/core.md 한 줄을 넣고(없으면 만들고, 있으면 중복 없이, 기존 내용 보존), 프로젝트 .claude/settings.json에 기본 포크를 켜는 env.CLAUDE_CODE_FORK_SUBAGENT="1"을 더하고(다른 설정은 그대로) 초기설정을 끝남으로 기록한 뒤 코어 지침 본문을 돌려줍니다. 이 대화부터 그 지침을 따르세요. action=never_ask: 사용자가 다시 묻지 말라고 한 단계(step=setup 또는 survey)를 기록합니다. action=survey_done: 프로젝트 조사를 끝남으로 기록합니다.',
  inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['setup', 'never_ask', 'survey_done'] }, step: { type: 'string', enum: ['setup', 'survey'] } }, required: ['action'], additionalProperties: false } });
const METHODS = { session_read: 'inspect', session_conversations: 'conversations' };
export function callTool(store, name, args, conversation_id, project) {
  const tool = definitions.find(t => t.name === name);
  if (!tool) throw new Error(`알 수 없는 도구: ${name}`);
  for (const [key, value] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[key];
    if (!schema || (schema.type === 'string' ? typeof value !== 'string' : schema.type==='boolean'?typeof value!=='boolean':!Number.isInteger(value)) || (schema.enum&&!schema.enum.includes(value)) || (schema.minimum!==undefined&&value<schema.minimum)) throw new Error(`유효하지 않은 인자: ${key}`);
  }
  for (const key of tool.inputSchema.required) if (!(key in args)) throw new Error(missing[name]?.[key] || `필수 인자: ${key}`);
  if (name === 'project_setup') return setupTool(project, args);
  const { agent_id, ...rest } = args;
  const writes = WRITES[name];
  if (agent_id && (typeof writes === 'function' ? writes(rest) : writes)) throw new Error(FORK_WRITE_REFUSED);
  return store[METHODS[name] || name.slice('session_'.length)]({ ...rest, conversation_id });
}
export async function serve({ project, host, conversationOf, options = {} }) {
  const store = sessions(project, { host, ...options });
  const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let request;
    try { request = JSON.parse(line); }
    catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    if (request.id === undefined) continue;
    const { id, method, params = {} } = request;
    if (method === 'initialize') send({ id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'head-context', version: '0.7.0' }, instructions } });
    else if (method === 'ping') send({ id, result: {} });
    else if (method === 'tools/list') send({ id, result: { tools: definitions } });
    else if (method === 'tools/call') {
      try { send({ id, result: { content: [{ type: 'text', text: callTool(store, params.name, params.arguments || {}, conversationOf(request), project) }] } }); }
      catch (error) { send({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    } else send({ id, error: { code: -32601, message: 'Method not found' } });
  }
}
