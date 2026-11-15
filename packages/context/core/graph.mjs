import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { locations, validName, noSymlink, readError } from './storage.mjs';
import { locked } from './lock.mjs';
import { parseHistory } from './history.mjs';
import { branchHeader } from './branch-format.mjs';
import { renderMap, shortIds, matchShort } from './map-view.mjs';
import { sqlite } from './platform.mjs';

// node:sqlite is loaded on first use (platform.mjs): an older Node gets the reason, not a crash at import.
const database = (file) => new (sqlite().DatabaseSync)(file, { timeout: 5000 });
const VERSION = 4; // Rebuildable raw-text cache, separate from the v3 index.
const NODE_FIELDS = 'id,kind,session,stem,stamp,file,hash,seq';
const JOIN_NODE_FIELDS = NODE_FIELDS.split(',').map((field) => 'n.' + field).join(',');
export const stemId = (session, stem) => `stem:${encodeURIComponent(session)}/${encodeURIComponent(stem)}`;
export const checkpointId = (session, stem, time, occurrence = 1) =>
  `${encodeURIComponent(session)}/${encodeURIComponent(stem)}@${time}${occurrence > 1 ? '#' + occurrence : ''}`;
// One path as written in a record or a file, to an existing file: a link target or a
// backtick path, without its title, anchor or trailing punctuation; URLs are not files;
// `~/` is the home folder; a relative path is tried against each folder in turn.
export function resolveRef(value, dirs) {
  value = value
    .replace(/^<|>$/g, '')
    .replace(/\s+["'].*$/, '')
    .split('#')[0]
    .replace(/[,;。]+$/, '');
  if (!value || /^[a-z]+:\/\//i.test(value)) return null;
  try {
    value = decodeURIComponent(value);
  } catch {
    /* not %-encoded: the link as written */
  }
  if (value.startsWith('~/')) value = path.join(os.homedir(), value.slice(2));
  for (const dir of dirs) {
    try {
      const file = path.resolve(dir, value);
      if (fs.statSync(file).isFile()) return file;
    } catch {
      /* not there: the next folder */
    }
  }
  return null;
}
const linked = (body) => [
  ...[...body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]),
  ...[...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]),
];
// What a record points at (the points edges): links and backtick paths only, resolved
// against the session folder. A file name merely mentioned in the text is not a pointer.
// A save's links: from the file it is in (a branch file's links climb back up), then
// from the work session folder (how saves were written before 0.7.1, and how main's are).
function references(body, dirs) {
  return [
    ...new Set(
      linked(body)
        .map((value) => resolveRef(value, dirs))
        .filter(Boolean),
    ),
  ];
}
// What a file points at, for read files: only links and backtick paths, resolved
// against the file's own folder and then its session folder. Over 1MB or not text: none.
export const LINK_BYTES = 1024 * 1024;
function fileReferences(file, text, sessionDir) {
  const dirs = [path.dirname(file), ...(sessionDir ? [sessionDir] : [])];
  return [
    ...new Set(
      linked(text)
        .map((value) => resolveRef(value, dirs))
        .filter((f) => f && f !== file),
    ),
  ];
}
function schema(db) {
  db.exec(
    'DROP TABLE IF EXISTS edges; DROP TABLE IF EXISTS nodes; DROP TABLE IF EXISTS files; DROP TABLE IF EXISTS links; DROP TABLE IF EXISTS linkfiles;',
  );
  db.exec(`CREATE TABLE files(path TEXT PRIMARY KEY,mtime REAL NOT NULL,size INTEGER NOT NULL);
    CREATE TABLE nodes(id TEXT PRIMARY KEY,kind TEXT NOT NULL,session TEXT NOT NULL,stem TEXT NOT NULL,stamp TEXT NOT NULL,file TEXT NOT NULL,body TEXT NOT NULL,hash TEXT NOT NULL,seq INTEGER NOT NULL);
    CREATE INDEX nodes_stem ON nodes(session,stem,kind,seq);
    CREATE TABLE edges(src TEXT NOT NULL,dst TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(src,dst,kind));
    CREATE INDEX edges_destination ON edges(dst,kind);
    CREATE TABLE linkfiles(path TEXT PRIMARY KEY,mtime REAL NOT NULL,size INTEGER NOT NULL);
    CREATE TABLE links(src TEXT NOT NULL,dst TEXT NOT NULL,PRIMARY KEY(src,dst)); PRAGMA user_version=${VERSION};`);
}
export function withGraph(project, fn, changedFiles = []) {
  const { root, topics, timezone } = locations(project);
  fs.mkdirSync(root, { recursive: true });
  const file = noSymlink(path.join(root, 'index-v4.sqlite'));
  const forced = new Set([...changedFiles].map((f) => noSymlink(f)));
  // Gate schema rebuild and corrupted-file replacement as well as normal operations.
  // History locks are never held by a graph read; writers release them before indexing.
  return locked(file, () => {
    let db;
    try {
      db = database(file);
      db.exec('PRAGMA busy_timeout=5000;');
      db.prepare('PRAGMA user_version').get();
    } catch (e) {
      try {
        db?.close();
      } catch {
        /* already failing: the open error decides */
      }
      if (!/not a database|malformed/i.test(e.message)) throw e;
      fs.unlinkSync(file);
      db = database(file);
    }
    try {
      const shape = {
        files: 'path,mtime,size',
        nodes: 'id,kind,session,stem,stamp,file,body,hash,seq',
        edges: 'src,dst,kind',
        linkfiles: 'path,mtime,size',
        links: 'src,dst',
      };
      if (
        db.prepare('PRAGMA user_version').get().user_version !== VERSION ||
        Object.entries(shape).some(
          ([table, columns]) =>
            db
              .prepare(`PRAGMA table_info(${table})`)
              .all()
              .map((c) => c.name)
              .join(',') !== columns,
        )
      ) {
        db.close();
        fs.unlinkSync(file);
        db = database(file);
        db.exec('BEGIN IMMEDIATE');
        schema(db);
        db.exec('COMMIT');
      }
      db.exec('BEGIN IMMEDIATE');
      const g = new Graph(db, topics, timezone);
      g.sync(forced);
      const result = fn(g);
      db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* no transaction left to roll back */
      }
      throw e;
    } finally {
      db.close();
    }
  });
}
// All readers currently use the same mkdir lock and IMMEDIATE transaction as writers.
// Keep the call boundary explicit without introducing WAL or unlocked connections.
export function withGraphRead(project, fn) {
  return withGraph(project, fn);
}
class Graph {
  constructor(db, topics, timezone) {
    this.db = db;
    this.topics = topics;
    this.timezone = timezone;
    this.errors = [];
    this.reindexed = [];
    this.short = new Map();
  }
  node(row, old = this.db.prepare('SELECT * FROM nodes WHERE id=?').get(row.id)) {
    const next = {
      id: row.id, kind: row.kind, session: row.session, stem: row.stem,
      stamp: row.stamp || '', file: row.file, body: row.body ?? '',
      hash: row.kind === 'file' ? '' : createHash('sha256').update(row.body).digest('hex'),
      seq: row.seq || 0,
    };
    if (!old) this.db.prepare('INSERT INTO nodes VALUES(?,?,?,?,?,?,?,?,?)').run(...Object.values(next));
    else if (Object.keys(next).some((key) => next[key] !== old[key]))
      this.db.prepare('UPDATE nodes SET kind=?,session=?,stem=?,stamp=?,file=?,body=?,hash=?,seq=? WHERE id=?')
        .run(next.kind, next.session, next.stem, next.stamp, next.file, next.body, next.hash, next.seq, next.id);
  }
  edge(src, dst, kind) {
    this.db.prepare('INSERT OR IGNORE INTO edges VALUES(?,?,?)').run(src, dst, kind);
  }
  read(row) {
    if (!row) return null;
    return Object.hasOwn(row, 'body') ? row.body : this.db.prepare('SELECT body FROM nodes WHERE id=?').get(row.id).body;
  }
  detail(row) {
    const e = parseHistory(this.read(row))[0];
    if (!e) throw new Error(`기록 위치를 읽지 못했습니다: ${row.id}`);
    return { ...e, id: row.id, stem: row.stem, file: row.file };
  }
  header(session, stem) {
    const row = this.db.prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE id=?`).get(stemId(session, stem));
    return row?.kind === 'branch' ? branchHeader(this.read(row)) : null;
  }
  session(name) {
    validName(name);
    const row = this.db.prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE id=? AND kind='session'`).get(stemId(name, 'main'));
    if (!row) throw new Error(`세션 '${name}'이 없습니다.`);
    return { name, context: this.read(row), file: row.file };
  }
  names() {
    return this.db
      .prepare("SELECT session FROM nodes WHERE kind='session' ORDER BY session")
      .all()
      .map((r) => r.session);
  }
  branches(session) {
    return this.db
      .prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE kind='branch' AND session=? ORDER BY stem`)
      .all(session)
      .map((row) => ({ name: row.stem, ...this.header(session, row.stem) }));
  }
  own(session, stem) {
    return this.db
      .prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE kind='checkpoint' AND session=? AND stem=? ORDER BY seq`)
      .all(session, stem);
  }
  lineage(session, stem = 'main', seen = new Set()) {
    if (stem === 'main') return this.own(session, stem);
    const key = stemId(session, stem);
    if (seen.has(key)) throw new Error('브랜치 갈래에 순환이 있습니다.');
    seen.add(key);
    const parent = this.db
      .prepare(
        `SELECT ${JOIN_NODE_FIELDS} FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind IN ('branch','session')`,
      )
      .get(key);
    if (!parent) throw new Error(`브랜치 부모를 찾지 못했습니다: ${stem}`);
    const prior = this.lineage(session, parent.stem, seen);
    const anchor = this.db
      .prepare(
        `SELECT ${JOIN_NODE_FIELDS} FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='fork' AND n.kind='checkpoint'`,
      )
      .get(key);
    const inherited = anchor ? prior.slice(0, prior.findIndex((r) => r.id === anchor.id) + 1) : [];
    return [...inherited, ...this.own(session, stem)];
  }
  recent(session, stem = 'main', count = 5) {
    if (!Number.isInteger(count) || count < 0) throw new Error('count는 0 이상의 정수입니다.');
    const rows = this.lineage(session, stem);
    return (count === 0 ? rows : rows.slice(-count)).map((row) => this.detail(row));
  }
  item(id) {
    const row = this.db.prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE id=? AND kind='checkpoint'`).get(id);
    if (!row) throw new Error('체크포인트 식별자가 없습니다.');
    return this.detail(row);
  }
  // Every checkpoint of a session in time order, whichever line it is on.
  checkpoints(session) {
    return this.db
      .prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE kind='checkpoint' AND session=?`)
      .all(session)
      .sort(
        (a, b) =>
          (Date.parse(a.stamp) || 0) - (Date.parse(b.stamp) || 0) || a.stem.localeCompare(b.stem) || a.seq - b.seq,
      );
  }
  shortIds(session) {
    if (!this.short.has(session)) this.short.set(session, shortIds(this.checkpoints(session).map((r) => r.id)));
    return this.short.get(session);
  }
  // A map ID: the full checkpoint ID, or a short ID read inside `session`.
  entry(id, session) {
    if (id.includes('@')) return this.item(id);
    if (!/^[0-9a-f]{4,40}$/i.test(id)) throw new Error('지도 ID는 짧은 ID(16진수 4자 이상) 또는 전체 ID입니다.');
    if (!session) throw new Error('짧은 ID는 세션 안에서 읽습니다. name으로 세션을 주세요.');
    this.session(session);
    const found = matchShort(
      this.checkpoints(session).map((r) => r.id),
      id,
    );
    if (!found.length) throw new Error(`세션 '${session}'에 짧은 ID ${id}가 없습니다.`);
    if (found.length > 1)
      throw new Error(
        `짧은 ID ${id}가 여러 기록과 겹칩니다: ${found.map((f) => this.shortIds(session).get(f)).join(', ')}`,
      );
    return this.item(found[0]);
  }
  map(session, stem, limit = 30) {
    this.session(session);
    const { lines, omitted, name } = renderMap(this, session, { stem, limit });
    return [
      `# 지도: ${session}${stem && stem !== 'main' ? ' / ' + name(stem) : ''}`,
      ...lines,
      ...(omitted ? [`그 앞 ${omitted}개`] : []),
    ].join('\n');
  }
  // The files one file points at, read again only when its time or size changed.
  fileLinks(file) {
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return [];
    }
    if (!stat.isFile()) return [];
    const cached = this.db.prepare('SELECT * FROM linkfiles WHERE path=?').get(file);
    if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size)
      return this.db
        .prepare('SELECT dst FROM links WHERE src=? ORDER BY rowid')
        .all(file)
        .map((r) => r.dst);
    let found = [];
    if (stat.size <= LINK_BYTES) {
      const data = fs.readFileSync(file);
      if (!data.subarray(0, 8192).includes(0)) {
        const rel = path.relative(this.topics, file),
          top = rel.split(path.sep)[0];
        const sessionDir =
          rel && !rel.startsWith('..') && !path.isAbsolute(rel) && top ? path.join(this.topics, top) : null;
        found = fileReferences(file, data.toString('utf8'), sessionDir);
      }
    }
    this.db.prepare('DELETE FROM links WHERE src=?').run(file);
    for (const dst of found) this.db.prepare('INSERT OR IGNORE INTO links VALUES(?,?)').run(file, dst);
    this.db.prepare('INSERT OR REPLACE INTO linkfiles VALUES(?,?,?)').run(file, stat.mtimeMs, stat.size);
    this.linkReads = (this.linkReads || 0) + 1;
    return found;
  }
  // The files a record (or every record of a work branch) points at, followed file to
  // file as a tree: each file once, `depth` levels (1–3), at most `max` files.
  files(session, { id, branch, depth = 2, max = 50 } = {}) {
    if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new Error('depth는 1~3입니다.');
    const s = this.session(session),
      base = path.dirname(s.file);
    let rows, title;
    if (id) {
      const e = this.entry(id, session);
      rows = [{ id: e.id }];
      title = `기록 ${this.shortIds(session).get(e.id) || e.id} · ${e.summary}`;
    } else if (branch) {
      if (!this.header(session, branch)) throw new Error(`작업 브랜치가 없습니다: ${branch}`);
      rows = this.own(session, branch);
      title = `작업 브랜치 ${branch} (기록 ${rows.length}개)`;
    } else throw new Error('files에는 id(기록 지도 ID) 또는 branch가 필요합니다.');
    const roots = [];
    for (const r of rows)
      for (const e of this.db.prepare("SELECT dst FROM edges WHERE src=? AND kind='points' ORDER BY rowid").all(r.id)) {
        const f = e.dst.slice(5);
        if (!roots.includes(f)) roots.push(f);
      }
    const seen = new Set(),
      children = new Map(),
      later = new Set(),
      queue = [];
    for (const f of roots) {
      if (seen.size >= max) {
        later.add(f);
        continue;
      }
      seen.add(f);
      queue.push({ file: f, level: 1 });
    }
    while (queue.length) {
      const { file, level } = queue.shift();
      if (level >= depth) continue;
      const kids = [];
      for (const f of this.fileLinks(file)) {
        if (seen.has(f)) {
          kids.push({ file: f, again: true });
          continue;
        }
        if (seen.size >= max) {
          later.add(f);
          continue;
        }
        seen.add(f);
        kids.push({ file: f });
        queue.push({ file: f, level: level + 1 });
      }
      children.set(file, kids);
    }
    const home = os.homedir(),
      show = (f) => {
        const rel = path.relative(base, f);
        return !rel.startsWith('..') && !path.isAbsolute(rel)
          ? rel
          : f.startsWith(home + path.sep)
            ? '~' + f.slice(home.length)
            : f;
      };
    const lines = [`# 파일: ${title}`],
      drawn = new Set();
    const draw = (file, indent, again) => {
      if (again || drawn.has(file)) {
        lines.push(`${indent}- ${show(file)} (앞에 나옴)`);
        return;
      }
      drawn.add(file);
      lines.push(`${indent}- ${show(file)}`);
      for (const k of children.get(file) || []) draw(k.file, indent + '  ', k.again);
    };
    for (const f of roots) if (seen.has(f)) draw(f, '');
    if (!roots.length) lines.push('(가리킨 파일 없음)');
    if (later.size) lines.push(`(파일 ${max}개에서 잘랐습니다. 더 있음: ${later.size}개 이상)`);
    return lines.join('\n');
  }
  find({ file, query, session, limit = 30 }) {
    if (!Number.isInteger(limit) || limit < 0) throw new Error('limit는 0 이상의 정수입니다.');
    let rows;
    if (file) {
      // `~/` is the home folder here too: records write their files that way.
      if (file.startsWith('~/')) file = path.join(os.homedir(), file.slice(2));
      const target = path.resolve(session ? path.join(this.topics, session) : this.topics, file);
      if (!fs.existsSync(target)) return [];
      rows = this.db
        .prepare(
          `SELECT ${JOIN_NODE_FIELDS} FROM edges e JOIN nodes n ON n.id=e.src WHERE e.dst=? AND e.kind='points' ORDER BY n.stamp DESC,n.session,n.stem,n.seq DESC`,
        )
        .all('file:' + target);
    } else rows = this.db.prepare(`SELECT ${NODE_FIELDS} FROM nodes WHERE kind='checkpoint' ORDER BY stamp DESC,session,stem,seq DESC`).all();
    if (session) rows = rows.filter((r) => r.session === session);
    const results = rows
      .map((r) => this.detail(r))
      .filter((e) => !query || e.body.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    return limit === 0 ? results : results.slice(0, limit);
  }
  sync(forced = new Set()) {
    const sources = [];
    if (fs.existsSync(this.topics))
      for (const e of fs.readdirSync(this.topics, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith('_')) continue;
        try {
          validName(e.name);
          const dir = noSymlink(path.join(this.topics, e.name)),
            context = noSymlink(path.join(dir, 'context.md'));
          if (!fs.existsSync(context)) continue;
          sources.push({ file: context, session: e.name, stem: 'main', kind: 'session', dir });
          const main = noSymlink(path.join(dir, 'history.md'));
          if (fs.existsSync(main)) sources.push({ file: main, session: e.name, stem: 'main', kind: 'history', dir });
          const work = noSymlink(path.join(dir, 'work'));
          if (fs.existsSync(work))
            for (const b of fs.readdirSync(work, { withFileTypes: true }).filter((b) => b.isDirectory())) {
              validName(b.name);
              const file = noSymlink(path.join(work, b.name, 'history.md'));
              if (fs.existsSync(file)) sources.push({ file, session: e.name, stem: b.name, kind: 'branch', dir });
            }
        } catch (error) {
          const dir = path.join(this.topics, e.name);
          if ([...forced].some((file) => {
            const relative = path.relative(dir, file);
            return relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
          })) throw error;
          this.errors.push({ name: e.name, error: readError(error) });
        }
      }
    const paths = new Set(sources.map((s) => s.file));
    const affected = new Map();
    for (const old of this.db.prepare('SELECT path FROM files').all())
      if (!paths.has(old.path)) {
        this.db.exec('SAVEPOINT file_sync');
        try {
          const names = this.db.prepare("SELECT DISTINCT session FROM nodes WHERE file=? AND kind<>'file'").all(old.path);
          const previous = names.map(({ session }) => [session, this.db.prepare('SELECT id FROM nodes WHERE session=?').all(session).map((r) => r.id)]);
          this.remove(old.path);
          this.db.exec('RELEASE file_sync');
          for (const [name, ids] of previous) if (!affected.has(name)) affected.set(name, ids);
        } catch (error) {
          this.db.exec('ROLLBACK TO file_sync; RELEASE file_sync');
          if (forced.has(old.path)) throw error;
          this.errors.push({ file: old.path, error: readError(error) });
        }
      }
    for (const source of sources) {
      this.db.exec('SAVEPOINT file_sync');
      try {
        const stat = fs.statSync(source.file),
          old = this.db.prepare('SELECT * FROM files WHERE path=?').get(source.file);
        if (!forced.has(source.file) && old && old.mtime === stat.mtimeMs && old.size === stat.size) {
          this.db.exec('RELEASE file_sync');
          continue;
        }
        let text, stable;
        for (let i = 0; i < 4; i++) {
          const before = fs.statSync(source.file);
          text = fs.readFileSync(source.file, 'utf8');
          const after = fs.statSync(source.file);
          if (before.mtimeMs === after.mtimeMs && before.size === after.size) {
            stable = after;
            break;
          }
        }
        if (!stable) throw new Error('기록이 계속 바뀌어 안정된 색인 위치를 얻지 못했습니다.');
        const candidates = [];
        if (source.kind === 'session')
          candidates.push({ ...source, id: stemId(source.session, 'main'), kind: 'session', body: text });
        else {
          const header = source.kind === 'branch' ? branchHeader(text) : null;
          if (header)
            candidates.push({
              id: stemId(source.session, source.stem),
              ...source,
              kind: 'branch',
              body: text.slice(0, header.end),
            });
          const counts = new Map();
          for (const [seq, e] of (source.kind === 'branch' && !header ? [] : parseHistory(text)).entries()) {
            const occurrence = (counts.get(e.timestamp) || 0) + 1;
            counts.set(e.timestamp, occurrence);
            const id = checkpointId(source.session, source.stem, e.timestamp, occurrence);
            candidates.push({ ...source, id, kind: 'checkpoint', stamp: e.timestamp, body: e.body, seq });
          }
        }
        const prior = this.db.prepare("SELECT * FROM nodes WHERE file=? AND kind<>'file'").all(source.file);
        // Capture the whole affected session before deleting any of its IDs.
        const names = new Set([source.session, ...prior.map((r) => r.session)]);
        const previous = new Map([...names].map((name) => [name, this.db.prepare('SELECT id FROM nodes WHERE session=?').all(name).map((r) => r.id)]));
        const ids = new Set(candidates.map((r) => r.id));
        for (const row of prior) {
          if (!ids.has(row.id)) {
            this.db.prepare('DELETE FROM edges WHERE src=? OR dst=?').run(row.id, row.id);
            this.db.prepare('DELETE FROM nodes WHERE id=?').run(row.id);
          }
        }
        const byId = new Map(prior.map((row) => [row.id, row]));
        for (const row of candidates) this.node(row, byId.get(row.id) || null);
        for (const row of candidates.filter((r) => r.kind === 'checkpoint')) {
          this.db.prepare("DELETE FROM edges WHERE src=? AND kind='points'").run(row.id);
          for (const file of references(row.body, [...new Set([path.dirname(source.file), source.dir])])) {
            this.node({ id: 'file:' + file, kind: 'file', session: '', stem: '', file, body: '' });
            this.edge(row.id, 'file:' + file, 'points');
          }
        }
        this.db.prepare('INSERT OR REPLACE INTO files VALUES(?,?,?)').run(source.file, stable.mtimeMs, stable.size);
        this.db.exec('RELEASE file_sync');
        for (const [name, ids] of previous) if (!affected.has(name)) affected.set(name, ids);
        this.reindexed.push(source.file);
      } catch (error) {
        this.db.exec('ROLLBACK TO file_sync; RELEASE file_sync');
        if (forced.has(source.file)) throw error;
        this.errors.push({ name: source.session, file: source.file, error: readError(error) });
      }
    }
    for (const [name, ids] of affected) this.relate(name, ids);
  }
  remove(file) {
    const ids = this.db.prepare("SELECT id FROM nodes WHERE file=? AND kind<>'file'").all(file);
    for (const { id } of ids) {
      this.db.prepare('DELETE FROM edges WHERE src=? OR dst=?').run(id, id);
      this.db.prepare('DELETE FROM nodes WHERE id=?').run(id);
    }
    this.db.prepare('DELETE FROM files WHERE path=?').run(file);
  }
  relate(name, previousIds = []) {
    const ids = [...new Set([...previousIds, ...this.db.prepare('SELECT id FROM nodes WHERE session=?').all(name).map((r) => r.id)])];
    // Bounded bind lists also cover IDs removed by this refresh, without inferring a
    // session from encoded ID prefixes or touching any unchanged session's edges.
    for (let i = 0; i < ids.length; i += 400) {
      const part = ids.slice(i, i + 400), slots = part.map(() => '?').join(',');
      this.db.prepare(`DELETE FROM edges WHERE kind IN ('next','fork','merge') AND (src IN (${slots}) OR dst IN (${slots}))`).run(...part, ...part);
    }
    if (this.names().includes(name)) {
      const branches = this.branches(name);
      for (const stem of ['main', ...branches.map((b) => b.name)]) {
        const rows = this.own(name, stem);
        for (let i = 1; i < rows.length; i++) this.edge(rows[i - 1].id, rows[i].id, 'next');
      }
      const pending = [...branches];
      let progress = true;
      while (pending.length && progress) {
        progress = false;
        for (let i = pending.length - 1; i >= 0; i--) {
          const b = pending[i];
          if (pending.some((x) => x.name === b.parent)) continue;
          try {
            const parentRows = b.parent === 'main' ? this.own(name, 'main') : this.lineage(name, b.parent);
            const anchor = b.anchor
              ? parentRows.findLast((r) => (b.anchor_id ? r.id === b.anchor_id : r.stamp === b.anchor))
              : null;
            if (b.anchor && !anchor) throw new Error(`갈래 체크포인트 없음: ${b.name} ← ${b.parent}@${b.anchor}`);
            this.edge(stemId(name, b.parent), stemId(name, b.name), 'fork');
            if (anchor) this.edge(anchor.id, stemId(name, b.name), 'fork');
            const first = this.own(name, b.name)[0];
            if (anchor && first) this.edge(anchor.id, first.id, 'next');
          } catch (error) {
            this.errors.push({ name, error: readError(error) });
          }
          pending.splice(i, 1);
          progress = true;
        }
      }
      if (pending.length) this.errors.push({ name, error: '브랜치 부모 순환 또는 부모 누락' });
      for (const row of this.own(name, 'main')) {
        const e = this.detail(row);
        if (
          e.branch &&
          e.record === `work/${e.branch}/history.md` &&
          ['끝남', '멈춤', '중단'].includes(e.status) &&
          branches.some((b) => b.name === e.branch)
        )
          this.edge(stemId(name, e.branch), row.id, 'merge');
      }
    }
  }
}
