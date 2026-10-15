import readline from 'node:readline';
import { sessions, CONTEXT_REQUIRED } from './sessions.mjs';
import { setupTool } from './project.mjs';
export const instructions = '세션은 큰 작업 주제이고, 메인은 그 안의 일이 시간순으로 쌓이는 곳입니다. 세션 로드(시작 훅·session_load)는 세션 정체성을 줍니다: context.md, 열린 브랜치, 지난 기록 요약, 최근 기록 5건의 시각과 본문, 마지막 기록의 다음 줄. 재개는 이미 맥락이 있으므로 다시 로드하지 않고, /clear와 압축은 처음 시작과 같이 다시 로드합니다. 로드가 훅에 다 들어가지 않으면 같은 내용이 head-context 채널 메시지로 이어서 들어옵니다. 그 메시지는 응답이 필요 없는 정체성 자료이며, 들어오지 않았는데 필요하면 session_load를 호출하세요. 브랜치는 별도 작업을 동시에 진행할 때만 쓰는 선택 사항입니다. 열린 브랜치가 있어 어디로 이어갈지 모르면 사용자에게 평소 말로 물으세요(예: 이 세션에 진행 중인 작업이 여러 개 있는데 어떤 걸 이어갈까요?). session_save는 지금 자리에 요약 한 줄·본문·다음(선택, 있으면 이어갈 일이 있다는 뜻)을 저장합니다. 본문은 작업 요약, 근거 파일 링크와 그 내용, 파일에 빠진 내용입니다. session_branch create/attach/main/abandon과 session_finish는 브랜치를 다룹니다. 이동 응답이 끝낼지 열어둘지 묻도록 하면 연결은 아직 바뀌지 않은 것입니다: 사용자에게 묻고 끝내면 session_finish, 열어두면 같은 호출에 keep_open=true를 주세요. session_read map/recent/entry/find는 연결을 바꾸지 않는 조회이며 다른 세션도 읽을 수 있습니다. session_create는 사용자와 정한 목적을 context로 받아야 합니다. context.md는 사용자 동의 없이 고치지 않습니다. ID는 호스트가 채우므로 모델은 지정하지 않습니다. 프로젝트 첫 실행: 시작 안내가 초기설정(코어 지침 .head/core.md + 프로젝트 CLAUDE.md의 @.head/core.md 한 줄)이나 프로젝트 조사를 물으라고 하면 사용자의 첫 입력에서 먼저 짧게 묻고 원래 이야기로 이어가세요. 거절하면 다시는 묻지 않을지 묻습니다. 이 파일들은 직접 쓰지 말고 project_setup으로만 씁니다.';
const string = { type: 'string' };
// 필수 인자가 빠졌을 때 이유까지 알리는 문구. 없으면 일반 문구를 쓴다.
const missing = { session_create: { context: CONTEXT_REQUIRED } };
export const definitions = [
  ['session_list', '세션과 그래프의 짧은 지도를 읽습니다.', {}, []],
  ['session_load', '세션을 정하고 이 대화에 붙인 뒤 세션 정체성을 돌려줍니다: context.md, 열린 브랜치, 지난 기록 요약, 최근 기록의 시각·본문, 마지막 다음 줄. name 생략은 지금 자리. branch=main은 메인. 닫힌 브랜치는 읽기 전용.',
    { name: string, branch:string, history_count: { type: 'integer', minimum: 0, default: 5 },map_limit:{type:'integer',minimum:0,default:30,description:'지난 기록 요약 줄 최대 수. 0은 전체.'},keep_open:{type:'boolean',description:'사용자가 이전 브랜치를 열어두기로 답한 이동에만 true.'} }, []],
  ['session_create', '새 세션과 사용자 방향을 만들고 현재 대화에 묶습니다. context(방향)는 필수이며 없거나 공백뿐이면 세션을 만들지 않고 거절합니다. 기존 파일은 덮어쓰지 않습니다.',
    { name: string, context: { type: 'string', description: '필수. 사용자와 정한 이 세션의 목적·방향. 비어 있으면 만들지 않습니다.' },keep_open:{type:'boolean',description:'사용자가 이전 브랜치를 열어두기로 답한 경우만 true.'} }, ['name', 'context']],
  ['session_save', '지금 자리(메인 또는 브랜치)에 체크포인트를 저장하고 그래프도 갱신합니다. summary는 한 줄 요약, history는 본문, next는 선택(이어갈 일이 있을 때만 한 줄).',
    { summary: string, history: string, next: string }, ['summary', 'history']],
  ['session_finish', '사용자가 끝냈다고 한 브랜치의 정리 항목을 메인에 1개 합치고 대화는 메인으로 돌아옵니다. 정리 summary/history를 대화에 먼저 보여주세요. 메인에서의 옛 호출은 마무리 체크포인트만 저장합니다.',
    {branch:string, summary: string, history: string, next: string }, []],
  ['session_branch','브랜치 create/attach/main/abandon. create는 부모 마지막 체크포인트 위치만 가리키며 복사하지 않습니다. topic은 사용자 첫 지시 첫 줄. branch 이름 생략은 자동, parent 생략은 지금 자리. abandon은 reason 필수.',
    {action:{type:'string',enum:['create','attach','main','abandon']},branch:string,topic:string,parent:string,summary:string,history:string,next:string,reason:string,keep_open:{type:'boolean',description:'main/다른 attach에서 사용자가 이전 브랜치를 열어두기로 답한 경우만 true.'}},['action']],
  ['session_read','연결을 바꾸지 않고 그래프로 map/recent/entry/find를 읽습니다. map name은 다른 세션 보기, branch는 그 줄기(부모 포함). limit는 최근 지도/결과 건수, 0 전체. entry는 지도 ID. find file은 기존 파일을 가리키는 항목, query는 파일 본문 낱말 검색.',
    {action:{type:'string',enum:['map','recent','entry','find']},name:string,branch:string,limit:{type:'integer',minimum:0,default:30},count:{type:'integer',minimum:0,default:5},id:string,file:string,query:string},['action']]
].map(([name, description, properties, required]) => ({ name, description,
  inputSchema: { type: 'object', properties: { ...properties, conversation_id: { type: 'string', description: '호스트 연결 전용. 모델은 지정하지 않습니다.' } }, required, additionalProperties: false } }));
// Project-level, not conversation-level: no conversation_id.
definitions.push({ name: 'project_setup', description: '프로젝트 첫 실행의 유일한 쓰기 도구. 사용자가 동의했을 때만 부릅니다. action=setup: 코어 지침을 .head/core.md에 쓰고 프로젝트 CLAUDE.md에 @.head/core.md 한 줄을 넣고(없으면 만들고, 있으면 중복 없이, 기존 내용 보존) 초기설정을 끝남으로 기록한 뒤 코어 지침 본문을 돌려줍니다. 이 대화부터 그 지침을 따르세요. action=never_ask: 사용자가 다시 묻지 말라고 한 단계(step=setup 또는 survey)를 기록합니다. action=survey_done: 프로젝트 조사를 끝남으로 기록합니다.',
  inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['setup', 'never_ask', 'survey_done'] }, step: { type: 'string', enum: ['setup', 'survey'] } }, required: ['action'], additionalProperties: false } });
export function callTool(store, name, args, conversation_id, project) {
  const tool = definitions.find(t => t.name === name);
  if (!tool) throw new Error(`알 수 없는 도구: ${name}`);
  for (const [key, value] of Object.entries(args)) {
    const schema = tool.inputSchema.properties[key];
    if (!schema || (schema.type === 'string' ? typeof value !== 'string' : schema.type==='boolean'?typeof value!=='boolean':!Number.isInteger(value)) || (schema.enum&&!schema.enum.includes(value)) || (schema.minimum!==undefined&&value<schema.minimum)) throw new Error(`유효하지 않은 인자: ${key}`);
  }
  for (const key of tool.inputSchema.required) if (!(key in args)) throw new Error(missing[name]?.[key] || `필수 인자: ${key}`);
  if (name === 'project_setup') return setupTool(project, args);
  return store[name==='session_read'?'inspect':name.slice('session_'.length)]({ ...args, conversation_id });
}
// channel (optional): {start(emit)} — called once the client finished initializing;
// emit(content, meta) sends a claude/channel notification that the host turns into a turn.
export async function serve({ project, host, conversationOf, channel }) {
  const store = sessions(project, { host });
  const send = message => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  for await (const line of readline.createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    let request;
    try { request = JSON.parse(line); }
    catch { send({ id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    if (request.id === undefined) {
      if (request.method === 'notifications/initialized' && channel) channel.start((content, meta = {}) => send({ method: 'notifications/claude/channel', params: { content, meta } }));
      continue;
    }
    const { id, method, params = {} } = request;
    if (method === 'initialize') send({ id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {}, ...(channel ? { experimental: { 'claude/channel': {} } } : {}) }, serverInfo: { name: 'head-context', version: '0.5.0' }, instructions } });
    else if (method === 'ping') send({ id, result: {} });
    else if (method === 'tools/list') send({ id, result: { tools: definitions } });
    else if (method === 'tools/call') {
      try { send({ id, result: { content: [{ type: 'text', text: callTool(store, params.name, params.arguments || {}, conversationOf(request), project) }] } }); }
      catch (error) { send({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    } else send({ id, error: { code: -32601, message: 'Method not found' } });
  }
}
