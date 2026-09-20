/* ═══════════════════════════════════════════════════════════
   audio.js —— 決定音檔從哪裡來，並產生播放器
   順序由 config.js 的 audioOrder 決定；發布預設 drive → iframe

   雲端硬碟的對照表是「組別 → 原始檔名 → 檔案 ID」。
   說話人代號（A-a、F-b…）對應到哪一組的哪個檔名，
   由 content/groups.md 決定，這裡不重複寫一份。

   設了密碼的話，對照表要先通過 Apps Script 的檢查才拿得到。
   沒有對照表就沒有檔案 ID，也就播不了——密碼擋的是這個。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CFG = global.HPL_CONFIG || {};
  var manifest = null;          /* { "第一組": { "American1.m4a": "ID" }, ... } */
  var manifestErr = null;
  var needPass = false;
  var loading = null;
  var generation = 0;
  var listeners = [];

  var PASS_KEY = "hpl2:audiopass:" + (CFG.classId || "default");
  function savedPass() { try { return localStorage.getItem(PASS_KEY) || ""; } catch (e) { return ""; } }
  function savePass(v) { try { v ? localStorage.setItem(PASS_KEY, v) : localStorage.removeItem(PASS_KEY); } catch (e) {} }

  function emit() { listeners.forEach(function (f) { try { f(status()); } catch (e) {} }); }
  function status() {
    return { ready: !!manifest, needPassword: needPass, error: manifestErr,
             groups: manifest ? Object.keys(manifest).length : 0 };
  }

  /* ── 取得對照表 ──────────────────────────────────────────
     有 backendUrl 就跟 Apps Script 要（可帶密碼）；
     沒有後端時，只有明確填入 audioManifest 才讀靜態檔。          */
  function loadManifest(pass) {
    if (manifest) return Promise.resolve(manifest);
    if (loading && pass === undefined) return loading;

    var p = pass !== undefined ? pass : savedPass();
    var version = generation;
    var url = CFG.backendUrl || CFG.audioManifest;
    if (!url) {
      manifestErr = "音檔尚未設定，請老師完成後端設定。";
      emit();
      return Promise.reject(new Error(manifestErr));
    }
    var request = CFG.backendUrl ? {
      method: "POST", redirect: "follow", cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "manifest", pass: p })
    } : { cache: "no-store" };
    loading = fetch(url, request)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (version !== generation) { var stale = new Error("已取消"); stale.code = "stale"; throw stale; }
        if (j && j.ok === false) {
          if (j.error === "bad_password") {
            needPass = true; manifest = null;
            savePass("");
            manifestErr = null; emit();
            var e = new Error("需要密碼"); e.code = "bad_password"; throw e;
          }
          throw new Error(j.error === "audio_not_configured" ? "老師尚未設定音檔密碼。" :
            j.error === "audio_unavailable" ? "音檔暫時無法載入，請老師檢查資料夾設定。" : (j.error || "回應格式不對"));
        }
        var data = j && (j.byGroup || j);
        if (!data || typeof data !== "object" || Array.isArray(data) ||
            !Object.keys(data).every(function (g) {
              var files = data[g];
              return files && typeof files === "object" && !Array.isArray(files) &&
                Object.keys(files).every(function (fn) { return typeof files[fn] === "string" && /^[\w-]+$/.test(files[fn]); });
            })) throw new Error("音檔對照表格式不對，請老師檢查後端。");
        manifest = data;
        needPass = false; manifestErr = null;
        if (pass) savePass(pass);
        emit();
        return manifest;
      })
      .catch(function (e) {
        if (version !== generation) throw e;
        loading = null;
        if (e.code !== "bad_password") { manifestErr = String(e.message || e); emit(); }
        throw e;
      });
    return loading;
  }

  /* 學生按「解鎖」時呼叫。成功 → resolve(true) */
  function unlock(pass) {
    generation++; manifest = null; loading = null; needPass = false; manifestErr = null;
    return loadManifest(pass).then(function () { return true; });
  }

  /* ── 從對照表查出檔案 ID ──
     只用 (組別, 原始檔名)，避免同名但不同人的錄音被混用。 */
  function driveId(opts) {
    if (!manifest) return null;
    var g = opts && opts.group, fn = opts && opts.filename;
    if (g && fn && manifest[g] && manifest[g][fn]) return manifest[g][fn];
    if (fn && Object.keys(manifest).length === 1 && manifest._) return manifest._[fn] || null;
    return null;
  }

  /* Google 雲端硬碟的直接串流網址。
     兩個端點都試——Google 這幾年換過，不同帳號行為不一致。
     能否播放與 seek 仍要在實際瀏覽器確認。 */
  function driveUrls(id) {
    return [
      "https://drive.usercontent.google.com/download?id=" + id + "&export=download",
      "https://drive.google.com/uc?export=download&id=" + id
    ];
  }
  function drivePreview(id) { return "https://drive.google.com/file/d/" + id + "/preview"; }

  /* 試著用某個網址載入音檔。成功 → resolve(url) */
  function probe(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var a = new Audio();
      a.preload = "metadata";
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true; a.src = ""; reject(new Error("逾時"));
      }, timeoutMs || 9000);
      function ok() { if (done) return; done = true; clearTimeout(timer); a.src = ""; resolve(url); }
      function bad() { if (done) return; done = true; clearTimeout(timer); a.src = ""; reject(new Error("載入失敗")); }
      a.addEventListener("loadedmetadata", ok);
      a.addEventListener("canplay", ok);
      a.addEventListener("error", bad);
      a.src = url; a.load();
    });
  }

  /* 依序找出可用的來源 → {kind, url} 或 {kind:"none"|"locked"} */
  function resolve(spk, opts) {
    opts = opts || {};
    var order = CFG.audioOrder || ["drive", "iframe"];
    var wantsCloud = order.indexOf("drive") >= 0 || order.indexOf("iframe") >= 0;

    var version = generation;
    var lookup = (CFG.backendUrl || wantsCloud) ? loadManifest() : Promise.resolve(null);
    return lookup.catch(function () { return null; }).then(function () {
      if (version !== generation) return { kind: "none" };
      if (CFG.backendUrl && !manifest) return { kind: needPass ? "locked" : "none" };
      var chain = Promise.reject(new Error("start"));
      order.forEach(function (kind) {
        chain = chain.catch(function () {
          if (kind === "local") {
            return probe((CFG.audioLocalBase || "") + spk + ".m4a", 6000)
              .then(function (u) { return { kind: "local", url: u }; });
          }
          if (kind === "drive") {
            var id = driveId(opts);
            if (!id) return Promise.reject(new Error("對照表裡沒有這個檔案"));
            var c = Promise.reject(new Error("start"));
            driveUrls(id).forEach(function (u) {
              c = c.catch(function () {
                return probe(u, 15000).then(function (x) { return { kind: "drive", url: x }; });
              });
            });
            return c;
          }
          if (kind === "iframe") {
            var id2 = driveId(opts);
            if (!id2) return Promise.reject(new Error("對照表裡沒有這個檔案"));
            return Promise.resolve({ kind: "iframe", url: drivePreview(id2) });
          }
          return Promise.reject(new Error("不認得的來源 " + kind));
        });
      });
      return chain.catch(function () {
        return { kind: (needPass && wantsCloud) ? "locked" : "none" };
      });
    });
  }

  /* ── 密碼輸入框 ──
     放在播放器上面。解鎖成功後會呼叫 onUnlock() 讓頁面重畫。 */
  function passwordBar(host, onUnlock) {
    var box = document.createElement("div");
    box.className = "note warn passbar";
    box.innerHTML =
      '<strong>這些錄音需要密碼。</strong>密碼由老師在課堂上提供，輸入一次就會記住。' +
      '<div class="rowbtns" style="margin-top:10px">' +
      '<input type="password" class="mono" id="audio-pass" placeholder="請輸入密碼" ' +
      'autocomplete="off" style="width:auto;min-width:200px">' +
      '<button class="act primary" id="audio-unlock" type="button">解鎖</button>' +
      '<span class="muted" id="audio-passmsg"></span></div>';
    host.appendChild(box);

    var input = box.querySelector("#audio-pass");
    var btn = box.querySelector("#audio-unlock");
    var msg = box.querySelector("#audio-passmsg");

    function go() {
      if (btn.disabled) return;
      var v = input.value;
      if (!v) { input.focus(); return; }
      btn.disabled = true; msg.textContent = "檢查中…";
      unlock(v).then(function () {
        msg.textContent = "解鎖成功";
        box.remove();
        if (onUnlock) onUnlock();
      }).catch(function (e) {
        btn.disabled = false;
        msg.textContent = e.code === "bad_password" ? "密碼不對，請再試一次" : ("連不上：" + (e.message || e));
        input.select();
      });
    }
    btn.addEventListener("click", go);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    return box;
  }

  /* ── 產生一個播放器 ──
     host : 容器元素
     spk  : 說話人代號，例如 "A-a"
     opts : { label, filename, group, seconds, onGrab(秒數), onLocked() }   */
  function mount(host, spk, opts) {
    opts = opts || {};
    var box = document.createElement("div");
    box.className = "player";
    var head = document.createElement("div");
    head.className = "ph";
    head.innerHTML =
      "<b>" + MD.esc(opts.label || spk) + "</b>" +
      '<span class="fn">' + MD.esc(opts.filename || (spk + ".m4a")) + "</span>" +
      (opts.seconds ? '<span class="du">' + fmt(opts.seconds) + "</span>" : "") +
      '<span class="sp"></span><span class="srcbadge muted">尋找音檔…</span>';
    box.appendChild(head);
    var slot = document.createElement("div");
    box.appendChild(slot);
    host.appendChild(box);

    var api = { el: box, kind: "pending", currentTime: function () { return 0; } };

    resolve(spk, opts).then(function (r) {
      if (!host.contains(box)) return;
      api.kind = r.kind;
      var badge = head.querySelector(".srcbadge");

      if (r.kind === "locked") {
        badge.textContent = "需要密碼";
        badge.className = "srcbadge warn";
        slot.innerHTML = '<p class="muted mini">輸入上方的密碼之後就會載入。</p>';
        if (opts.onLocked) opts.onLocked();
        return;
      }

      if (r.kind === "none") {
        badge.textContent = "找不到音檔";
        badge.className = "srcbadge bad";
        slot.innerHTML = '<p class="muted mini">' + MD.esc(manifestErr ||
          ("無法載入「" + (opts.group || "?") + " / " + (opts.filename || spk) + "」。請老師檢查音檔設定。")) + '</p>';
        return;
      }

      if (r.kind === "iframe") {
        badge.textContent = "雲端播放器";
        badge.className = "srcbadge warn";
        slot.innerHTML = '<iframe class="dframe" src="' + MD.esc(r.url) +
          '" allow="autoplay" loading="lazy"></iframe>' +
          '<p class="muted mini">這個模式抓不到時間碼，請看著播放器自己填。</p>';
        return;
      }

      badge.textContent = r.kind === "local" ? "本機" : "雲端硬碟";
      badge.className = "srcbadge ok";
      var a = document.createElement("audio");
      a.controls = true; a.preload = "metadata"; a.src = r.url;
      slot.appendChild(a);
      api.currentTime = function () { return Math.floor(a.currentTime || 0); };

      if (opts.onGrab) {
        var b = document.createElement("button");
        b.className = "act tiny"; b.type = "button"; b.textContent = "抓時間碼";
        b.addEventListener("click", function () { opts.onGrab(api.currentTime()); });
        head.insertBefore(b, badge);
      }
    });

    return api;
  }

  function fmt(s) { return Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0"); }

  global.HPLAudio = {
    mount: mount, resolve: resolve, loadManifest: loadManifest, unlock: unlock,
    passwordBar: passwordBar, fmt: fmt, status: status,
    on: function (fn) { listeners.push(fn); },
    forget: function () { generation++; savePass(""); manifest = null; loading = null; needPass = false; manifestErr = null; emit(); }
  };
})(window);
