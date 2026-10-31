import path from 'node:path';
import {validName,line} from './storage.mjs';
const BRANCH_MARKER='<!-- head-context branch:1 -->';
const RECAP_HEADING='## 지금까지 요약';
export function branchPath(dir,name){return path.join(dir,'work',validName(name),'history.md');}
// A branch file: marker, name, the header fields, then — when the last save had no
// next — the recap of everything done on this branch, then its own checkpoints.
// 이름표 is the label; 주제 is the field earlier versions wrote and is still read.
export function branchText({name,label,session,parent,anchor,anchorId,started=new Date().toISOString()}){
  return `${BRANCH_MARKER}\n# ${name}\n\n이름표: ${line(label,'label')}\n시작: ${started}\n갈래: ${session}/${parent==='main'?'메인':parent}@${anchor||'없음'}\n갈래-ID: ${anchorId||''}\n상태: 열림\n`;
}
const fieldEnd=text=>{
  const heading=text.match(/^##[ \t]+\d{4}-\d{2}-\d{2}/m),recap=text.indexOf(`\n${RECAP_HEADING}`);
  return Math.min(heading?heading.index:text.length,recap<0?text.length:recap+1);
};
export function branchHeader(text){
  if(!text.startsWith(BRANCH_MARKER+'\n'))return null;
  const heading=text.match(/^##[ \t]+\d{4}-\d{2}-\d{2}/m),end=heading?.index??text.length,header=text.slice(0,fieldEnd(text));
  const field=key=>header.split('\n').find(l=>l.startsWith(key+':'))?.slice(key.length+1).trim()||'';
  const origin=field('갈래').match(/^([^/]+)\/([^@]+)@(.+)$/);
  if(!origin)throw new Error('브랜치 갈래 형식이 잘못됐습니다.');
  const recapStart=text.indexOf(`\n${RECAP_HEADING}`);
  const recap=recapStart<0?'':text.slice(recapStart+RECAP_HEADING.length+1,end).trim();
  return {label:field('이름표')||field('주제'),topic:field('이름표')||field('주제'),started:field('시작'),status:field('상태')||'열림',
    parent:origin[2]==='메인'?'main':origin[2],anchor:origin[3]==='없음'?null:origin[3],anchor_id:field('갈래-ID')||null,recap,end};
}
// Header edits keep the checkpoints untouched: only the field value or the recap block
// is replaced, so the file stays the record and the index re-reads it unchanged.
export const withStatus=(text,status)=>text.replace(/^상태: .*$/m,`상태: ${status}`);
export function withRecap(text,recap){
  const body=String(recap).trim(),heading=text.match(/^##[ \t]+\d{4}-\d{2}-\d{2}/m),end=heading?.index??text.length;
  const start=text.indexOf(`\n${RECAP_HEADING}`);
  const header=(start<0?text.slice(0,end):text.slice(0,start+1)).replace(/\n+$/,'\n');
  return `${header}\n${RECAP_HEADING}\n\n${body}\n\n${text.slice(end).replace(/^\n+/,'')}`;
}
