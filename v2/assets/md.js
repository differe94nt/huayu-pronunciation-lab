/* ═══════════════════════════════════════════════════════════
   md.js —— 把 content/*.md 讀進來變成資料或 HTML
   老師不需要改這個檔案。想改內容請改 content/ 裡的 .md。
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };

  /* ── 行內語法：**粗體** *斜體* `程式碼` [文字](網址) ── */
  function inline(s) {
    var out = esc(s);
    out = out.replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; });
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
      var safe = /^(https?:|mailto:|#|\.|\/)/.test(u) ? u : "#";
      return '<a href="' + esc(safe) + '" target="_blank" rel="noopener">' + t + "</a>";
    });
    return out;
  }

  /* ── 表格列 → 陣列 ── */
  function cells(line) {
    var t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return t.split("|").map(function (c) { return c.trim(); });
  }
  var isTableRow = function (l) { return /^\s*\|/.test(l); };
  var isDivider = function (l) { return /^\s*\|?[\s:.-]*-{2,}[\s:|.-]*$/.test(l) && l.indexOf("-") >= 0; };

  /* ── 把整份文件切成區塊 ── */
  function blocks(text) {
    var lines = String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/<!--[\s\S]*?-->/g, "")   /* 拿掉 HTML 註解 */
      .split("\n");
    var out = [], i = 0;

    while (i < lines.length) {
      var l = lines[i];

      if (!l.trim()) { i++; continue; }

      /* 標題 */
      var h = l.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push({ t: "h", level: h[1].length, text: h[2].trim() }); i++; continue; }

      /* 分隔線 */
      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(l)) { out.push({ t: "hr" }); i++; continue; }

      /* 表格 */
      if (isTableRow(l) && i + 1 < lines.length && isDivider(lines[i + 1])) {
        var head = cells(l), rows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
        out.push({ t: "table", head: head, rows: rows });
        continue;
      }

      /* 引言 */
      if (/^\s*>/.test(l)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          q.push(lines[i].replace(/^\s*>\s?/, "")); i++;
        }
        out.push({ t: "quote", text: q.join("\n") });
        continue;
      }

      /* 清單 */
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        var ordered = /^\s*\d+\./.test(l), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "").trim()); i++;
          /* 續行（縮排）併入上一項 */
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
            items[items.length - 1] += " " + lines[i].trim(); i++;
          }
        }
        out.push({ t: "list", ordered: ordered, items: items });
        continue;
      }

      /* 程式碼區塊 */
      if (/^\s*```/.test(l)) {
        var code = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        out.push({ t: "code", text: code.join("\n") });
        continue;
      }

      /* 段落 */
      var p = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*>|\s*```)/.test(lines[i]) &&
             !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) && !isTableRow(lines[i])) {
        p.push(lines[i].trim()); i++;
      }
      if (p.length) out.push({ t: "p", text: p.join(" ") });
    }
    return out;
  }

  /* ── 區塊 → HTML ── */
  function toHtml(bs) {
    return bs.map(function (b) {
      switch (b.t) {
        case "h": return "<h" + b.level + ">" + inline(b.text) + "</h" + b.level + ">";
        case "hr": return "<hr>";
        case "p": return "<p>" + inline(b.text) + "</p>";
        case "quote": return '<blockquote>' + inline(b.text) + "</blockquote>";
        case "code": return "<pre><code>" + esc(b.text) + "</code></pre>";
        case "list":
          var tag = b.ordered ? "ol" : "ul";
          return "<" + tag + ">" + b.items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + tag + ">";
        case "table":
          return '<div class="tw"><table><thead><tr>' +
            b.head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") +
            "</tr></thead><tbody>" +
            b.rows.map(function (r) {
              return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>";
            }).join("") + "</tbody></table></div>";
      }
      return "";
    }).join("\n");
  }

  /* ── 區塊 → 分節結構（給要當資料用的 .md） ──
     回傳 { title, sections:[ {heading, level, paras, notes, list, kv, tables, sub[]} ] }  */
  function structure(bs) {
    var doc = { title: "", sections: [] };
    var cur = null, sub = null;

    function blank(h, lv) {
      return { heading: h, level: lv, paras: [], notes: [], list: [], kv: {}, tables: [], sub: [] };
    }
    function target() { return sub || cur; }

    bs.forEach(function (b) {
      if (b.t === "h") {
        if (b.level === 1) { doc.title = b.text; return; }
        if (b.level === 2) { cur = blank(b.text, 2); sub = null; doc.sections.push(cur); return; }
        if (!cur) { cur = blank("", 2); doc.sections.push(cur); }
        sub = blank(b.text, b.level); cur.sub.push(sub); return;
      }
      if (!cur) { cur = blank("", 2); doc.sections.push(cur); }
      var t = target();
      if (b.t === "p") t.paras.push(b.text);
      else if (b.t === "quote") t.notes.push(b.text);
      else if (b.t === "table") t.tables.push({ head: b.head, rows: b.rows });
      else if (b.t === "list") {
        b.items.forEach(function (it) {
          t.list.push(it);
          /* 「鍵：值」自動收進 kv */
          var m = it.match(/^([^：:]{1,24})[：:]\s*(.+)$/);
          if (m) t.kv[m[1].trim()] = m[2].trim();
        });
      }
    });
    return doc;
  }

  /* ── 抓檔案 ── */
  var cache = {};
  function load(path) {
    if (cache[path]) return cache[path];
    cache[path] = fetch(path, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.text();
      })
      .then(function (txt) {
        var bs = blocks(txt);
        return { path: path, text: txt, blocks: bs, html: toHtml(bs), doc: structure(bs) };
      })
      .catch(function (e) {
        delete cache[path];
        throw new Error("讀不到 " + path + "：" + e.message);
      });
    return cache[path];
  }

  /* ── 表格 → 物件陣列（用表頭當鍵） ── */
  function rowsToObjects(table) {
    if (!table) return [];
    return table.rows.map(function (r) {
      var o = {};
      table.head.forEach(function (h, i) { o[h] = r[i] == null ? "" : r[i]; });
      o._ = r;
      return o;
    });
  }

  global.MD = {
    load: load, blocks: blocks, toHtml: toHtml, structure: structure,
    inline: inline, esc: esc, rowsToObjects: rowsToObjects,
    /* 一次讀多份，回傳以短名為鍵的物件 */
    loadAll: function (base, names) {
      return Promise.all(names.map(function (n) { return load(base + n + ".md"); }))
        .then(function (list) {
          var o = {};
          names.forEach(function (n, i) { o[n] = list[i]; });
          return o;
        });
    }
  };
})(window);
