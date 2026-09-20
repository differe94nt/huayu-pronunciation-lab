/**
 * 華語語音工作台 —— Google Apps Script 後端
 *
 * 兩個用途：
 *   1. 收學生的標註，存進 Google 試算表，老師的即時看板才看得到
 *   2. 產生音檔對照表（audio-manifest.json），讓網頁能直接播雲端硬碟的音檔
 *
 * 部署方式見同一個資料夾的 SETUP.md。
 */

/* ═══════════════════════════════════════════════════════════
   設定：班級代號在這裡；資料夾 ID 與密碼只放在指令碼屬性
   ═══════════════════════════════════════════════════════════ */

/** 在「專案設定 → 指令碼屬性」設定 AUDIO_FOLDER_ID 與 AUDIO_PASSWORD。
 * 不要把真實資料夾 ID 寫進公開原始碼；公開資料夾可被列出檔案。 */
function audioFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('AUDIO_FOLDER_ID');
  if (!id) throw new Error('請在指令碼屬性設定 AUDIO_FOLDER_ID');
  return id;
}

/** 只有這裡列出的班級代號可以寫入。留空陣列 = 不限制。
 *  要跟 config.js 的 classId 一致。 */
var ALLOWED_CLASSES = ['2026-fall'];

/* ═══════════════════════════════════════════════════════════
   以下不用改
   ═══════════════════════════════════════════════════════════ */

var ROWS_SHEET = 'rows';
var META_SHEET = 'meta';

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function book_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, header) {
  var ss = book_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rowsSheet_() { return sheet_(ROWS_SHEET, ['classId', 'groupId', 'kind', 'id', 'at', 'json']); }
function metaSheet_() { return sheet_(META_SHEET, ['classId', 'groupId', 'at', 'json']); }

function classOk_(classId) {
  if (!classId) return false;
  if (!ALLOWED_CLASSES.length) return true;
  return ALLOWED_CLASSES.indexOf(String(classId)) >= 0;
}

/* ── 讀 ────────────────────────────────────────────────── */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var action = p.action || 'ping';

    if (action === 'ping') {
      return json_({ ok: true, time: new Date().toISOString(), classes: ALLOWED_CLASSES });
    }

    if (action === 'manifest') {
      return json_({ ok: false, error: 'use_post' });
    }

    if (!classOk_(p.classId)) return json_({ ok: false, error: '班級代號不在允許清單裡：' + p.classId });

    if (action === 'rows') {
      var one = readGroup_(p.classId, p.groupId);
      return json_({ ok: true, data: one.data, meta: one.meta });
    }

    if (action === 'class') {
      return json_({ ok: true, groups: readClass_(p.classId) });
    }

    return json_({ ok: false, error: '不認得的 action：' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function readGroup_(classId, groupId) {
  var data = { records: [], ai: [], src: [] };
  var sh = rowsSheet_();
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[0]) !== String(classId) || String(r[1]) !== String(groupId)) continue;
    var kind = String(r[2]);
    if (!data[kind]) continue;
    try { data[kind].push(JSON.parse(r[5])); } catch (e2) {}
  }
  Object.keys(data).forEach(function (k) {
    data[k].sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  });

  var meta = {};
  var ms = metaSheet_().getDataRange().getValues();
  for (var j = 1; j < ms.length; j++) {
    if (String(ms[j][0]) === String(classId) && String(ms[j][1]) === String(groupId)) {
      try { meta = JSON.parse(ms[j][3]); } catch (e3) {}
    }
  }
  return { data: data, meta: meta };
}

function readClass_(classId) {
  var byGroup = {};
  var vals = rowsSheet_().getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[0]) !== String(classId)) continue;
    var gid = String(r[1]), kind = String(r[2]);
    var G = byGroup[gid] || (byGroup[gid] = { groupId: gid, data: { records: [], ai: [], src: [] }, meta: {} });
    if (!G.data[kind]) continue;
    try { G.data[kind].push(JSON.parse(r[5])); } catch (e) {}
  }
  var ms = metaSheet_().getDataRange().getValues();
  for (var j = 1; j < ms.length; j++) {
    if (String(ms[j][0]) !== String(classId)) continue;
    var g2 = String(ms[j][1]);
    var G2 = byGroup[g2] || (byGroup[g2] = { groupId: g2, data: { records: [], ai: [], src: [] }, meta: {} });
    try { G2.meta = JSON.parse(ms[j][3]); } catch (e4) {}
  }
  return Object.keys(byGroup).map(function (k) { return byGroup[k]; });
}

/* ── 寫 ────────────────────────────────────────────────── */

function doPost(e) {
  var lock;
  try {
    var body = JSON.parse(e.postData.contents);

    // 在取得試算表鎖或掃描 Drive 前驗證；密碼不放在網址。
    if (body.action === 'manifest') {
      var want = audioPassword_();
      if (!want) return json_({ ok: false, error: 'audio_not_configured' });
      if (String(body.pass || '') !== want) {
        return json_({ ok: false, error: 'bad_password' });
      }
      try {
        audioFolderId_();
        return json_({ ok: true, byGroup: buildManifestObject_() });
      } catch (audioErr) {
        // Drive 錯誤可能含有 ID，不回傳給瀏覽器。
        return json_({ ok: false, error: 'audio_unavailable' });
      }
    }

    if (!classOk_(body.classId)) return json_({ ok: false, error: '班級代號不在允許清單裡' });
    if (!body.groupId) return json_({ ok: false, error: '缺少 groupId' });
    lock = LockService.getScriptLock();
    lock.waitLock(20000);

    if (body.action === 'add') {
      if (['records', 'ai', 'src'].indexOf(body.kind) < 0) return json_({ ok: false, error: '不認得的 kind' });
      rowsSheet_().appendRow([body.classId, body.groupId, body.kind,
        body.row.id, body.row.at || new Date().toISOString(), JSON.stringify(body.row)]);
      return json_({ ok: true });
    }

    if (body.action === 'remove') {
      var sh = rowsSheet_();
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (String(vals[i][0]) === String(body.classId) &&
            String(vals[i][1]) === String(body.groupId) &&
            String(vals[i][3]) === String(body.id)) {
          sh.deleteRow(i + 1);
        }
      }
      return json_({ ok: true });
    }

    if (body.action === 'meta') {
      var ms = metaSheet_();
      var mv = ms.getDataRange().getValues();
      var at = new Date().toISOString();
      for (var j = 1; j < mv.length; j++) {
        if (String(mv[j][0]) === String(body.classId) && String(mv[j][1]) === String(body.groupId)) {
          ms.getRange(j + 1, 3, 1, 2).setValues([[at, JSON.stringify(body.meta || {})]]);
          return json_({ ok: true });
        }
      }
      ms.appendRow([body.classId, body.groupId, at, JSON.stringify(body.meta || {})]);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: '不認得的 action：' + body.action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e5) {}
  }
}

/* ── 音檔對照表 ───────────────────────────────────────── */

/**
 * 音檔密碼。存在「指令碼屬性」裡，不在這個檔案裡，
 * 所以密碼不會進 GitHub，也可以隨時換掉而不用改程式。
 * 沒設定過就回傳空字串；manifest 端點會拒絕存取。
 */
function audioPassword_() {
  return PropertiesService.getScriptProperties().getProperty('AUDIO_PASSWORD') || '';
}

/**
 * ★ 設定或更換音檔密碼。
 *   請在「專案設定 → 指令碼屬性」新增或修改 AUDIO_PASSWORD，
 *   再執行這個函式確認設定。密碼不必暫存於程式碼。
 */
function setAudioPassword() {
  var cur = audioPassword_();
  if (cur.length < 8) throw new Error('請先在指令碼屬性設定至少 8 個字的 AUDIO_PASSWORD。');
  Logger.log('音檔密碼已設定。');
}

/** ★ 清除密碼並停用對照表端點；不會收回已知的 Drive 連結。 */
function clearAudioPassword() {
  PropertiesService.getScriptProperties().deleteProperty('AUDIO_PASSWORD');
  Logger.log('已清除音檔密碼；對照表端點已停用。');
}

/**
 * 掃描音檔資料夾，回傳
 *   { "第一組": { "American1.m4a": "檔案ID", ... }, ... }
 *
 * 用「組別 → 原始檔名」當鍵，是為了讓說話人代號的對照留在
 * content/groups.md 一個地方，不要在這裡再寫一份。
 * 資料夾底下沒有分組、音檔直接放在最外層時也支援（會歸到 "_" 這一組）。
 */
function buildManifestObject_() {
  var folderId = audioFolderId_();
  var cache = CacheService.getScriptCache();
  var hit = cache.get('audio_manifest');
  if (hit) { try {
    var saved = JSON.parse(hit);
    if (saved.folder === folderId) return saved.byGroup;
  } catch (e) {} }

  var root = DriveApp.getFolderById(folderId);
  var out = {};

  var loose = root.getFiles();
  while (loose.hasNext()) {
    var lf = loose.next();
    (out['_'] = out['_'] || {})[lf.getName()] = lf.getId();
  }

  var subs = root.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    var bag = out[sub.getName()] = {};
    var it = sub.getFiles();
    while (it.hasNext()) { var f = it.next(); bag[f.getName()] = f.getId(); }
  }

  try { cache.put('audio_manifest', JSON.stringify({ folder: folderId, byGroup: out }), 900); } catch (e2) {}   /* 快取 15 分鐘 */
  return out;
}

/** 在 Drive 裡改了檔名或加了檔案之後，執行這個清掉快取。 */
function refreshAudioManifest() {
  CacheService.getScriptCache().remove('audio_manifest');
  var m = buildManifestObject_();
  var n = 0;
  Object.keys(m).forEach(function (g) { n += Object.keys(m[g]).length; });
  Logger.log('已重新掃描：' + Object.keys(m).length + ' 個資料夾、' + n + ' 個檔案。');
  return m;
}

/**
 * ★ 在編輯器裡選這個函式按「執行」，
 *   把印出來的 JSON 存成 v2/audio-manifest.json。
 *   只有在「不想用密碼、也不想接後端」時才需要這個檔案；
 *   有接後端的話網頁會直接跟 Apps Script 要，不需要這一步。
 */
function printAudioManifest() {
  var m = buildManifestObject_();
  var out = { generated: new Date().toISOString(), byGroup: m };
  var n = 0;
  Object.keys(m).forEach(function (g) { n += Object.keys(m[g]).length; });
  Logger.log('共 ' + Object.keys(m).length + ' 個資料夾、' + n + ' 個檔案。');
  Logger.log('--- 以下整段複製成 v2/audio-manifest.json ---');
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * ★ 把資料夾裡所有音檔設成「知道連結的人可以**檢視**」。
 *   會一併把「可以編輯」降級成「只能看」——
 *   只調整一般連結分享，不會移除具名編輯者或上層繼承權限。
 */
function lockDownAudioFiles() {
  var root = DriveApp.getFolderById(audioFolderId_());
  var n = 0;

  function fix(f) {
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // 只限校內帳號的版本（更嚴格，學生要用學校帳號登入瀏覽器）：
    // f.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    n++;
  }
  function walk(folder) {
    var it = folder.getFiles();
    while (it.hasNext()) fix(it.next());
    var subs = folder.getFolders();
    while (subs.hasNext()) { var s = subs.next(); fix(s); walk(s); }
  }
  fix(root);
  walk(root);
  Logger.log('已把 ' + n + ' 個項目的連結分享設成「檢視」。請另查具名與繼承的編輯權限。');
  return n;
}

/**
 * ★ 課程結束後執行：關閉資料夾與檔案的一般連結分享。
 *   具名、群組、繼承權限及已下載的副本仍須另外處理。
 */
function unshareAudioFiles() {
  var root = DriveApp.getFolderById(audioFolderId_());
  var n = 0;
  function priv(f) { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW); n++; }
  function walk(folder) {
    var it = folder.getFiles();
    while (it.hasNext()) priv(it.next());
    var subs = folder.getFolders();
    while (subs.hasNext()) { var s = subs.next(); priv(s); walk(s); }
  }
  priv(root); walk(root);
  CacheService.getScriptCache().remove('audio_manifest');
  Logger.log('已收回 ' + n + ' 個項目的分享權限。');
  return n;
}

/**
 * 把全班資料匯出成一份 Markdown，存到雲端硬碟。學期末存檔用。
 */
function exportClassMarkdown() {
  var classId = ALLOWED_CLASSES[0] || '';
  var groups = readClass_(classId);
  var L = ['# ' + classId + ' 全班語音標註彙整', '', '產生時間：' + new Date().toLocaleString(), ''];
  groups.forEach(function (g) {
    L.push('## ' + g.groupId);
    L.push('');
    L.push('| 音檔 | 時間碼 | 字詞 | 面向 | 標籤 | 分母 | 判斷 | 描述 |');
    L.push('|---|---|---|---|---|---|---|---|');
    (g.data.records || []).forEach(function (r) {
      L.push('| ' + [r.spk, r.tc, r.word, r.lv, r.tag, (r.denom || '—'), r.tri,
        String(r.desc || '').replace(/\|/g, '／')].join(' | ') + ' |');
    });
    L.push('');
  });
  var file = DriveApp.createFile(classId + '_全班標註彙整.md', L.join('\n'), MimeType.PLAIN_TEXT);
  Logger.log('已存到雲端硬碟：' + file.getUrl());
  return file.getUrl();
}
