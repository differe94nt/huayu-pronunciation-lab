/* ═══════════════════════════════════════════════════════════
   viz.js —— 共用的圖：五度制調型、熱區條、比對條
   全部用內嵌 SVG 與 CSS 變數，深淺色模式都會自己跟著變。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TONE_TARGET = {
    "1": [[0, 5], [1, 5]],
    "2": [[0, 3], [1, 5]],
    "3": [[0, 2], [.45, 1], [1, 4]],
    "4": [[0, 5], [1, 1]]
  };
  var TONE_NAMES = { "1": ["陰平", "55"], "2": ["陽平", "35"], "3": ["上聲", "214"], "4": ["去聲", "51"] };

  /* ── 五度制調型 ── */
  function toneSvg(actual, opts) {
    opts = opts || {};
    var W = 118, H = 96, P = 16;
    var x = function (p) { return (P + p * (W - 2 * P)).toFixed(1); };
    var y = function (v) { return (P + (5 - v) / 4 * (H - 2 * P)).toFixed(1); };
    var path = function (pts) {
      return pts.map(function (p, i) { return (i ? "L" : "M") + x(p[0]) + " " + y(p[1]); }).join(" ");
    };
    var grid = "";
    for (var v = 1; v <= 5; v++) {
      grid += '<line x1="' + x(0) + '" y1="' + y(v) + '" x2="' + x(1) + '" y2="' + y(v) +
        '" stroke="var(--rule)" stroke-width="1"/>';
    }
    var t = opts.target || [];
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
      MD.esc(opts.label || "五度制調型") + '">' + grid;
    if (t.length) {
      svg += '<path d="' + path(t) + '" fill="none" stroke="var(--rule-strong)" stroke-width="2" ' +
        'stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    if (actual && actual.length) {
      svg += '<path d="' + path(actual) + '" fill="none" stroke="var(--indigo)" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>';
      svg += '<circle cx="' + x(actual[0][0]) + '" cy="' + y(actual[0][1]) + '" r="2.6" fill="var(--indigo)"/>';
      var last = actual[actual.length - 1];
      svg += '<circle cx="' + x(last[0]) + '" cy="' + y(last[1]) + '" r="2.6" fill="var(--indigo)"/>';
    }
    return svg + "</svg>";
  }

  /* 一位學習者的四個聲調 */
  function toneGrid(learner) {
    return '<div class="tonegrid">' + ["1", "2", "3", "4"].map(function (t) {
      var nm = TONE_NAMES[t];
      return '<div class="tonecell"><h5>' + nm[0] + "</h5><div class=\"tn\">" + nm[1] + "</div>" +
        toneSvg(learner.tone[t], { target: TONE_TARGET[t], label: nm[0] + " " + nm[1] }) +
        '<div class="note-t">' + MD.esc(learner.tnote[t] || "") + "</div></div>";
    }).join("") + "</div>";
  }

  /* ── 五層面熱區條 ── */
  function heatBars(learner, levels) {
    var by = {};
    learner.e.forEach(function (e) {
      var b = by[e.lv] || (by[e.lv] = { sum: 0, worst: 0, sevclass: "C", items: [] });
      b.sum += e.w; b.items.push(e);
      if (e.sevw > b.worst) { b.worst = e.sevw; b.sevclass = e.sevclass; }
    });
    var names = (levels || []).map(function (l) { return l.n; });
    Object.keys(by).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); });
    var max = Math.max.apply(null, names.map(function (n) { return by[n] ? by[n].sum : 0 }).concat([1]));
    var colorOf = { A: "var(--crimson)", B: "var(--ochre)", C: "var(--teal)" };

    return '<div class="cmp">' + names.filter(function (n) { return by[n]; }).map(function (n) {
      var b = by[n], pct = (b.sum / max * 100).toFixed(1);
      return '<div class="cmprow"><div class="lbl">' + MD.esc(n) + "</div>" +
        '<div class="bars"><div class="cmpbar"><i style="width:' + pct + "%;background:" +
        (colorOf[b.sevclass] || "var(--indigo)") + '"></i></div></div>' +
        '<div class="val">' + b.items.length + " 項</div></div>";
    }).join("") + "</div>";
  }

  /* ── 預測 vs 觀察 比對條 ── */
  function compareBars(result, opts) {
    opts = opts || {};
    var rows = result.rows.filter(function (r) { return r.predW > 0 || r.hits > 0; });
    if (!rows.length) return '<p class="muted">還沒有可以比對的資料。</p>';

    /* 一筆觀察都沒有的時候，全部標成「落空」會誤導——那是還沒開始，不是預測失敗 */
    if (!result.records) {
      return '<p class="muted">' + MD.esc(result.l1) +
        " 還沒有任何學生標註。下面先列出工作台對這個母語的預測，等資料進來就會並排顯示。</p>" +
        '<div class="cmp" style="margin-top:12px">' + rows.map(function (r) {
          return '<div class="cmprow"><div class="lbl">' + MD.esc(r.name) +
            (r.ev ? ' <span class="ev ' + r.evclass + '">' + MD.esc(r.ev) + "</span>" : "") + "</div>" +
            '<div class="bars"><div class="cmpbar pred"><i style="width:' +
            (r.predW / 3 * 100).toFixed(1) + '%"></i></div></div>' +
            '<div class="val">' + MD.esc(r.pred || "—") + "</div></div>";
        }).join("") + "</div>";
    }

    var maxObs = Math.max.apply(null, rows.map(function (r) { return r.obsValue || 0; }).concat([0.0001]));
    var unit = result.hasDenominator ? "出現率" : "說話人覆蓋率";

    var html = '<div class="cmplegend">' +
      '<span><i style="background:var(--rule-strong)"></i>預測強度（序位）</span>' +
      '<span><i style="background:var(--indigo)"></i>本班觀察（' + unit + '）</span>' +
      (rows.filter(function (r) { return r.baseline; }).length
        ? '<span><i style="background:var(--ochre)"></i>文獻基準線</span>' : "") +
      "</div><div class=\"cmp\" style=\"margin-top:12px\">";

    html += rows.map(function (r) {
      var predPct = r.predW != null ? (r.predW / 3 * 100).toFixed(1) : 0;
      var obsPct = r.obsValue != null ? (r.obsValue / maxObs * 100).toFixed(1) : 0;
      var vlabel = { hit: "命中", miss: "落空", extra: "預測之外", na: "—" }[r.verdict];
      var base = r.baseline
        ? '<div class="cmpbar" title="' + MD.esc(r.baseline.cite) + '"><i style="width:' +
          (r.baseline.v / maxObs * 100).toFixed(1) + '%;background:var(--ochre)"></i></div>'
        : "";
      var val = r.obsValue == null ? "—"
        : (r.rate != null ? (r.rate * 100).toFixed(0) + "%" : r.speakerCount + "/" + result.speakerCount + " 人");
      return '<div class="cmprow">' +
        '<div class="lbl">' + MD.esc(r.name) +
          (r.ev ? ' <span class="ev ' + r.evclass + '">' + MD.esc(r.ev) + "</span>" : "") + "</div>" +
        '<div class="bars">' +
          '<div class="cmpbar pred"><i style="width:' + predPct + '%"></i></div>' +
          '<div class="cmpbar obs"><i style="width:' + obsPct + '%"></i></div>' + base +
        "</div>" +
        '<div class="val">' + val + ' <span class="agree ' + r.verdict + '">' + vlabel + "</span></div>" +
        "</div>";
    }).join("");

    return html + "</div>";
  }

  global.HPLViz = {
    toneSvg: toneSvg, toneGrid: toneGrid, heatBars: heatBars, compareBars: compareBars,
    TONE_TARGET: TONE_TARGET, TONE_NAMES: TONE_NAMES
  };
})(window);
