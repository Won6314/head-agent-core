import path from 'node:path';
import {validName} from './storage.mjs';
export const BRANCH_MARKER='<!-- head-context branch:1 -->';
export const firstLine=value=>String(value||'').split(/\r?\n/)[0].trim();
export function branchPath(dir,name){return path.join(dir,'work',validName(name),'history.md');}
export function branchHeader(text){
  if(!text.startsWith(BRANCH_MARKER+'\n'))return null;
  const match=text.match(/^##[ \t]+\d{4}-\d{2}-\d{2}/m), end=match?.index??text.length, header=text.slice(0,end);
  const field=key=>header.split('\n').find(l=>l.startsWith(key+':'))?.slice(key.length+1).trim()||'';
  const origin=field('갈래').match(/^([^/]+)\/([^@]+)@(.+)$/);
  if(!origin)throw new Error('브랜치 갈래 형식이 잘못됐습니다.');
  return {topic:field('주제'),started:field('시작'),status:field('상태')||'열림',parent:origin[2]==='메인'?'main':origin[2],anchor:origin[3]==='없음'?null:origin[3],anchor_id:field('갈래-ID')||null,end};
}
