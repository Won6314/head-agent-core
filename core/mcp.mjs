import readline from 'node:readline';
import { sessions, CONTEXT_REQUIRED } from './sessions.mjs';
import { setupTool } from './project.mjs';
export const instructions = '세션은 큰 작업 주제입니다. 세션에 연결된 대화는 저마다 자기 브랜치(자리)에서 일하고, 코어가 그 브랜치를 자동으로 만들고 이름 붙이고 닫습니다. 메인(history.md)은 색인입니다: 저장할 때마다 시각·이름표·요약·본문 링크 한 줄이 메인에 남고, 본문은 그 대화의 브랜치 파일에 쌓입니다. 세션 로드(시작 훅·session_load)는 지금 자리의 정체성을 줍니다: context.md, 메인 색인 요약 줄, 이 자리의 지금까지 요약, 최근 기록의 시각·본문, 마지막 다음 줄, 그리고 다른 자리의 남은 일. 재개는 이미 맥락이 있으므로 다시 로드하지 않고, /clear와 압축은 처음 시작과 같이 다시 로드합니다. 시작 안내가 로드가 훅 상한을 넘었다고 하면 session_load를 호출해 받으세요(채널이 열린 호스트에서는 같은 내용이 메시지로 먼저 올 수도 있습니다). session_save는 지금 자리에 요약 한 줄·본문·다음(선택)을 저장합니다. 본문은 작업 요약, 근거 파일 링크와 그 내용, 파일에 빠진 내용입니다. 이어갈 일이 남았으면 next를 주세요. 이어갈 일이 없으면 next를 비우고 recap(지금까지 요약)을 반드시 주세요: 그 자리에서 한 일 전체를 정리한 글이며 브랜치 첫머리에 덮어써집니다. next와 recap은 함께 줄 수 없습니다. 브랜치의 상태(진행 중·남은 일·내려감·끝남)는 코어가 계산합니다. 모델도 사용자도 정하지 않습니다. 대화가 끝나면 코어가 메인에 합쳐짐 항목 하나를 자동으로 씁니다. session_finish는 지금 자리를 지금 닫고(메인에 합쳐짐 1개) 이 대화에 새 자리를 줍니다. 다른 주제로 넘어갈 때만 쓰고, 보통은 저장만 하면 됩니다. session_branch create는 이 대화의 자리를 새로 가르고, attach는 남은 일이 있는 자리를 이어받고, abandon은 사용자가 그만둔 자리를 이유와 함께 중단합니다. 살아 있는 대화가 붙은 자리에는 붙을 수 없습니다. 로드에 남은 일이 보이면 사용자에게 한 번만 물으세요: "○○의 \'이름표\' 이어서 할까요?" 예라면 session_branch(action="attach", branch=…), 아니면 지금 자리에서 계속합니다. session_read map/recent/entry/find는 연결을 바꾸지 않는 조회이며 다른 세션도 읽을 수 있습니다. session_create는 사용자와 정한 목적을 context로 받아야 합니다. context.md에는 작업 주제만 둡니다. 일의 진행·결과·파일은 session_save로 기록하고 context.md에 쓰지 않습니다. context.md는 사용자 동의 없이 고치지 않습니다. ID는 호스트가 채우므로 모델은 지정하지 않습니다. 작업 주제 맞추기: 사용자는 작업 주제(세션)를 몰라도 됩니다. 맞추는 것은 당신의 일입니다. 아직 작업 주제가 없는 대화에서 사용자가 기록할 만한 일(이어서 할 작업, 결과물이나 결정이 남는 일)을 말하면 session_list로 작업 주제 목록을 불러와 맞춰 보세요. 작업 주제가 한 번 정해진 대화는 그대로 갑니다. 맞는 주제가 있으면 "이거 ○○ 작업 맞나요?"라고 묻고, 맞다면 session_load로 불러오세요. 없으면 사용자의 말로 이름과 한 문장을 지어 "새 작업 주제로 만들까요? ○○ — (한 문장)"이라고 묻고, 좋다면 session_create로 만드세요. 단순한 질문이나 짧은 대화에는 묻지 말고 그냥 답하세요. 이 판단은 답에 쓰지 않습니다. 사용자에게 묻는 것은 작업 주제뿐입니다. "세션"·"브랜치"·자리 고르기를 사용자에게 들이밀지 말고 "작업 주제"라고 하세요. 초기설정 질문이 있으면 그것을 먼저 묻습니다. 프로젝트 첫 실행: 시작 안내가 초기설정(코어 지침 .head/core.md + 프로젝트 CLAUDE.md의 @.head/core.md 한 줄)이나 프로젝트 조사를 물으라고 하면 사용자의 첫 입력에서 먼저 짧게 묻고 원래 이야기로 이어가세요. 거절하면 다시는 묻지 않을지 묻습니다. 이 파일들은 직접 쓰지 말고 project_setup으로만 씁니다.';
const string = { type: 'string' };
// 필수 인자가 빠졌을 때 이유까지 알리는 문구. 없으면 일반 문구를 쓴다.
const missing = { session_create: { context: CONTEXT_REQUIRED } };
export const definitions = [
  ['session_list', '작업 주제 목록을 읽습니다: 이름, context.md 첫 문장, 최신 기록 요약, 남은 일 수를 최근 기록 순으로. 기록 지도는 session_read map입니다.', {}, []],
  ['session_load', '세션을 정하고 이 대화를 그 세션의 자기 자리(브랜치)에 붙인 뒤 정체성을 돌려줍니다: context.md, 메인 색인 요약 줄, 이 자리의 지금까지 요약, 최근 기록의 시각·본문, 마지막 다음, 다른 자리의 남은 일. 처음 붙는 대화는 자리가 자동으로 생기고, 이미 자리가 있으면 그 자리를 그대로 씁니다. branch를 주면 그 자리를 이어받습니다(살아 있는 대화가 붙은 자리는 거절). branch=main은 메인 색인 조회용입니다.',
    { name: string, branch:string, history_count: { type: 'integer', minimum: 0, default: 5 },map_limit:{type:'integer',minimum:0,default:30,description:'메인 색인 요약 줄 최대 수. 0은 전체.'} }, []],
  ['session_create', '새 세션과 사용자 방향을 만들고 현재 대화를 그 세션의 새 자리에 묶습니다. context(방향)는 필수이며 없거나 공백뿐이면 세션을 만들지 않고 거절합니다. 기존 파일은 덮어쓰지 않습니다. context는 context.md 본문입니다. 첫 줄은 `# 이름`, 바로 아래에는 이 주제가 무엇을 하는지 한 문장을 씁니다(작업 주제 목록에 그대로 나갑니다). 그 아래에는 방향·전제·범위·다른 주제와의 경계 중 정해진 것만 둡니다. 진행 상황·최근 작업·파일 목록은 쓰지 않습니다.',
    { name: string, context: { type: 'string', description: '필수. 사용자와 정한 이 세션의 목적·방향. 비어 있으면 만들지 않습니다.' } }, ['name', 'context']],
  ['session_save', '지금 자리에 체크포인트를 저장합니다. 본문은 이 자리의 브랜치 파일에, 메인에는 시각·이름표·요약·본문 링크 한 줄이 색인으로 남습니다. summary는 한 줄 요약(이름표도 이 줄로 갱신됩니다), history는 본문, next는 이어갈 일이 있을 때만 한 줄. next가 없으면 recap(지금까지 요약)이 필수이고, next가 있으면 recap을 줄 수 없습니다.',
    { summary: string, history: string, next: string, recap: { type: 'string', description: '다음이 없는 저장에만. 이 자리에서 한 일 전체 정리. 브랜치 첫머리에 덮어씁니다.' } }, ['summary', 'history']],
  ['session_finish', '지금 자리(또는 branch로 지정한 자리)를 지금 닫습니다. 코어가 메인에 합쳐짐 항목 1개를 쓰고(끝남 또는 멈춤은 마지막 저장의 다음 여부로 계산), 지금 자리를 닫았으면 이 대화는 새 자리로 이어갑니다. 요약·본문은 받지 않습니다: 저장된 기록에서 코어가 만듭니다.',
    {branch:string}, []],
  ['session_branch','자리 다루기. create는 이 대화의 자리를 새로 갈라 붙습니다(label은 이름표, parent 생략은 지금 자리). attach는 branch로 지정한 남은 일 자리를 이어받습니다. abandon은 사용자가 그만둔 자리를 중단하며 reason이 필수입니다. 떠난 자리는 저장이 없으면 버리고, 있으면 메인에 합쳐집니다.',
    {action:{type:'string',enum:['create','attach','abandon']},branch:string,label:string,parent:string,reason:string},['action']],
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
    if (method === 'initialize') send({ id, result: { protocolVersion: params.protocolVersion, capabilities: { tools: {}, ...(channel ? { experimental: { 'claude/channel': {} } } : {}) }, serverInfo: { name: 'head-context', version: '0.6.0' }, instructions } });
    else if (method === 'ping') send({ id, result: {} });
    else if (method === 'tools/list') send({ id, result: { tools: definitions } });
    else if (method === 'tools/call') {
      try { send({ id, result: { content: [{ type: 'text', text: callTool(store, params.name, params.arguments || {}, conversationOf(request), project) }] } }); }
      catch (error) { send({ id, result: { isError: true, content: [{ type: 'text', text: error.message }] } }); }
    } else send({ id, error: { code: -32601, message: 'Method not found' } });
  }
}
