const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const fixture = { '第一組': { 'same.wav': 'first-file' }, '第二組': { 'same.wav': 'second-file' } };

function backend(password = 'class-password') {
  const props = { AUDIO_PASSWORD: password, AUDIO_FOLDER_ID: 'private-folder' };
  let scans = 0;
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => props[k], deleteProperty: k => delete props[k]
    }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({
      setMimeType: () => JSON.parse(value)
    }) },
    Utilities: { sleep() {} }, Logger: { log() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }
  });
  vm.runInContext(source('backend/Code.gs'), ctx);
  ctx.buildManifestObject_ = () => { scans++; return fixture; };
  return { ctx, props, scans: () => scans,
    post: pass => ctx.doPost({ postData: { contents: JSON.stringify({ action: 'manifest', pass }) } }) };
}

function browser({ config = {}, reply = { ok: true, byGroup: fixture }, available = true,
  storage = new Map(), fetcher } = {}) {
  const requests = [], media = [];
  const ctx = vm.createContext({
    HPL_CONFIG: { classId: 'test', backendUrl: 'https://backend.invalid/exec',
      audioOrder: ['drive', 'iframe'], ...config },
    localStorage: { getItem: k => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    fetch: async (url, opts) => { requests.push({ url, opts });
      return fetcher ? fetcher(url, opts) : { ok: true, json: async () => reply }; },
    Audio: class {
      constructor() { this.events = {}; }
      addEventListener(name, fn) { this.events[name] = fn; }
      set src(url) { this.url = url; if (url) media.push(url); }
      load() { if (this.url) queueMicrotask(() => this.events[available ? 'loadedmetadata' : 'error']()); }
    },
    setTimeout, clearTimeout
  });
  ctx.window = ctx;
  vm.runInContext(source('assets/audio.js'), ctx);
  return { audio: ctx.HPLAudio, requests, media, storage };
}
const opts = { group: '第一組', filename: 'same.wav' };

test('server rejects unconfigured and incorrect passwords without scanning Drive', () => {
  for (const password of ['', 'class-password']) {
    const b = backend(password);
    assert.deepEqual(b.post('wrong'), { ok: false, error: password ? 'bad_password' : 'audio_not_configured' });
    assert.equal(b.scans(), 0);
  }
});
test('server accepts correct password via POST, without needing class or group data', () => {
  const b = backend();
  assert.deepEqual(b.post('class-password'), { ok: true, byGroup: fixture });
  assert.equal(b.scans(), 1);
});
test('manifest GET never releases IDs, including a correct query-string password', () => {
  const b = backend('');
  assert.equal(b.ctx.doGet({ parameter: { action: 'manifest' } }).ok, false);
  b.props.AUDIO_PASSWORD = 'class-password';
  assert.equal(b.ctx.doGet({ parameter: { action: 'manifest', pass: 'class-password' } }).ok, false);
  assert.equal(b.scans(), 0);
});
test('clearing a password disables manifest access rather than making it public', () => {
  const b = backend(); b.ctx.clearAudioPassword();
  assert.equal(b.post('').ok, false);
  assert.equal(b.scans(), 0);
});
test('folder configuration comes only from Script Properties', () => {
  const b = backend();
  assert.equal(b.ctx.audioFolderId_(), 'private-folder');
  delete b.props.AUDIO_FOLDER_ID;
  assert.throws(() => b.ctx.audioFolderId_(), /AUDIO_FOLDER_ID/);
});
test('frontend puts password in a POST body, not the URL', async () => {
  const b = browser(); await b.audio.unlock('special ?& password');
  assert.equal(b.requests[0].url, 'https://backend.invalid/exec');
  assert.equal(b.requests[0].opts.method, 'POST');
  assert.equal(b.requests[0].opts.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(b.requests[0].opts.body), { action: 'manifest', pass: 'special ?& password' });
});
test('locked backend cannot fall back to local recordings or a static manifest', async () => {
  const b = browser({ config: { audioOrder: ['local', 'drive', 'iframe'], audioManifest: 'private.json' },
    reply: { ok: false, error: 'bad_password' } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'locked');
  assert.equal(b.media.length, 0);
  assert.equal(b.requests.length, 1);
});
test('unconfigured backend cannot fall back to local recordings', async () => {
  const b = browser({ config: { audioOrder: ['local', 'drive'] },
    reply: { ok: false, error: 'audio_not_configured' } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'none');
  assert.equal(b.media.length, 0);
});
test('no backend and no explicit manifest performs no network request', async () => {
  const b = browser({ config: { backendUrl: '', audioManifest: '' } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'none');
  assert.equal(b.requests.length, 0);
});
test('explicit local-only development works without a manifest request', async () => {
  const b = browser({ config: { backendUrl: '', audioManifest: '', audioOrder: ['local'], audioLocalBase: '../audio/' } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'local');
  assert.equal(b.requests.length, 0);
});
test('missing group never borrows a same-named file from another group', async () => {
  const b = browser();
  assert.equal((await b.audio.resolve('A-a', { group: 'missing', filename: 'same.wav' })).kind, 'none');
  assert.equal(b.media.length, 0);
});
test('exact group selects the correct recording', async () => {
  const b = browser();
  const r = await b.audio.resolve('A-a', { group: '第二組', filename: 'same.wav' });
  assert.equal(r.kind, 'drive'); assert.match(r.url, /second-file/);
});
test('explicit ungrouped manifest remains supported', async () => {
  const b = browser({ reply: { byGroup: { _: { 'same.wav': 'loose-file' } } } });
  assert.match((await b.audio.resolve('A-a', opts)).url, /loose-file/);
});
test('failed direct playback falls back to iframe with the same file ID', async () => {
  const b = browser({ available: false });
  const r = await b.audio.resolve('A-a', opts);
  assert.equal(r.kind, 'iframe'); assert.match(r.url, /first-file/);
  assert.equal(b.media.length, 2);
});
test('invalid saved password is removed on reload', async () => {
  const storage = new Map([['hpl2:audiopass:test', 'old-password']]);
  const b = browser({ storage, reply: { ok: false, error: 'bad_password' } });
  await b.audio.resolve('A-a', opts);
  assert.equal(storage.size, 0);
});
test('concurrent players share a single manifest request', async () => {
  const b = browser();
  await Promise.all([b.audio.resolve('A-a', opts), b.audio.resolve('A-b', opts)]);
  assert.equal(b.requests.length, 1);
});
test('forget prevents an in-flight manifest from restoring access', async () => {
  let release;
  const b = browser({ fetcher: () => new Promise(resolve => { release = resolve; }) });
  const pending = b.audio.loadManifest().catch(() => null);
  b.audio.forget();
  release({ ok: true, json: async () => ({ byGroup: fixture }) });
  await pending;
  assert.equal(b.audio.status().ready, false);
});

test('password is remembered, then rejected and cleared after server-side rotation', async () => {
  const b = backend();
  const storage = new Map();
  const fetcher = async (_url, request) => ({ ok: true,
    json: async () => b.ctx.doPost({ postData: { contents: request.body } }) });
  const first = browser({ storage, fetcher });
  await first.audio.unlock('class-password');
  assert.equal(storage.get('hpl2:audiopass:test'), 'class-password');
  const reload = browser({ storage, fetcher });
  assert.equal((await reload.audio.resolve('A-a', opts)).kind, 'drive');
  b.props.AUDIO_PASSWORD = 'rotated-password';
  const afterRotation = browser({ storage, fetcher });
  assert.equal((await afterRotation.audio.resolve('A-a', opts)).kind, 'locked');
  assert.equal(storage.size, 0);
  assert.equal(afterRotation.media.length, 0);
});

test('unreachable backend cannot bypass the gate via local or static sources', async () => {
  const b = browser({ config: { audioOrder: ['local', 'drive'], audioManifest: 'private.json' },
    fetcher: async () => { throw new Error('offline'); } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'none');
  assert.equal(b.media.length, 0);
  assert.equal(b.requests.length, 1);
});

test('malformed manifest never becomes a playable URL', async () => {
  const b = browser({ reply: { byGroup: { '第一組': { 'same.wav': 'id&unexpected=parameter' } } } });
  assert.equal((await b.audio.resolve('A-a', opts)).kind, 'none');
  assert.equal(b.audio.status().ready, false);
  assert.equal(b.media.length, 0);
});

test('all 42 content assignments resolve exactly, including repeated filenames across groups', async () => {
  const data = vm.createContext({ HPL_CONFIG: { contentBase: 'content/' },
    fetch: async name => ({ ok: true, text: async () => source(name) }) });
  data.window = data;
  vm.runInContext(source('assets/md.js'), data);
  vm.runInContext(source('assets/data.js'), data);
  const D = await data.HPLData.load();
  const byGroup = {};
  let count = 0;
  for (const group of D.groups) {
    byGroup[group.n] = {};
    for (const file of group.f) byGroup[group.n][file[0]] = 'synthetic-file-' + (++count);
  }
  assert.equal(count, 42);
  assert.equal(new Set(D.groups.flatMap(g => g.f.map(f => f[2]))).size, 27);
  const b = browser({ reply: { ok: true, byGroup } });
  for (const group of D.groups) for (const file of group.f) {
    const r = await b.audio.resolve(file[2], { group: group.n, filename: file[0] });
    assert.equal(r.kind, 'drive');
    assert.equal(new URL(r.url).searchParams.get('id'), byGroup[group.n][file[0]]);
  }
});
