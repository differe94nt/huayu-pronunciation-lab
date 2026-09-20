/* ═══════════════════════════════════════════════════════════
   store.js —— 資料存哪裡
   1. 一定會存到這台電腦的 localStorage（離線也能用）
   2. config.js 有填 backendUrl 的話，同時送到 Google 試算表，
      老師的即時看板就看得到
   3. 在 Claude Artifact 上執行時改用 Claude 的共享資料庫
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CFG = global.HPL_CONFIG || {};
  var KINDS = ["records", "ai", "src"];

  var state = {
    classId: CFG.classId || "default",
    groupId: null,
    data: { records: [], ai: [], src: [] },
    /* 送不出去的資料放這裡，依組別分開存。每次跟伺服器對過之後會再補回 data，
       否則下一次輪詢就會把它們洗掉——那等於學生的東西不見了。 */
    pendingByGroup: {},
    meta: {},
    metaPendingGroups: {},
    mode: "local",          /* local | sheet | claude */
    online: false,
    lastSync: 0,
    lastError: ""
  };
  var listeners = [];
  var pollTimer = null;
  var claudeDb = null;

  /* 這一組還沒送出去的東西 */
  function pend() {
    var g = state.groupId || "_";
    return state.pendingByGroup[g] || (state.pendingByGroup[g] = { records: [], ai: [], src: [] });
  }
  function metaPending(v) {
    var g = state.groupId || "_";
    if (v === undefined) return !!state.metaPendingGroups[g];
    state.metaPendingGroups[g] = v;
  }

  function emit(what) { listeners.forEach(function (f) { try { f(what, state); } catch (e) {} }); }
  function on(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; }

  /* ── localStorage ─────────────────────────────────────── */
  var LS = (function () {
    try { localStorage.setItem("__hpl", "1"); localStorage.removeItem("__hpl"); return localStorage; }
    catch (e) { return null; }
  })();
  function lsKey() { return "hpl2:" + state.classId + ":" + state.groupId; }
  function lsSave() {
    if (!LS || !state.groupId) return;
    try { LS.setItem(lsKey(), JSON.stringify({ data: state.data, meta: state.meta })); } catch (e) {}
  }
  function lsLoad() {
    if (!LS || !state.groupId) return;
    try {
      var d = JSON.parse(LS.getItem(lsKey()) || "{}");
      state.data = { records: [], ai: [], src: [] };
      KINDS.forEach(function (k) { state.data[k] = (d.data && d.data[k]) || []; });
      state.meta = d.meta || {};
    } catch (e) {}
  }

  /* ── Google Apps Script ───────────────────────────────── */
  function sheetGet(params) {
    var q = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    return fetch(CFG.backendUrl + "?" + q, { method: "GET", redirect: "follow" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  /* Content-Type 用 text/plain 是故意的：Apps Script 不處理 OPTIONS 預檢，
     改用 text/plain 就不會觸發預檢，POST 才過得去。 */
  function sheetPost(body) {
    return fetch(CFG.backendUrl, {
      method: "POST", redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  /* 把還沒送出去的資料補回伺服器版本，並順手重送一次 */
  function mergePending() {
    var P = pend(), gid = state.groupId;
    KINDS.forEach(function (k) {
      var have = {};
      state.data[k].forEach(function (x) { have[x.id] = true; });
      var still = [];
      P[k].forEach(function (row) {
        if (have[row.id]) return;                 /* 伺服器已經有了 */
        state.data[k] = state.data[k].concat([row]);
        still.push(row);
        sheetPost({ action: "add", classId: state.classId, groupId: gid, kind: k, row: row })
          .then(function () {
            P[k] = P[k].filter(function (x) { return x.id !== row.id; });
          }).catch(function () {});
      });
      P[k] = still;
      state.data[k].sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    });
    if (metaPending()) {
      sheetPost({ action: "meta", classId: state.classId, groupId: gid, meta: state.meta })
        .then(function () { state.metaPendingGroups[gid] = false; }).catch(function () {});
    }
  }

  function pull() {
    if (state.mode !== "sheet" || !state.groupId) return Promise.resolve();
    return sheetGet({ action: "rows", classId: state.classId, groupId: state.groupId })
      .then(function (j) {
        if (!j || j.ok === false) throw new Error((j && j.error) || "回應格式不對");
        KINDS.forEach(function (k) { state.data[k] = (j.data && j.data[k]) || []; });
        if (!metaPending()) state.meta = j.meta || {};
        mergePending();
        state.online = true; state.lastSync = Date.now(); state.lastError = "";
        lsSave(); emit("sync");
      })
      .catch(function (e) {
        state.online = false; state.lastError = String(e.message || e); emit("offline");
      });
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (state.mode !== "sheet") return;
    pollTimer = setInterval(pull, Math.max(5000, CFG.pollMs || 12000));
  }

  /* ── Claude Artifact 資料庫 ───────────────────────────── */
  function claudeAttach() {
    if (!claudeDb || !state.groupId) return;
    KINDS.forEach(function (kind) {
      claudeDb.collection("classes/" + state.classId + "/groups/" + state.groupId + "/" + kind)
        .limit(400).onSnapshot(function (snap) {
          state.data[kind] = snap.docs.map(function (d) {
            return Object.assign({ id: d.id }, d.data());
          }).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
          state.online = true; state.lastSync = Date.now(); emit("sync");
        }, function () {});
    });
    claudeDb.doc("classes/" + state.classId + "/groups/" + state.groupId)
      .onSnapshot(function (snap) {
        state.meta = snap.exists ? (snap.data() || {}) : {};
        emit("sync");
      }, function () {});
  }

  /* ── 對外 API ─────────────────────────────────────────── */
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };

  function setGroup(groupId) {
    state.groupId = groupId;
    state.data = { records: [], ai: [], src: [] };
    state.meta = {};
    lsLoad();
    emit("group");
    if (state.mode === "sheet") { pull(); startPolling(); }
    if (state.mode === "claude") claudeAttach();
    return Promise.resolve();
  }

  function add(kind, obj) {
    obj = Object.assign({ id: uid(), at: new Date().toISOString() }, obj);
    state.data[kind] = state.data[kind].concat([obj]);
    lsSave(); emit("change");

    if (state.mode === "sheet") {
      return sheetPost({ action: "add", classId: state.classId, groupId: state.groupId, kind: kind, row: obj })
        .then(function () { state.online = true; state.lastError = ""; emit("sync"); return obj; })
        .catch(function (e) {
          /* 送不出去就記下來，等下一次對得上時再補送，不要讓輪詢洗掉 */
          pend()[kind] = pend()[kind].concat([obj]);
          state.online = false; state.lastError = String(e.message || e); emit("offline"); return obj;
        });
    }
    if (state.mode === "claude" && claudeDb) {
      return claudeDb.collection("classes/" + state.classId + "/groups/" + state.groupId + "/" + kind)
        .doc(obj.id).set(obj).then(function () { return obj; }).catch(function () { return obj; });
    }
    return Promise.resolve(obj);
  }

  function remove(kind, id) {
    state.data[kind] = state.data[kind].filter(function (x) { return x.id !== id; });
    /* 還沒送出去就被刪掉的，不要再補送 */
    pend()[kind] = pend()[kind].filter(function (x) { return x.id !== id; });
    lsSave(); emit("change");
    if (state.mode === "sheet") {
      return sheetPost({ action: "remove", classId: state.classId, groupId: state.groupId, kind: kind, id: id })
        .catch(function (e) { state.online = false; state.lastError = String(e.message || e); emit("offline"); });
    }
    if (state.mode === "claude" && claudeDb) {
      return claudeDb.doc("classes/" + state.classId + "/groups/" + state.groupId + "/" + kind + "/" + id)
        .delete().catch(function () {});
    }
    return Promise.resolve();
  }

  function setMeta(meta) {
    state.meta = Object.assign({}, state.meta, meta);
    lsSave(); emit("change");
    if (state.mode === "sheet") {
      return sheetPost({ action: "meta", classId: state.classId, groupId: state.groupId, meta: state.meta })
        .then(function () { metaPending(false); state.online = true; emit("sync"); })
        .catch(function (e) {
          metaPending(true);   /* 輪詢時不要用伺服器的舊版覆蓋掉還沒送出的編輯 */
          state.online = false; state.lastError = String(e.message || e); emit("offline");
        });
    }
    if (state.mode === "claude" && claudeDb) {
      return claudeDb.doc("classes/" + state.classId + "/groups/" + state.groupId)
        .set(state.meta).catch(function () {});
    }
    return Promise.resolve();
  }

  /* 全班資料——教師看板與實證比對面板用 */
  function classSummary() {
    if (state.mode === "sheet") {
      return sheetGet({ action: "class", classId: state.classId })
        .then(function (j) {
          if (!j || j.ok === false) throw new Error((j && j.error) || "回應格式不對");
          return j;
        });
    }
    if (state.mode === "claude" && claudeDb) {
      return claudeDb.collection("classes/" + state.classId + "/flat").limit(1000).get()
        .then(function (snap) {
          return { groups: snap.docs.map(function (d) { return d.data(); }) };
        }).catch(function () { return { groups: [] }; });
    }
    /* 離線：只看得到這台電腦上存過的組別 */
    var out = [];
    if (LS) {
      for (var i = 0; i < LS.length; i++) {
        var k = LS.key(i);
        if (k && k.indexOf("hpl2:" + state.classId + ":") === 0) {
          try {
            var d = JSON.parse(LS.getItem(k) || "{}");
            out.push({ groupId: k.split(":")[2], data: d.data || {}, meta: d.meta || {} });
          } catch (e) {}
        }
      }
    }
    return Promise.resolve({ groups: out, local: true });
  }

  function init() {
    /* Claude Artifact 優先 */
    var c = global.claude;
    if (c && c.use) {
      return c.use("db").then(function (x) {
        if (x) { claudeDb = x; state.mode = "claude"; }
        else if (CFG.backendUrl) state.mode = "sheet";
        return state;
      }).catch(function () {
        if (CFG.backendUrl) state.mode = "sheet";
        return state;
      });
    }
    if (CFG.backendUrl) { state.mode = "sheet"; startPolling(); }
    return Promise.resolve(state);
  }

  global.HPLStore = {
    init: init, setGroup: setGroup, add: add, remove: remove, setMeta: setMeta,
    classSummary: classSummary, pull: pull, on: on, state: state, uid: uid,
    get: function (kind) { return state.data[kind] || []; },
    meta: function () { return state.meta; },
    clearLocal: function () { try { if (LS) LS.removeItem(lsKey()); } catch (e) {} setGroup(state.groupId); }
  };
})(window);
