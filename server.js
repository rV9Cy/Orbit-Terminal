'use strict';
// Orbit Terminal - by Arrow dev
// Zero dependencies. Needs Node.js 18+.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const HOME = require('os').homedir();

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const LOOP = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const PUB = path.join(__dirname, 'public');
const PRIV = path.join(__dirname, 'private');
const MARK = '__ORBIT_DONE__';
const WIN = process.platform === 'win32';
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const sessions = new Map();

// Optional admin panel: only enabled when private/admin.html exists locally (it is git-ignored).
let adminKey = null;
if (fs.existsSync(path.join(PRIV, 'admin.html'))) {
  const kf = path.join(PRIV, 'admin.key');
  try { adminKey = fs.readFileSync(kf, 'utf8').trim(); }
  catch { adminKey = crypto.randomBytes(12).toString('hex'); fs.writeFileSync(kf, adminKey); }
}

const tilde = w => !w ? '' : w === HOME ? '~' : w.startsWith(HOME + path.sep) ? '~' + w.slice(HOME.length).replace(/\\/g, '/') : w;
const clean = s => s.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\r/g, '');

function emit(s, e) {
  s.ev.push(e); s.n++; s.last = Date.now();
  if (s.ev.length > 4000) s.ev.splice(0, 1000);
  for (const r of s.clients) sse(r, e, s.n - 1);
}
function sse(r, e, id) { r.write(`id: ${id}\ndata: ${JSON.stringify(e)}\n\n`); }

function feed(s, chunk) {
  const lines = (s.carry + clean(chunk)).split('\n');
  s.carry = '';
  const rest = lines.pop();
  for (const l of lines) {
    const i = l.indexOf(MARK);
    if (i < 0) { emit(s, { t: 'o', d: l + '\n' }); continue; }
    if (i > 0) emit(s, { t: 'o', d: l.slice(0, i) + '\n' });
    s.cwd = l.slice(i + MARK.length).trim() || s.cwd;
    emit(s, { t: 'r', w: s.cwd, p: tilde(s.cwd) });
  }
  if (rest) { if (rest.includes(MARK) || MARK.startsWith(rest)) s.carry = rest; else emit(s, { t: 'o', d: rest }); }
}

// Kill the shell and everything it started (so Ctrl+C really cancels a running command).
function killTree(p, sync) {
  if (!p || !p.pid) return;
  try {
    if (WIN) { const a = ['/pid', String(p.pid), '/T', '/F']; sync ? require('child_process').spawnSync('taskkill', a, { windowsHide: true }) : spawn('taskkill', a, { windowsHide: true }); }
    else process.kill(-p.pid, 'SIGKILL');
  } catch { try { p.kill('SIGKILL'); } catch {} }
}
// Pick the shell: ORBIT_SHELL env var, else PowerShell on Windows, else $SHELL or /bin/sh.
const SHELL_CMD = process.env.ORBIT_SHELL || (WIN ? 'powershell.exe' : (process.env.SHELL || '/bin/sh'));
const IS_PS = /pwsh|powershell/i.test(path.basename(SHELL_CMD));

function spawnShell(s) {
  const cmd = SHELL_CMD;
  const args = IS_PS ? ['-NoLogo', '-NoProfile', '-Command', '-'] : [];
  const p = spawn(cmd, args, { cwd: s.cwd, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: !WIN });
  s.p = p; s.carry = '';
  p.stdout.on('data', d => feed(s, d.toString('utf8')));
  p.stderr.on('data', d => emit(s, { t: 'e', d: clean(d.toString('utf8')) }));
  p.on('error', err => emit(s, { t: 'e', d: 'shell error: ' + err.message + '\n' }));
  p.stdin.on('error', () => {});
  p.on('close', () => {
    if (s.p !== p || s.closed) return;
    emit(s, { t: 'x', d: s.byUser ? '^C  (shell restarted)' : 'shell restarted' }); s.byUser = false;
    spawnShell(s);
  });
  emit(s, { t: 'r', w: s.cwd, p: tilde(s.cwd) });
}

function mk(name, ip) {
  const s = { id: crypto.randomBytes(4).toString('hex'), name: String(name || 'session').slice(0, 24), ip, created: Date.now(), last: Date.now(), ev: [], n: 0, cwd: HOME, clients: new Set(), closed: false, cmds: 0, carry: '' };
  sessions.set(s.id, s); spawnShell(s); return s;
}

function input(s, d) {
  if (s.closed || !s.p) return;
  d = String(d).slice(0, 8000);
  if (/^\s*(clear|cls)\s*$/i.test(d)) return emit(s, { t: 'k' });
  s.cmds++; emit(s, { t: 'c', d, w: s.cwd, p: tilde(s.cwd) });
  const m = IS_PS ? `Write-Output ('${MARK}'+(Get-Location).Path)` : `printf '%s%s\\n' '${MARK}' "$PWD"`;
  s.p.stdin.write(d + '\n' + m + '\n');
}
function restart(s) { if (!s.closed && s.p) { s.byUser = true; killTree(s.p); } }
function close(s) { s.closed = true; killTree(s.p); for (const r of s.clients) r.end(); s.clients.clear(); emit(s, { t: 'x', d: 'closed' }); }
const plain = s => s.ev.map(e => e.t === 'c' ? `${e.w || ''} > ${e.d}\n` : (e.t === 'o' || e.t === 'e' || e.t === 'x') ? e.d + (e.t === 'x' ? '\n' : '') : '').join('');
const info = s => ({ id: s.id, name: s.name, ip: s.ip, cwd: s.cwd, created: s.created, last: s.last, cmds: s.cmds, clients: s.clients.size, closed: s.closed });

function json(res, o, c = 200) { res.writeHead(c, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); }
function body(req) {
  return new Promise(r => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
}
function safe(req) {
  const h = (req.headers.host || '').replace(/:\d+$/, '');
  if (LOOP && !['localhost', '127.0.0.1', '[::1]'].includes(h)) return false;
  const o = req.headers.origin;
  if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch { return false; } }
  return true;
}
function stream(req, res, s) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  res.write('retry: 1000\n\n');
  const h = req.headers['last-event-id'];
  const from = h !== undefined ? +h + 1 : (+new URL(req.url, 'http://x').searchParams.get('from') || 0);
  const base = s.n - s.ev.length;
  for (let i = Math.max(0, from - base); i < s.ev.length; i++) sse(res, s.ev[i], base + i);
  s.clients.add(res);
  const ka = setInterval(() => res.write(': k\n\n'), 20000);
  req.on('close', () => { s.clients.delete(res); clearInterval(ka); });
}

async function api(req, res, p) {
  const [a, id] = p, s = sessions.get(id);
  if (a === 'session' && !id && req.method === 'POST') { const b = await body(req); return json(res, info(mk(b.name, req.socket.remoteAddress))); }
  if (!s || s.closed) return json(res, { error: 'not found' }, 404);
  if (a === 'session' && req.method === 'GET') return json(res, info(s));
  if (a === 'session' && req.method === 'DELETE') { close(s); return json(res, { ok: 1 }); }
  if (a === 'stream') return stream(req, res, s);
  const b = await body(req);
  if (a === 'input') input(s, b.d);
  else if (a === 'restart') restart(s);
  else if (a === 'rename') s.name = String(b.name || s.name).slice(0, 24);
  json(res, { ok: 1 });
}

async function admin(req, res, p) {
  const k = Buffer.from(p[2] || ''), a = Buffer.from(adminKey || '');
  if (!adminKey || k.length !== a.length || !crypto.timingSafeEqual(k, a)) { res.writeHead(404); return res.end('not found'); }
  const [, , , x, y, id] = p, s = sessions.get(id);
  if (!x) return fs.readFile(path.join(PRIV, 'admin.html'), (e, d) => { res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }); res.end(d); });
  if (x === 'api' && y === 'sessions') {
    return json(res, { now: Date.now(), sessions: [...sessions.values()].reverse().map(s => ({ ...info(s), tail: plain(s).slice(-500) })) });
  }
  if (!s) return json(res, { error: 'not found' }, 404);
  if (y === 'session') return json(res, { ...info(s), text: plain(s).slice(-60000) });
  const b = await body(req);
  if (y === 'input') input(s, b.d); else if (y === 'restart') restart(s); else if (y === 'close') close(s);
  json(res, { ok: 1 });
}

// ---- File access (browse, preview, download, upload) ----
const expand = p => { p = String(p || '~'); if (p === '~') return HOME; if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(HOME, p.slice(2)); return path.resolve(p); };
function roots() {
  const r = [{ n: 'Home', p: HOME }];
  for (const q of [path.join(HOME, 'storage', 'shared'), '/sdcard', '/storage/emulated/0']) if (fs.existsSync(q)) { r.push({ n: 'Phone', p: q }); break; }
  if (WIN) { for (let c = 67; c <= 90; c++) { const d = String.fromCharCode(c) + ':\\'; if (fs.existsSync(d)) r.push({ n: d, p: d }); } }
  else r.push({ n: '/', p: '/' });
  return r;
}
function uniq(f) {
  if (!fs.existsSync(f)) return f;
  const e = path.extname(f), b = f.slice(0, f.length - e.length);
  for (let i = 1; ; i++) if (!fs.existsSync(`${b} (${i})${e}`)) return `${b} (${i})${e}`;
}
async function fsApi(req, res, act, u) {
  try {
    if (act === 'upload') {
      const f = uniq(path.join(expand(u.searchParams.get('path')), path.basename(u.searchParams.get('name') || 'file')));
      const ws = fs.createWriteStream(f); let n = 0;
      req.on('data', c => { n += c.length; if (n > 500 * 1048576) { req.destroy(); ws.destroy(); fs.unlink(f, () => {}); } });
      ws.on('finish', () => json(res, { ok: 1, name: path.basename(f) }));
      ws.on('error', e => json(res, { error: e.code || e.message }, 400));
      return req.pipe(ws);
    }
    const b = await body(req);
    if (act === 'list') {
      const d = expand(b.path), names = await fs.promises.readdir(d, { withFileTypes: true });
      const items = await Promise.all(names.slice(0, 3000).map(async e => {
        const f = path.join(d, e.name); let st = null;
        try { st = await fs.promises.stat(f); } catch {}
        return { n: e.name, f, d: st ? st.isDirectory() : e.isDirectory(), s: st ? st.size : 0 };
      }));
      items.sort((a, b) => b.d - a.d || a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }));
      const par = path.dirname(d);
      return json(res, { path: d, p: tilde(d), parent: par === d ? null : par, win: WIN, roots: roots(), items });
    }
    const f = expand(b.path), st = await fs.promises.stat(f);
    if (act === 'read') {
      const fh = await fs.promises.open(f, 'r'), buf = Buffer.alloc(Math.min(st.size, 200000));
      await fh.read(buf, 0, buf.length, 0); await fh.close();
      let bad = 0; for (const x of buf) if (x < 9 || (x > 13 && x < 32)) bad++;
      if (bad > buf.length * 0.02) return json(res, { binary: true, size: st.size });
      return json(res, { text: buf.toString('utf8'), truncated: st.size > buf.length, size: st.size });
    }
    if (act === 'download') {
      if (!st.isFile()) return json(res, { error: 'not a file' }, 400);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': st.size, 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(path.basename(f)) });
      return fs.createReadStream(f).pipe(res);
    }
    json(res, { error: 'bad request' }, 404);
  } catch (e) { json(res, { error: e.code || e.message }, 400); }
}

function serve(res, p) {
  if (p === '/') p = '/index.html';
  const f = path.join(PUB, decodeURIComponent(p));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/fonts/') ? 'public, max-age=31536000' : 'no-cache' });
    res.end(d);
  });
}

http.createServer(async (req, res) => {
  try {
    if (!safe(req)) { res.writeHead(403); return res.end('forbidden'); }
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    if (req.method !== 'GET' && !req.headers['x-orbit']) { res.writeHead(403); return res.end('forbidden'); }
    if (p.startsWith('/admin/')) return await admin(req, res, p.split('/'));
    if (p.startsWith('/api/fs/')) return await fsApi(req, res, p.split('/')[3], u);
    if (p.startsWith('/api/')) return await api(req, res, p.split('/').slice(2));
    serve(res, p);
  } catch (e) { try { res.writeHead(500); res.end('error'); } catch {} }
}).listen(PORT, HOST, () => {
  console.log('\n  Orbit Terminal  -  by Arrow dev\n');
  console.log(`  App    http://localhost:${PORT}`);
  if (adminKey) console.log(`  Admin  http://localhost:${PORT}/admin/${adminKey}`);
  if (!LOOP) console.log('\n  WARNING: HOST is open to the network. Anyone who can reach this port can run commands on this machine.');
  console.log('');
});

process.on('exit', () => { for (const s of sessions.values()) killTree(s.p, true); });
process.on('SIGINT', () => process.exit(0));
