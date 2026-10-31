import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export function validName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9가-힣._-]+$/.test(value) || value.includes('..') || value === '.')
    throw new Error('이름은 영문·숫자·한글·._-만 허용하며 ..와 경로 구분자는 금지합니다.');
  return value;
}
export function optionalRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}
// Three ways to read a JSON file of the plugin's, by whose file it is and what a broken one
// costs:
//   readSettings — .head/config.json, which a person edits: missing is {}, broken stops with
//     what to fix (going on would put records in the wrong place).
//   readState — this plugin's own records: a missing (or empty) file is the fallback; a broken
//     one is moved aside (<file>.broken-<time>) and read as missing, and the model is told
//     (takeNotices). Without a fallback the file must be there and whole.
//   readLoose — another app's files and files that live only a moment (registries,
//     presence, keys): missing, broken or not an object is null.
const notices = [];
// What was set right on the way (broken records moved aside), for the next hook output or
// tool answer to tell the model. Taken once.
export const takeNotices = () => notices.splice(0);
function setAside(file, error) {
  const aside = `${file}.broken-${Date.now()}`;
  fs.renameSync(file, aside);
  notices.push(
    `head-context: 읽을 수 없는 기록 파일을 옮겨 두고 없는 것으로 처리했습니다: ${aside} (${readError(error)})`,
  );
}
export function readSettings(file) {
  const text = optionalRead(file);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(
      `설정 파일을 읽을 수 없습니다(JSON 오류). 고치기 전에는 기록 위치를 알 수 없어 기록을 읽거나 쓰지 않습니다: ${file} (${readError(e)})`,
      { cause: e },
    );
  }
}
export function readState(file, fallback) {
  if (fallback === undefined) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const text = optionalRead(file);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    setAside(file, e);
    return fallback;
  }
}
// The last bytes of a file (all of it when smaller), as text: an app's records grow long and
// only their end is wanted. Its first line may be cut. null when the file cannot be read.
export function readTail(file, bytes) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size,
        length = Math.min(size, bytes),
        data = Buffer.alloc(length);
      fs.readSync(fd, data, 0, length, size - length);
      return data.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null; // not there or not readable: the caller decides what that means
  }
}
export function readLoose(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
} // missing or broken: null, by design
// Resolve only the trusted project boundary, never .head or a record path: resolving
// those would hide the very links noSymlink must reject. Host cwd stays unchanged.
export function projectRoot(project) {
  if (!project || !path.isAbsolute(project)) throw new Error('절대 프로젝트 경로가 필요합니다.');
  return fs.realpathSync(project);
}
export function noSymlink(file) {
  for (let p = path.resolve(file); ; p = path.dirname(p)) {
    if (fs.lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink())
      throw new Error(`심볼릭 링크는 허용하지 않습니다: ${p}`);
    if (path.dirname(p) === p) break;
  }
  return file;
}
export function atomicText(file, text) {
  noSymlink(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, text, { flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export const atomicJSON = (file, value) => atomicText(file, JSON.stringify(value, null, 2) + '\n');
export function locations(project) {
  const actual = projectRoot(project),
    root = noSymlink(path.join(actual, '.head'));
  const config = readSettings(noSymlink(path.join(root, 'config.json')));
  if (config.sessions_dir !== undefined && (typeof config.sessions_dir !== 'string' || !config.sessions_dir))
    throw new Error('sessions_dir는 비어 있지 않은 경로여야 합니다.');
  if (config.standby_days !== undefined && (typeof config.standby_days !== 'number' || !(config.standby_days >= 0)))
    throw new Error('standby_days는 0 이상의 숫자여야 합니다.');
  if (config.timezone !== undefined) {
    try {
      if (typeof config.timezone !== 'string') throw 0;
      new Intl.DateTimeFormat('en', { timeZone: config.timezone });
    } catch {
      throw new Error('timezone은 IANA 시간대 이름이어야 합니다 (예: Asia/Seoul).');
    }
  }
  // An absolute sessions_dir may spell the host's original project path, or a
  // sibling under the same shortcut. Resolve only their shared project ancestor;
  // never the record folder or a path component below that trusted boundary.
  let topics = path.resolve(actual, config.sessions_dir || '.head/sessions');
  if (config.sessions_dir && path.isAbsolute(config.sessions_dir)) {
    let ancestor = path.resolve(project),
      relative = path.relative(ancestor, topics);
    while (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
      relative = path.relative(ancestor, topics);
    }
    topics = path.resolve(projectRoot(ancestor), relative);
  }
  return {
    root,
    topics: noSymlink(topics),
    state: path.join(root, 'state'),
    standbyDays: config.standby_days,
    timezone: config.timezone,
  };
}
export function recordFile(state, kind, id, host) {
  if (typeof host !== 'string' || !/^[a-z][a-z0-9]*$/.test(host)) throw new Error('호스트 이름이 유효하지 않습니다.');
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('대화 ID가 유효하지 않습니다.');
  return noSymlink(path.join(state, kind, `${host}-${id}.json`));
}
// The folder is checked whole once; each file in it only for itself.
const ownFile = (file) => {
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error(`심볼릭 링크는 허용하지 않습니다: ${file}`);
  return file;
};
// Every record of a folder. A broken one is left out: moved aside and told (readState), or
// with loose (files that live only a moment) just skipped.
export function records(dir, { loose = false } = {}) {
  noSymlink(dir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const file = ownFile(path.join(dir, f));
      let v;
      try {
        v = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        if (!loose) setAside(file, e);
        return [];
      }
      return [
        { ...v, host: v?.host || f.match(/^([a-z][a-z0-9]*)-/)?.[1], liveness: v?.liveness || v?.process || null },
      ];
    });
}
export const readError = (e) => String(e.message).replace(/[\r\n]+/g, ' ');
export function line(value, label) {
  if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value))
    throw new Error(`${label}는 비어 있지 않은 한 줄이어야 합니다.`);
  return value.trim();
}
// A checkpoint is time, summary, body and an optional next line. Only branch
// close/abandon entries carry the tool-written marker lines (status/branch/record/reason)
// that the graph turns into merge edges and the map shows as one higher-level event, and
// only a main-line index entry carries the tool-written 이름표/본문 line.
export function entry({
  summary,
  history = '',
  next,
  status,
  branch,
  record,
  reason,
  index,
  timestamp = new Date().toISOString(),
}) {
  summary = line(summary, 'summary');
  if (next !== undefined && next !== null && next !== '' && (typeof next !== 'string' || /[\r\n]/.test(next)))
    throw new Error('next는 한 줄이어야 합니다.');
  next = typeof next === 'string' ? next.trim() : '';
  if (
    typeof history !== 'string' ||
    /^##[ \t]+\d{4}-\d{2}-\d{2}|^(요약:|상태:|다음:|브랜치:|기록:|이유:|이름표:)/m.test(history)
  )
    throw new Error('본문에 기록 제목 또는 예약 줄을 넣을 수 없습니다.');
  // The main line keeps one index line per save: the label and the file holding the body.
  const marker = `${status ? `상태: ${status}\n${branch ? `브랜치: ${validName(branch)}\n` : ''}${record ? `기록: ${record}\n` : ''}${reason ? `이유: ${line(reason, 'reason')}\n` : ''}` : ''}${index ? `이름표: ${line(index.label, 'label')} · 본문: ${index.record}\n` : ''}`;
  return `\n\n## ${timestamp}\n\n요약: ${summary}\n${marker}\n${history.trim()}\n${next ? `\n다음: ${next}\n` : ''}\n`;
}
