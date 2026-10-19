import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {optionalRead,atomicText,atomicJSON,noSymlink,locked} from './storage.mjs';
// Project first run. Two steps, each asked once per project: setup (core instructions
// into the project) and survey (asked only when the plugin carries its procedure).
// State lives in .head/config.json under first_run: {setup, survey}, each 'done' or 'never_ask'.
// Everything CLAUDE.md depends on is copied into the project, never pointed at the plugin path.
const plugin=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const CORE_SOURCE=path.join(plugin,'instructions','HEAD_CORE.md');
export const SURVEY_SOURCE=path.join(plugin,'instructions','survey.md');
export const IMPORT_LINE='@.head/core.md';
export const STEPS=['setup','survey'];
const VALUES=['done','never_ask'];
const files=project=>{if(!project||!path.isAbsolute(project))throw new Error('절대 프로젝트 경로가 필요합니다.');const root=path.join(project,'.head');return {root,config:noSymlink(path.join(root,'config.json')),core:noSymlink(path.join(root,'core.md')),claude:noSymlink(path.join(project,'CLAUDE.md')),settings:noSymlink(path.join(project,'.claude','settings.json'))};};
// The host's built-in fork (Agent tool, subagent_type "fork") is off unless this is set;
// the desktop app does not list it among the agent types either.
export const FORK_ENV='CLAUDE_CODE_FORK_SUBAGENT';
// The marketplace this plugin is published from. Setup writes it into the project settings
// with autoUpdate, so the host fetches new versions when it starts, and turns the plugin
// on for the project.
export const MARKETPLACE='head-agent-core',MARKETPLACE_REPO='Won6314/head-agent-core',PLUGIN_ID=`head-context@${MARKETPLACE}`;
const isObject=v=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
// Adds the fork switch, the marketplace (autoUpdate) and the plugin switch to the project
// settings, keeping every other key. A settings file that is not a JSON object is left
// alone and reported; a value already set is kept.
function projectSettings(file){
  const text=optionalRead(file);let settings={};
  const leave=why=>({fork:`${why}. 기본 포크를 쓰려면 env.${FORK_ENV}="1"을 직접 넣어 주세요`,market:`${why}. 자동 업데이트를 받으려면 extraKnownMarketplaces.${MARKETPLACE}와 enabledPlugins."${PLUGIN_ID}"를 직접 넣어 주세요`});
  if(text.trim()){try{settings=JSON.parse(text);}catch{return leave('읽을 수 없는 JSON이라 고치지 않았습니다');}
    if(!isObject(settings))return leave('JSON 객체가 아니라 고치지 않았습니다');}
  const next={...settings},added=[];let fork,market;
  if(settings.env!==undefined&&!isObject(settings.env))fork='env가 객체가 아니라 고치지 않았습니다';
  else if(settings.env?.[FORK_ENV]!==undefined)fork=settings.env[FORK_ENV]==='1'?'이미 있어 그대로 두었습니다':`이미 다른 값(${JSON.stringify(settings.env[FORK_ENV])})이 있어 그대로 두었습니다`;
  else{next.env={...(settings.env||{}),[FORK_ENV]:'1'};added.push('fork');fork=text.trim()?'기존 설정에 env 한 줄을 더했습니다':'새로 만들었습니다';}
  const parts=[];
  if(settings.extraKnownMarketplaces!==undefined&&!isObject(settings.extraKnownMarketplaces))parts.push('extraKnownMarketplaces가 객체가 아니라 마켓은 고치지 않았습니다');
  else if(settings.extraKnownMarketplaces?.[MARKETPLACE]!==undefined)parts.push('마켓은 이미 있어 그대로 두었습니다');
  else{next.extraKnownMarketplaces={...(settings.extraKnownMarketplaces||{}),[MARKETPLACE]:{source:{source:'github',repo:MARKETPLACE_REPO},autoUpdate:true}};added.push('market');parts.push('마켓을 더했습니다');}
  if(settings.enabledPlugins!==undefined&&!isObject(settings.enabledPlugins))parts.push('enabledPlugins가 객체가 아니라 플러그인 켜기는 고치지 않았습니다');
  else if(settings.enabledPlugins?.[PLUGIN_ID]!==undefined)parts.push(`플러그인 켜기는 이미 있어(${JSON.stringify(settings.enabledPlugins[PLUGIN_ID])}) 그대로 두었습니다`);
  else{next.enabledPlugins={...(settings.enabledPlugins||{}),[PLUGIN_ID]:true};added.push('plugin');parts.push('플러그인 켜기를 더했습니다');}
  market=parts.join(', ');
  if(added.length)atomicJSON(file,next);
  return {fork,market};
}
const readConfig=file=>JSON.parse(optionalRead(file)||'{}');
export function firstRun(project){const s=readConfig(files(project).config).first_run||{};return Object.fromEntries(STEPS.map(k=>[k,VALUES.includes(s[k])?s[k]:null]));}
function mark(project,step,value){
  if(!STEPS.includes(step))throw new Error(`알 수 없는 단계: ${step}`);
  const {config}=files(project);fs.mkdirSync(path.dirname(config),{recursive:true});
  locked(config,()=>{const c=readConfig(config);c.first_run={...(c.first_run||{}),[step]:value};atomicJSON(config,c);});
}
const surveyReady=()=>fs.existsSync(SURVEY_SOURCE);
const hasImport=text=>text.split(/\r?\n/).some(l=>l.trim()===IMPORT_LINE);
// Keeps the project copy equal to the plugin's core. CLAUDE.md is read before the
// start hook runs, so a refresh written here applies from the next start.
export function refreshCore(project){
  if(firstRun(project).setup!=='done')return false;
  const {core}=files(project),body=fs.readFileSync(CORE_SOURCE,'utf8');
  if(optionalRead(core)===body)return false;atomicText(core,body);return true;
}
const surveyQuestion=()=>`"프로젝트 조사해볼까요?"를 물으세요. 예면 ${SURVEY_SOURCE} 절차를 따르고 끝나면 project_setup(action=survey_done). 아니오면 "다시는 묻지 않을까요?"를 물어 예일 때만 project_setup(action=never_ask, step=survey).`;
// Start-hook guide, kept short to stay inside the hook cap together with the identity.
export function guide(project){
  const s=firstRun(project);
  if(!s.setup)return `# 프로젝트 첫 실행 (head-context)\n이 프로젝트는 초기설정 전입니다. 사용자의 첫 입력에 답하기 전에 먼저 짧게 "초기설정 해도 될까요?"를 물으세요. 초기설정은 HEAD 코어 지침을 \`.head/core.md\`에 두고, 프로젝트 CLAUDE.md에 \`${IMPORT_LINE}\` 한 줄을 넣고, 프로젝트 \`.claude/settings.json\`에 기본 포크를 켜는 env 한 줄과, 새 판을 자동으로 받도록 이 플러그인의 마켓(GitHub ${MARKETPLACE_REPO})과 플러그인 켜기를 넣습니다(파일이 없으면 만들고 기존 내용은 그대로 둡니다).\n- 예: project_setup(action=setup)을 부르고, 돌려받은 코어 지침을 이 대화부터 따르세요.\n- 아니오: "다시는 묻지 않을까요?"를 물으세요. 예면 project_setup(action=never_ask, step=setup), 아니오면 아무것도 기록하지 않습니다(다음 시작에 다시 묻습니다).\n답을 받은 뒤 사용자의 원래 이야기로 이어가세요. 파일은 직접 쓰지 말고 이 도구만 쓰세요.`;
  if(s.setup==='done'&&!s.survey&&surveyReady())return `# 프로젝트 조사 (head-context)\n사용자의 첫 입력에 답하기 전에 먼저 짧게 ${surveyQuestion()} 답을 받은 뒤 원래 이야기로 이어가세요.`;
  return '';
}
// The one writer of the project files. The LLM guides; this code writes.
export function setupTool(project,{action,step}){
  if(action==='never_ask'){if(!STEPS.includes(step))throw new Error('never_ask에는 step(setup 또는 survey)이 필요합니다.');mark(project,step,'never_ask');return `이 프로젝트에서는 ${step==='setup'?'초기설정':'프로젝트 조사'}을 다시 묻지 않습니다. 기록: .head/config.json first_run.${step}=never_ask`;}
  if(action==='survey_done'){mark(project,'survey','done');return '프로젝트 조사를 끝남으로 기록했습니다.';}
  if(action!=='setup')throw new Error('action은 setup, never_ask, survey_done 중 하나입니다.');
  const f=files(project),body=fs.readFileSync(CORE_SOURCE,'utf8');
  fs.mkdirSync(f.root,{recursive:true});atomicText(f.core,body);
  const before=optionalRead(f.claude);let claude;
  if(hasImport(before))claude='이미 있어 그대로 두었습니다';
  else{atomicText(f.claude,before?`${before}${before.endsWith('\n')?'':'\n'}\n${IMPORT_LINE}\n`:`${IMPORT_LINE}\n`);claude=before?'기존 내용 끝에 한 줄을 더했습니다':'새로 만들었습니다';}
  const {fork,market}=projectSettings(f.settings);
  mark(project,'setup','done');
  const next=surveyReady()&&firstRun(project).survey===null?`\n\n이어서 ${surveyQuestion()}`:'';
  return `초기설정을 마쳤습니다.\n- .head/core.md: 코어 지침을 썼습니다.\n- CLAUDE.md의 \`${IMPORT_LINE}\`: ${claude}.\n- .claude/settings.json의 env.${FORK_ENV}="1"(기본 포크 켜기): ${fork}.\n- .claude/settings.json의 마켓 ${MARKETPLACE}(GitHub ${MARKETPLACE_REPO}, 자동 업데이트)와 enabledPlugins."${PLUGIN_ID}": ${market}.\n- 다음 시작부터는 CLAUDE.md로 코어 지침이 들어가고 기본 포크가 켜지며, 앱이 시작할 때 새 판을 받습니다. 이 대화에서는 아래 코어 지침을 지금부터 따르세요.${next}\n\n${body}`;
}
