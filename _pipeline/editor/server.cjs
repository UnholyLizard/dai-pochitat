// Stage editor server: serves the editor UI, the stages (with footage meta injected), the sequence files and
// runs render jobs (render.cjs stills / frames, encode.sh / encode-vertical.sh) with live logs.
// Works: every _pipeline/stage*/ folder with a stage.html is a work (stage/ = the 16:9 film, stage-instagram/ = 9:16).
// A sequence is named "<work>/<file>.json"; a bare "<file>.json" means stage/<file>.json.
// usage: node editor/server.cjs [--port 5178]   (from _pipeline; no dependencies beyond tools/node_modules)
// Local tool: binds 127.0.0.1 only, checks Host/Origin on every request, and writes only inside the repository.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { SP, loadMeta, listMosaic, canvasOf } = require('../tools/stage-data.cjs');
const { format } = require('./lib/json-format.cjs');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; };
const PORT = +arg('port', process.env.PORT || 5178);
const HOST = '127.0.0.1';
const REPO = path.resolve(SP, '..');
const STAGE_DIR = path.join(SP, 'stage');
const RENDER_TMP = path.join(STAGE_DIR, '.render');
const WORK_RE = /^stage[\w-]*$/;
// the works: stage folders that hold a stage.html
const works = () => fs.readdirSync(SP).filter((d) => WORK_RE.test(d) && fs.existsSync(path.join(SP, d, 'stage.html'))).sort();
const workDir = (work) => {
  if (!WORK_RE.test(String(work)) || !fs.existsSync(path.join(SP, work, 'stage.html'))) throw Object.assign(new Error(`no such work "${work}"`), { code: 400 });
  return path.join(SP, work);
};
const historyDir = (work) => path.join(workDir(work), '.history');
const EDITOR_DIR = __dirname;
const KEEP_BACKUPS = 40;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
};

// ---------------------------------------------------------------------------
// helpers
const inside = (dir, p) => { const r = path.relative(dir, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
// browser URL of a file the server may serve (outputs inside _pipeline or elsewhere in the repo)
const urlFor = (abs) => (inside(SP, abs) ? `/files/${path.relative(SP, abs)}` : `/repo/${path.relative(REPO, abs)}`).split(path.sep).join('/');
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const fail = (res, code, msg) => send(res, code, { error: msg });

function readBody(req, limit = 4 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('body too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('invalid JSON body'), { code: 400 })); }
    });
    req.on('error', reject);
  });
}

// sequence names: "<work>/<file>.json" (a bare "<file>.json" is in stage/); returns { file, work, name }
function seqRef(name) {
  const m = typeof name === 'string' && /^(?:(stage[\w-]*)\/)?([\w][\w.-]*\.json)$/.exec(name);
  if (!m) throw Object.assign(new Error(`bad sequence name "${name}"`), { code: 400 });
  const work = m[1] || 'stage';
  return { file: path.join(workDir(work), m[2]), work, name: `${work}/${m[2]}` };
}
const seqPath = (name) => seqRef(name).file;
function isSequence(obj) { return obj && typeof obj === 'object' && String(obj.format || '').startsWith('stage-sequence/'); }

// a working path given relative to _pipeline (e.g. "frames4k", "../showcase/x/video"); must stay inside the repo
function workPath(p, what) {
  if (typeof p !== 'string' || !p.trim()) throw Object.assign(new Error(`${what}: missing path`), { code: 400 });
  const abs = path.resolve(SP, p.trim());
  if (!inside(REPO, abs)) throw Object.assign(new Error(`${what}: ${p} is outside the repository`), { code: 400 });
  return abs;
}

// backups live next to the sequence, in <work>/.history/
function backup(file) {
  if (!fs.existsSync(file)) return null;
  const HISTORY_DIR = path.join(path.dirname(file), '.history');
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const base = path.basename(file, '.json');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const dest = path.join(HISTORY_DIR, `${base}.${stamp}.json`);
  fs.copyFileSync(file, dest);
  const old = fs.readdirSync(HISTORY_DIR).filter((f) => f.startsWith(base + '.') && /\.\d{8}-\d{6}\.json$/.test(f)).sort();
  old.slice(0, Math.max(0, old.length - KEEP_BACKUPS)).forEach((f) => fs.unlinkSync(path.join(HISTORY_DIR, f)));
  return path.basename(dest);
}

function findBash() {
  const cands = [process.env.PIPELINE_BASH, 'C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe', '/bin/bash', '/usr/bin/bash'].filter(Boolean);
  return cands.find((c) => fs.existsSync(c)) || null;
}

// ---------------------------------------------------------------------------
// static files
function serveFile(res, file, req) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return fail(res, 404, 'not found');
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) return fail(res, 403, 'file type not served');
  const st = fs.statSync(file);
  const tag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
  // footage and frames never change in place during a session; the stage and editor do
  const immutable = /[\\/](footage|lab)[\\/]/.test(file);
  if (req.headers['if-none-match'] === tag) { res.writeHead(304); return res.end(); }

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start >= st.size) {
        res.writeHead(416, { 'content-range': `bytes */${st.size}` });
        return res.end();
      }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, {
        'content-range': `bytes ${start}-${end}/${st.size}`,
        'accept-ranges': 'bytes',
        'content-length': end - start + 1,
        'content-type': type,
        'cache-control': 'no-cache',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, {
    'content-type': type,
    etag: tag,
    'accept-ranges': 'bytes',
    'content-length': st.size,
    'cache-control': immutable ? 'max-age=3600' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  fs.createReadStream(file).pipe(res);
}

// a work's stage, with what render.cjs would inject (footage meta + mosaic list); the editor applies the sequence itself
function serveStage(res, work = 'stage') {
  const dir = workDir(work);
  const html = fs.readFileSync(path.join(dir, 'stage.html'), 'utf8');
  const data = `<script>window.EDITOR=true;window.META=${JSON.stringify(loadMeta()).replace(/</g, '\\u003c')};window.MOSAIC=${JSON.stringify(listMosaic(dir))};</script>`;
  const out = html.replace(/<meta charset="utf-8">/i, (m) => `${m}\n${data}`);
  send(res, 200, out, MIME['.html']);
}

// ---------------------------------------------------------------------------
// render jobs (one at a time; logs kept for late subscribers)
const jobs = new Map();
let active = null;

function startJob(kind, cmd, args, opts = {}) {
  if (active && active.state === 'running') throw Object.assign(new Error(`a ${active.kind} job is still running`), { code: 409 });
  const id = crypto.randomBytes(5).toString('hex');
  const job = { id, kind, state: 'running', started: Date.now(), ended: null, code: null, log: [], progress: null, outputs: [], subs: new Set(), cleanup: opts.cleanup, cwd: opts.cwd || path.join(SP, 'tools'), label: opts.label || kind };
  jobs.set(id, job);
  active = job;
  const emit = (type, data) => { const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`; job.subs.forEach((r) => r.write(msg)); };
  job.emit = emit;
  const line = (s, stream) => {
    if (!s.trim()) return;
    const entry = { t: Date.now(), s, stream };
    job.log.push(entry); if (job.log.length > 4000) job.log.shift();
    emit('log', entry);
    const p = /^(\d+)\/(\d+)\s/.exec(s);                                   // render.cjs frames progress
    if (p) { job.progress = { done: +p[1], total: +p[2] }; emit('progress', job.progress); }
    const fp = /frame=\s*(\d+)/.exec(s);                                   // ffmpeg encode progress
    if (fp && opts.expectFrames) { job.progress = { done: Math.min(+fp[1], opts.expectFrames), total: opts.expectFrames }; emit('progress', job.progress); }
    const st = /^still ([\d.]+) (.+)$/.exec(s);                            // render.cjs stills output
    if (st) {
      const abs = path.resolve(job.cwd, st[2]);
      const out = { t: +st[1], file: path.relative(SP, abs).split(path.sep).join('/'), url: `${urlFor(abs)}?v=${Date.now()}` };
      job.outputs.push(out); emit('output', out);
      if (opts.total) { job.progress = { done: job.outputs.length, total: opts.total }; emit('progress', job.progress); }
    }
  };
  line(`$ ${[path.basename(cmd), ...args].join(' ')}`, 'cmd');
  const child = spawn(cmd, args, { cwd: job.cwd, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0' } });
  job.child = child;
  const pipe = (stream, name) => { let buf = ''; stream.on('data', (d) => { buf += d.toString('utf8'); const parts = buf.split(/\r?\n/); buf = parts.pop(); parts.forEach((s) => line(s, name)); }); stream.on('end', () => line(buf, name)); };
  pipe(child.stdout, 'out'); pipe(child.stderr, 'err');
  child.on('error', (e) => line(`failed to start: ${e.message}`, 'err'));
  child.on('close', (code) => {
    job.code = code; job.ended = Date.now();
    job.state = job.state === 'cancelling' ? 'cancelled' : code === 0 ? 'done' : 'failed';
    if (job.state === 'done' && opts.onDone) { try { opts.onDone(job, line); } catch (e) { line(e.message, 'err'); } }
    line(`[${job.state}] exit ${code} after ${((job.ended - job.started) / 1000).toFixed(1)} s`, 'sys');
    emit('state', summary(job));
    if (job.cleanup) try { job.cleanup(); } catch { /* temp file already gone */ }
    job.subs.forEach((r) => r.end()); job.subs.clear();
  });
  return job;
}

function cancelJob(job) {
  if (!job || job.state !== 'running') return false;
  job.state = 'cancelling';
  // render.cjs runs Chrome children: kill the whole tree
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(job.child.pid), '/T', '/F'], { windowsHide: true });
  else job.child.kill('SIGTERM');
  return true;
}

const summary = (j) => ({ id: j.id, kind: j.kind, label: j.label, state: j.state, started: j.started, ended: j.ended, code: j.code, progress: j.progress, outputs: j.outputs });

function writeTempSeq(seq) {
  if (!isSequence(seq)) throw Object.assign(new Error('render: body.seq is not a stage sequence'), { code: 400 });
  fs.mkdirSync(RENDER_TMP, { recursive: true });
  const file = path.join(RENDER_TMP, `job-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.json`);
  fs.writeFileSync(file, JSON.stringify(seq));
  return file;
}

const num = (v, def, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };

function createJob(body) {
  const node = process.execPath;
  const render = path.join(SP, 'tools', 'render.cjs');
  const stageArgs = ['--stage', workDir(body.work || 'stage')];
  if (body.kind === 'stills') {
    const times = (Array.isArray(body.times) ? body.times : []).map(Number).filter(Number.isFinite).slice(0, 200);
    if (!times.length) throw Object.assign(new Error('stills: no times'), { code: 400 });
    const out = workPath(body.out || 'preview/editor', 'output folder');
    const seqFile = writeTempSeq(body.seq);
    const args = [render, 'stills', out, times.map((t) => t.toFixed(3)).join(','), '--dpr', String(num(body.dpr, 1, 0.5, 2)), '--fmt', body.fmt === 'png' ? 'png' : 'jpg', '--seq', seqFile, ...stageArgs];
    if (body.clean) args.push('--clean');
    return startJob('stills', node, args, { cleanup: () => fs.unlinkSync(seqFile), total: times.length, label: `${times.length} still${times.length > 1 ? 's' : ''}` });
  }
  if (body.kind === 'frames') {
    const out = workPath(body.out || 'frames4k', 'frames folder');
    const seqFile = writeTempSeq(body.seq);
    const args = [render, 'frames', out, '--workers', String(num(body.workers, 4, 1, 16)), '--dpr', String(num(body.dpr, 2, 0.5, 2)), '--seq', seqFile, ...stageArgs, '--log-every', '30'];
    if (body.from != null && body.to != null) args.push('--from', String(num(body.from, 0, 0, 3600)), '--to', String(num(body.to, 0, 0, 3600)));
    if (body.force) args.push('--force');
    if (body.prune) args.push('--prune');
    return startJob('frames', node, args, { cleanup: () => fs.unlinkSync(seqFile), label: `frames → ${path.relative(SP, out) || '.'}` });
  }
  if (body.kind === 'encode') {
    const bash = findBash();
    if (!bash) throw Object.assign(new Error('encode: no bash found (install Git for Windows or set PIPELINE_BASH)'), { code: 500 });
    const frames = workPath(body.frames || 'frames4k', 'frames folder');
    // the sequence's own render.video when the form leaves it empty (no project name baked into the server)
    const out = workPath(body.out || (body.seq && body.seq.render && body.seq.render.video) || '../showcase/video', 'video folder');
    const name = String(body.name || 'presentation');
    if (!/^[\w.-]+$/.test(name)) throw Object.assign(new Error('encode: name may only use letters, digits, . _ -'), { code: 400 });
    const poster = Math.round(num(body.poster, 156, 0, 1e6));
    // check the frame run before spending minutes on x264: a gap or a stale tail would end up in the video
    const files = fs.existsSync(frames) ? fs.readdirSync(frames).filter((f) => /^f\d{5}\.jpg$/.test(f)).sort() : [];
    if (!files.length) throw Object.assign(new Error(`encode: no frames in ${path.relative(SP, frames)}`), { code: 400 });
    const last = +files[files.length - 1].slice(1, 6);
    if (files.length !== last + 1 || files[0] !== 'f00000.jpg') throw Object.assign(new Error(`encode: ${files.length} frames but numbering runs to f${String(last).padStart(5, '0')} — render the full range first`), { code: 400 });
    if (body.expectFrames && files.length !== Number(body.expectFrames)) throw Object.assign(new Error(`encode: found ${files.length} frames, the sequence needs ${body.expectFrames} (re-render with "remove frames outside range")`), { code: 400 });
    const sh = (p) => p.split(path.sep).join('/');
    // 9:16 sequences encode to the Instagram set (encode-vertical.sh), 16:9 to the 4K / 1080p set (encode.sh)
    const script = body.vertical ? 'encode-vertical.sh' : 'encode.sh';
    const t0 = Date.now();
    const args = [sh(path.join(SP, 'tools', script)), sh(frames), sh(out), name, String(poster)];
    const audioReq = body.audio || (body.seq && body.seq.render && body.seq.render.audio) || (body.seq && body.seq.audio && (typeof body.seq.audio === 'string' ? body.seq.audio : body.seq.audio.src));
    if (audioReq) {
      try {
        const audioAbs = workPath(audioReq, 'audio file');
        if (fs.existsSync(audioAbs)) args.push(sh(audioAbs));
      } catch { /* ignore audio path error if not found */ }
    }
    return startJob('encode', bash, args, {
      expectFrames: body.expectFrames,
      label: `encode ${name}${body.vertical ? ' (9:16)' : ''}`,
      onDone: (job) => {
        if (!fs.existsSync(out)) return;
        fs.readdirSync(out).filter((f) => f.startsWith(name) && /\.mp4$/.test(f)).map((f) => path.join(out, f))
          .filter((f) => fs.statSync(f).mtimeMs >= t0 - 1000)
          .forEach((f) => job.outputs.push({ file: path.relative(SP, f).split(path.sep).join('/'), url: urlFor(f), size: fs.statSync(f).size }));
      },
    });
  }
  throw Object.assign(new Error(`unknown job kind "${body.kind}"`), { code: 400 });
}

// ---------------------------------------------------------------------------
// API
async function api(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/info' && m === 'GET') {
    const meta = loadMeta();
    const dir = workDir(url.searchParams.get('work') || 'stage');
    const shots = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { fps: v.fps, frames: v.frames.length, clicks: v.clicks || [], drags: v.drags || [], cursor: v.cursor || null, vp: v.vp }]));
    const adir = path.join(dir, 'assets');
    const assets = fs.existsSync(adir) ? fs.readdirSync(adir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => `assets/${f}`) : [];
    const framesDirs = fs.readdirSync(SP).filter((d) => /^frames/.test(d) && fs.statSync(path.join(SP, d)).isDirectory());
    const audioFiles = [];
    const searchDirs = ['film/audio', 'audio', path.join(url.searchParams.get('work') || 'stage', 'audio')];
    for (const d of searchDirs) {
      const abs = path.join(SP, d);
      if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
        for (const f of fs.readdirSync(abs)) {
          if (/\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(f)) audioFiles.push(`${d}/${f}`.replace(/\\/g, '/'));
        }
      }
    }
    return send(res, 200, { shots, assets, audioFiles, mosaic: listMosaic(dir), bash: !!findBash(), framesDirs, works: works() });
  }

  if (p === '/api/sequences' && m === 'GET') {
    const list = works().flatMap((work) => fs.readdirSync(path.join(SP, work)).filter((f) => f.endsWith('.json')).map((f) => {
      try {
        const file = path.join(SP, work, f);
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return isSequence(j) ? { name: `${work}/${f}`, work, file: f, title: j.name || f, mtime: fs.statSync(file).mtimeMs, duration: j.duration, canvas: canvasOf(j) } : null;
      } catch { return null; }
    })).filter(Boolean);
    return send(res, 200, list);
  }

  if (p === '/api/sequence' && m === 'GET') {
    const ref = seqRef(url.searchParams.get('name'));
    if (!fs.existsSync(ref.file)) return fail(res, 404, 'no such sequence');
    const buf = fs.readFileSync(ref.file);
    return send(res, 200, { name: ref.name, work: ref.work, etag: sha1(buf), seq: JSON.parse(buf.toString('utf8')) });
  }

  if (p === '/api/sequence' && m === 'PUT') {
    const body = await readBody(req);
    const ref = seqRef(url.searchParams.get('name'));
    const file = ref.file;
    if (!isSequence(body.seq)) return fail(res, 400, 'not a stage sequence (needs "format": "stage-sequence/1")');
    const exists = fs.existsSync(file);
    if (exists && !body.force) {
      const cur = sha1(fs.readFileSync(file));
      if (body.etag !== cur) return send(res, 409, { error: 'the file changed on disk since it was loaded', etag: cur });
    }
    if (!exists && body.etag && !body.force) return send(res, 409, { error: 'the file was deleted on disk since it was loaded' });
    const text = format(body.seq);
    const saved = exists ? backup(file) : null;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, file);
    return send(res, 200, { name: ref.name, work: ref.work, etag: sha1(Buffer.from(text)), backup: saved });
  }

  if (p === '/api/history' && m === 'GET') {
    const ref = seqRef(url.searchParams.get('name'));
    const base = path.basename(ref.file, '.json');
    const HISTORY_DIR = historyDir(ref.work);
    const list = fs.existsSync(HISTORY_DIR) ? fs.readdirSync(HISTORY_DIR).filter((f) => f.startsWith(base + '.') && /\.\d{8}-\d{6}\.json$/.test(f)).sort().reverse() : [];
    return send(res, 200, list.map((f) => ({ file: f, stamp: f.slice(base.length + 1, -5) })));
  }

  if (p === '/api/history/file' && m === 'GET') {
    const f = String(url.searchParams.get('file') || '');
    if (!/^[\w][\w.-]*\.\d{8}-\d{6}\.json$/.test(f)) return fail(res, 400, 'bad backup name');
    const file = path.join(historyDir(url.searchParams.get('work') || 'stage'), f);
    if (!fs.existsSync(file)) return fail(res, 404, 'no such backup');
    return send(res, 200, { seq: JSON.parse(fs.readFileSync(file, 'utf8')) });
  }

  if (p === '/api/jobs' && m === 'GET') return send(res, 200, [...jobs.values()].slice(-10).reverse().map(summary));
  if (p === '/api/jobs' && m === 'POST') { const job = createJob(await readBody(req)); return send(res, 202, summary(job)); }

  const jm = /^\/api\/jobs\/([0-9a-f]+)(\/events|\/cancel)?$/.exec(p);
  if (jm) {
    const job = jobs.get(jm[1]);
    if (!job) return fail(res, 404, 'no such job');
    if (!jm[2] && m === 'GET') return send(res, 200, { ...summary(job), log: job.log });
    if (jm[2] === '/cancel' && m === 'POST') return send(res, 200, { cancelled: cancelJob(job) });
    if (jm[2] === '/events' && m === 'GET') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ ...summary(job), log: job.log })}\n\n`);
      if (job.state !== 'running' && job.state !== 'cancelling') return res.end();
      job.subs.add(res);
      req.on('close', () => job.subs.delete(res));
      return;
    }
  }
  return fail(res, 404, 'unknown endpoint');
}

// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    // DNS-rebinding and cross-site guards: this server writes files and starts processes
    const okHost = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
    if (!okHost.has(String(req.headers.host))) return fail(res, 403, 'bad host');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (!origin || !okHost.has(origin.replace(/^http:\/\//, ''))) return fail(res, 403, 'bad origin');
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return fail(res, 415, 'expected application/json');
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'method not allowed');
    if (p === '/' || p === '/index.html') return serveFile(res, path.join(EDITOR_DIR, 'index.html'), req);
    const sm = /^\/(stage[\w-]*)\/stage\.html$/.exec(p);
    if (sm) return serveStage(res, sm[1]);
    if (p.startsWith('/editor/')) {
      const f = path.resolve(EDITOR_DIR, '.' + p.slice('/editor'.length));
      return inside(EDITOR_DIR, f) && !/^(lib[\\/]|server\.cjs$)/.test(path.relative(EDITOR_DIR, f)) ? serveFile(res, f, req) : fail(res, 403, 'forbidden');
    }
    // the stage's own relative URLs (assets, ../footage), render outputs under _pipeline (/files/...) and
    // deliverables elsewhere in the repo (/repo/..., e.g. the encoded videos in showcase/)
    const base = p.startsWith('/repo/') ? REPO : SP;
    const rel = p.startsWith('/files/') ? p.slice('/files'.length) : p.startsWith('/repo/') ? p.slice('/repo'.length) : p;
    const f = path.resolve(base, '.' + rel);
    const r = path.relative(base, f);
    if (!inside(base, f) || /(^|[\\/])\./.test(r) || /(^|[\\/])node_modules([\\/]|$)/.test(r)) return fail(res, 403, 'forbidden');
    return serveFile(res, f, req);
  } catch (e) {
    if (!res.headersSent) fail(res, e.code && e.code >= 400 && e.code < 600 ? e.code : 500, e.message);
    else res.end();
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`port ${PORT} is busy — run with --port <n>`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, HOST, () => console.log(`stage editor: http://localhost:${PORT}/`));
process.on('SIGINT', () => { if (active) cancelJob(active); process.exit(0); });
