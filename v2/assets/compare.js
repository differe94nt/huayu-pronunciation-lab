/* ═══════════════════════════════════════════════════════════
   compare.js —— 把學生的標註跟糾音工作台的預測放在一起比

   兩邊的量本來就不同單位，所以這裡不硬湊成同一個百分比：
     預測 = 序位（強 3／中 2／弱 1／優勢 0）
     觀察 = 有分母就算出現率，沒分母就算「幾位說話人出現過」
   真正可以下判斷的是**排序是否一致**，以及命中／落空／預測之外。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ── 把一堆觀察記錄彙總成 母語 → 比對鍵 → 統計 ── */
  function aggregate(records, D) {
    var byL1 = {};
    (records || []).forEach(function (r) {
      var key = r.key || (D && D.tagKey ? D.tagKey[r.tag] : "");
      if (!key) return;
      var l1 = r.l1 || "";
      if (!l1) return;
      var L = byL1[l1] || (byL1[l1] = { keys: {}, speakers: {}, records: 0, withDenom: 0 });
      L.records++;
      if (r.spkId) L.speakers[r.spkId] = true;
      var K = L.keys[key] || (L.keys[key] = { hits: 0, denom: 0, speakers: {}, groups: {}, tri: {} });
      K.hits++;
      var d = parseFloat(r.denom);
      if (!isNaN(d) && d > 0) { K.denom += d; L.withDenom++; }
      if (r.spkId) K.speakers[r.spkId] = true;
      if (r.group) K.groups[r.group] = true;
      if (r.tri) K.tri[r.tri] = (K.tri[r.tri] || 0) + 1;
    });

    Object.keys(byL1).forEach(function (l1) {
      var L = byL1[l1];
      L.speakerCount = Object.keys(L.speakers).length;
      Object.keys(L.keys).forEach(function (k) {
        var K = L.keys[k];
        K.speakerCount = Object.keys(K.speakers).length;
        K.groupCount = Object.keys(K.groups).length;
        K.rate = K.denom > 0 ? K.hits / K.denom : null;
        K.coverage = L.speakerCount > 0 ? K.speakerCount / L.speakerCount : null;
      });
    });
    return byL1;
  }

  /* ── 找出這個母語對應的示範學習者 ── */
  function learnerFor(D, l1) {
    var target = (D.l1Alias && D.l1Alias[l1]) || l1;
    var hit = null;
    D.learners.forEach(function (L) {
      if (L.l1 === target) hit = L;
      else if (!hit && (D.l1Alias && D.l1Alias[L.l1]) === target) hit = L;
    });
    return hit;
  }

  /* ── 產生比對列 ── */
  function compare(D, agg, l1) {
    var L = learnerFor(D, l1);
    var obs = (agg && agg[l1]) || { keys: {}, speakerCount: 0, records: 0, withDenom: 0 };
    var rows = {}, order = [];

    function slot(key) {
      if (!rows[key]) {
        rows[key] = {
          key: key,
          name: (D.keyName && D.keyName[key]) || key,
          level: (D.keyLevel && D.keyLevel[key]) || "",
          pred: null, predW: null, sev: "", ev: "", targets: [],
          hits: 0, speakerCount: 0, groupCount: 0, rate: null, coverage: null,
          baseline: (D.baseline && D.baseline[key]) || null
        };
        order.push(key);
      }
      return rows[key];
    }

    /* 預測側：同一個鍵可能有好幾條偏誤項，取最強的那一條 */
    if (L) L.e.forEach(function (e) {
      if (!e.key) return;
      var s = slot(e.key);
      s.targets.push(e.target);
      if (s.predW == null || e.w > s.predW) {
        s.predW = e.w; s.pred = e.strength; s.sev = e.sev; s.sevclass = e.sevclass;
        s.ev = e.ev; s.evclass = e.evclass; s.cause = e.cause;
      }
    });

    /* 觀察側 */
    Object.keys(obs.keys).forEach(function (k) {
      var s = slot(k), K = obs.keys[k];
      s.hits = K.hits; s.speakerCount = K.speakerCount; s.groupCount = K.groupCount;
      s.rate = K.rate; s.coverage = K.coverage; s.denom = K.denom; s.tri = K.tri;
    });

    /* 判定 */
    order.forEach(function (k) {
      var s = rows[k];
      var predicted = s.predW != null && s.predW > 0;
      var observed = s.hits > 0;
      s.verdict = predicted && observed ? "hit"
        : predicted && !observed ? "miss"
        : !predicted && observed ? "extra"
        : "na";
      /* 觀察側用來排序的值：有分母用出現率，沒有就用覆蓋率 */
      s.obsValue = s.rate != null ? s.rate : s.coverage;
    });

    var list = order.map(function (k) { return rows[k]; });
    list.sort(function (a, b) {
      var av = a.obsValue == null ? -1 : a.obsValue, bv = b.obsValue == null ? -1 : b.obsValue;
      if (bv !== av) return bv - av;
      return (b.predW || 0) - (a.predW || 0);
    });

    return {
      l1: l1, learner: L, rows: list,
      speakerCount: obs.speakerCount, records: obs.records,
      hasDenominator: obs.withDenom > 0,
      denomShare: obs.records ? obs.withDenom / obs.records : 0,
      agreement: agreement(list)
    };
  }

  /* ── 排序一致度（Spearman ρ）──
     只用「預測與觀察兩邊都有值」的項目來算。
     項目少於 4 個就不給數字——樣本太小，算出來沒有意義。 */
  function agreement(rows) {
    var pairs = rows.filter(function (r) {
      return r.predW != null && r.obsValue != null;
    }).map(function (r) { return { p: r.predW, o: r.obsValue }; });

    if (pairs.length < 4) return { n: pairs.length, rho: null, why: "配對項目少於 4 個，不計算" };

    var rp = ranks(pairs.map(function (x) { return x.p; }));
    var ro = ranks(pairs.map(function (x) { return x.o; }));
    var n = pairs.length;
    var mp = mean(rp), mo = mean(ro);
    var num = 0, dp = 0, dobs = 0;
    for (var i = 0; i < n; i++) {
      var a = rp[i] - mp, b = ro[i] - mo;
      num += a * b; dp += a * a; dobs += b * b;
    }
    var rho = (dp && dobs) ? num / Math.sqrt(dp * dobs) : null;
    return { n: n, rho: rho, why: "" };
  }
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
  /* 平均秩，處理同分 */
  function ranks(v) {
    var idx = v.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) { return a.x - b.x; });
    var out = new Array(v.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && idx[j + 1].x === idx[i].x) j++;
      var r = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) out[idx[k].i] = r;
      i = j + 1;
    }
    return out;
  }

  /* ── 把所有組別的記錄攤平成一個陣列 ── */
  function flatten(classData, D) {
    var out = [];
    (classData.groups || []).forEach(function (g) {
      var meta = D.groups.filter(function (x) { return x.id === g.groupId || x.n === g.groupId; })[0];
      var recs = (g.data && g.data.records) || g.records || [];
      recs.forEach(function (r) {
        out.push(Object.assign({}, r, {
          group: r.group || (meta ? meta.n : g.groupId),
          l1: r.l1 || (meta ? meta.l1 : "")
        }));
      });
    });
    return out;
  }

  global.HPLCompare = {
    aggregate: aggregate, compare: compare, learnerFor: learnerFor,
    flatten: flatten, agreement: agreement
  };
})(window);
