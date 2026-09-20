/* ═══════════════════════════════════════════════════════════
   data.js —— 把 content/*.md 變成頁面要用的資料結構
   老師不需要改這個檔案。內容都在 content/ 裡。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var CFG = global.HPL_CONFIG || {};
  var BASE = CFG.contentBase || "content/";

  var num = function (v, d) { var n = parseFloat(v); return isNaN(n) ? (d == null ? 0 : d) : n; };
  var sec = function (doc, name) {
    for (var i = 0; i < doc.sections.length; i++) if (doc.sections[i].heading === name) return doc.sections[i];
    return null;
  };
  /* 標題寬鬆比對：先找完全一樣的，找不到就找「包含」的。
     老師常會把「分工建議」改寫成「參考分工建議」之類，
     完全比對會整塊資料悄悄消失，什麼錯誤也不會報。 */
  var secLike = function (doc, name) {
    var hit = sec(doc, name);
    if (hit) return hit;
    for (var i = 0; i < doc.sections.length; i++) {
      var h = doc.sections[i].heading || "";
      if (h.indexOf(name) >= 0 || (name.length > 2 && name.indexOf(h) >= 0 && h.length > 2)) return doc.sections[i];
    }
    return null;
  };
  /* 標題含「提醒」或「重要」的區塊 → 置頂橫幅 */
  var secBanner = function (doc) {
    for (var i = 0; i < doc.sections.length; i++) {
      var h = doc.sections[i].heading || "";
      if (/提醒|重要/.test(h)) return doc.sections[i];
    }
    return null;
  };
  var firstTable = function (s) { return s && s.tables[0] ? s.tables[0] : null; };
  var objs = function (s) { return MD.rowsToObjects(firstTable(s)); };

  /* 「檔名｜秒數｜代號」 */
  function parseFile(cell) {
    var p = String(cell || "").split(/[｜|]/).map(function (x) { return x.trim(); });
    return [p[0] || "", num(p[1], 0), p[2] || ""];
  }

  /* 「1=0:4, 1:4；2=0:3, 1:4」→ {1:[[0,4],[1,4]], 2:[[0,3],[1,4]]} */
  function parseTone(s) {
    var out = {};
    String(s || "").split(/[；;]/).forEach(function (part) {
      var m = part.split("=");
      if (m.length < 2) return;
      var t = m[0].trim();
      out[t] = m[1].split(",").map(function (pt) {
        var kv = pt.split(":");
        return [num(kv[0]), num(kv[1])];
      }).filter(function (p) { return !isNaN(p[0]); });
    });
    return out;
  }
  /* 「1=調域偏低；2=升幅不足」→ {1:"調域偏低", 2:"升幅不足"} */
  function parseNotes(s) {
    var out = {};
    String(s || "").split(/[；;]/).forEach(function (part) {
      var m = part.split("=");
      if (m.length >= 2) out[m[0].trim()] = m.slice(1).join("=").trim();
    });
    return out;
  }

  var STRENGTH = { "強": 3, "中": 2, "弱": 1, "優勢": 0 };
  var SEVW = { "高": 3, "中": 2, "低": 1, "優勢": 0 };
  var SEVCLASS = { "高": "A", "中": "B", "低": "C", "優勢": "C" };
  var EVCLASS = { "甲": "j", "乙": "y", "丙": "b", "丁": "d" };

  function build(files) {
    var D = {};

    /* ── 組別 ── */
    var gt = objs(sec(files.groups.doc, "組別"));
    var cnum = 0;
    D.groups = gt.map(function (r) {
      cnum++;
      return {
        id: "g" + String(cnum).padStart(2, "0"),
        n: r["組別"], l1: r["母語"],
        f: [parseFile(r["S1"]), parseFile(r["S2"]), parseFile(r["S3"])].filter(function (x) { return x[2]; })
      };
    });
    var gnote = sec(files.groups.doc, "說明");
    D.groupsNote = (gnote && gnote.notes[0]) || "";

    /* ── 面向與標籤 ── */
    D.levels = files.levels.doc.sections.map(function (s) {
      return {
        n: s.heading,
        k: s.heading,
        tags: MD.rowsToObjects(s.tables[0]).map(function (r) {
          return { tag: r["標籤"], key: (r["比對鍵"] || "").trim() };
        }).filter(function (t) { return t.tag; })
      };
    }).filter(function (l) { return l.tags.length; });

    D.tagKey = {};
    D.levels.forEach(function (l) { l.tags.forEach(function (t) { if (t.key) D.tagKey[t.tag] = t.key; }); });

    /* ── 音韻對照 ── */
    D.contrast = {};
    files.contrast.doc.sections.forEach(function (s) {
      if (!s.tables[0]) return;
      D.contrast[s.heading] = {
        plus: s.notes[0] || "",
        rows: s.tables[0].rows
      };
    });

    /* ── 糾音知識庫 ── */
    D.kb = {}; D.kbDefault = null;
    objs(sec(files.kb.doc, "條目")).forEach(function (r) {
      var entry = {
        d: r["診斷"] || "",
        p: r["操作要領"] || "",
        pairs: (r["最小對立對"] || "").split(/[，,]/).map(function (x) { return x.trim(); }).filter(Boolean)
      };
      if (r["標籤"] === "預設") D.kbDefault = entry; else D.kb[r["標籤"]] = entry;
    });
    D.kbDefault = D.kbDefault || { d: "", p: "", pairs: [] };

    /* ── 課程結構 ── */
    var c = files.course.doc;
    D.steps = objs(secLike(c, "四個步驟"));
    D.triage = objs(secLike(c, "三分類"));
    D.roles = objs(secLike(c, "分工建議"));
    if (!D.roles.length) D.roles = objs(secLike(c, "六人角色"));   /* 舊標題相容 */
    D.advice = objs(secLike(c, "對課程邏輯的建議"));
    D.rubricIndex = objs(secLike(c, "評分規準"));
    D.srcLevels = objs(secLike(c, "來源層級"));

    /* 置頂提醒：標題含「提醒」或「重要」的區塊，會顯示在每個分頁最上面 */
    var bn = secBanner(c);
    D.banner = bn ? { title: bn.heading, paras: bn.paras.concat(bn.notes), list: bn.list } : null;

    /* ── 示範學習者 ── */
    D.learners = files.learners.doc.sections.map(function (s, i) {
      var parts = s.heading.split(/[｜|]/);
      var kv = s.kv;
      return {
        id: "L" + i,
        name: (parts[0] || "").trim(),
        l1: (parts[1] || "").trim(),
        lvl: kv["程度"] || "",
        dur: kv["學習時間"] || "",
        src: kv["可驗證來源"] || "",
        tone: parseTone(kv["調型"]),
        tnote: parseNotes(kv["調註"]),
        e: MD.rowsToObjects(s.tables[0]).map(function (r) {
          return {
            lv: r["面向"], target: r["目標"], realized: r["預期實現"], example: r["例子"],
            strength: r["預測強度"] || "中", w: STRENGTH[r["預測強度"]] == null ? 2 : STRENGTH[r["預測強度"]],
            sev: r["嚴重度"] || "中", sevw: SEVW[r["嚴重度"]] == null ? 2 : SEVW[r["嚴重度"]],
            sevclass: SEVCLASS[r["嚴重度"]] || "B",
            cause: r["偏誤來源"] || "",
            ev: r["證據"] || "", evclass: EVCLASS[r["證據"]] || "b",
            key: (r["比對鍵"] || "").trim()
          };
        }).filter(function (e) { return e.target; })
      };
    }).filter(function (l) { return l.e && l.e.length; });

    /* ── 比對鍵 ── */
    var tm = files.tagmap.doc;
    D.keyName = {}; D.keyLevel = {};
    objs(sec(tm, "比對鍵")).forEach(function (r) {
      D.keyName[r["鍵"]] = r["顯示名稱"]; D.keyLevel[r["鍵"]] = r["面向"];
    });
    D.l1Alias = {};
    objs(sec(tm, "母語別名")).forEach(function (r) { D.l1Alias[r["語料的母語"]] = r["對應的示範學習者母語"]; });
    D.baseline = {};
    objs(sec(tm, "外部基準線")).forEach(function (r) {
      D.baseline[r["比對鍵"]] = { v: num(r["數值"]), scope: r["母語範圍"], cite: r["出處"] };
    });
    D.readCompare = objs(sec(tm, "怎麼讀比對結果"));

    /* ── 語料庫 ── */
    D.corpora = files.corpora.doc.sections.map(function (s) {
      return {
        n: s.heading, u: s.kv["網址"] || "", c: s.kv["內容"] || "", a: s.kv["標註"] || "",
        g: s.kv["取得"] || "", f: s.kv["適用"] || "", caveat: s.kv["但書"] || "",
        best: (s.kv["推薦"] || "").indexOf("是") >= 0
      };
    });

    /* ── 純文字頁 ── */
    D.manualHtml = files.manual.html;
    D.referencesHtml = files.references ? files.references.html : "";
    /* 結構化的書目，讓不同頁面挑自己要顯示的欄位：
       學生頁只列書目與連結，工作台列完整四欄。 */
    D.references = files.references ? files.references.doc.sections.map(function (s) {
      var t = s.tables[0];
      return {
        heading: s.heading, notes: s.notes, paras: s.paras,
        head: t ? t.head : [], rows: t ? MD.rowsToObjects(t) : []
      };
    }) : [];
    D.evidenceHtml = files.evidence.html;
    D.promptText = (function () {
      var b = files.prompt.blocks.filter(function (x) { return x.t === "code"; });
      return b.length ? b[0].text : files.prompt.text;
    })();

    /* ── 派生：說話人 → 組別 ── */
    D.speakerMap = {};
    D.groups.forEach(function (g) {
      g.f.forEach(function (f) {
        (D.speakerMap[f[2]] = D.speakerMap[f[2]] || { dur: f[1], gs: [] }).gs.push(g.n);
      });
    });
    D.l1s = D.groups.map(function (g) { return g.l1; }).filter(function (v, i, a) { return a.indexOf(v) === i; });

    return D;
  }

  var NEEDED = ["groups", "levels", "contrast", "kb", "course", "learners", "tagmap", "corpora", "manual", "evidence", "prompt", "references"];

  global.HPLData = {
    load: function (names) {
      return MD.loadAll(BASE, names || NEEDED).then(build);
    },
    STRENGTH: STRENGTH, SEVW: SEVW
  };
})(window);
