/* ═══════════════════════════════════════════════════════════════
   唯一需要你動手改的檔案。其他 .js 都不用碰。
   改完存檔、重新整理瀏覽器即可。
   ═══════════════════════════════════════════════════════════════ */

window.HPL_CONFIG = {

  /* ── 1. 班級代號 ───────────────────────────────────────────
     資料依班級分開存，不同班不會互相看到。

     只開一班：classes 留一個，classId 填同一個就好。

     同時開好幾班：把代號都列進 classes，然後發給每一班
     專屬的網址，網頁會自己切換：
         .../v2/?class=2026-fall-A
         .../v2/?class=2026-fall-B
     網址沒帶 ?class= 時，用 classId 這一個當預設。

     ★ 這份清單必須跟 backend/Code.gs 的 ALLOWED_CLASSES 一模一樣，
       否則學生存得下去、後端會擋掉。                            */
  classes: ["2026-fall", "2026-fall-A", "2026-fall-B"],
  classId: "2026-fall",

  /* ── 2. 音檔要從哪裡來 ──────────────────────────────────────
     依序嘗試，先成功的就用哪一個。

     "local"  → audioLocalBase 指向的資料夾（僅供本機備課）
     "drive"  → Google 雲端硬碟直接串流（可以拖進度條、可以抓時間碼）
     "iframe" → 雲端硬碟的內建播放器（仍受分享權限限制，抓不到時間碼）

     發布到 GitHub Pages 時建議拿掉 "local"，因為 audio/ 不會上傳：
        audioOrder: ["drive", "iframe"],
     留著也行，只是每個檔案會先白等一次 404 再換雲端。          */
  audioOrder: ["drive", "iframe"],

  /* 音檔對照表。
     下面的 backendUrl 有填的話，**這一行會被忽略**——
     對照表改成跟 Apps Script 要，密碼才有意義（見 backend/SETUP.md C 節）。
     預設不讀靜態檔。本機無密碼測試才填 "audio-manifest.json"。                                */
  audioManifest: "",

  /* 本機 audio/ 資料夾的相對位置（相對於這個 v2 資料夾）         */
  audioLocalBase: "../audio/",

  /* ── 3. Apps Script 後端網址 ─────────────────────────────────
     一個網址管兩件事：
       (a) 收學生的標註，老師的即時看板才看得到；
       (b) 供應音檔對照表，並在那裡檢查音檔密碼。

     留空 = 兩件都不做：資料只存在學生自己的瀏覽器，
     雲端音檔預設停用。靜態對照表只能留在本機，不要發布。

     照 backend/SETUP.md 部署之後，把它給你的網址
     （https://script.google.com/macros/s/..../exec）貼進這一行。 */
  backendUrl: "https://script.google.com/macros/s/AKfycbwTLoM_qo1WETYhWKw8Saa7yTptnNYlMg4xBm8I0piOF1jN87DgyK3WAsYg6tig2eSy/exec",

  /* 教師看板多久抓一次新資料（毫秒）。太短會吃掉 Apps Script 配額。*/
  pollMs: 12000,

  /* ── 4. 學生要不要填「分母」 ─────────────────────────────────
     true  = 每筆觀察都要填「這個現象在這段語料裡有幾次機會出現」。
             有分母才能算出真正的出現率，才能跟預測比對。
     false = 只記次數。比對面板會改用「幾位說話人出現過」當指標。   */
  requireDenominator: true,

  /* ── 5. 規律成立的門檻 ──────────────────────────────────────  */
  ruleThreshold: { speakers: 2, total: 3 },

  /* ── 6. 內容檔案放哪裡 ──────────────────────────────────────  */
  contentBase: "content/"
};

/* ── 從網址的 ?class= 決定這一次算哪一班 ──────────────────────
   只認 classes 裡列出的代號。網址打錯字不會偷偷開一個新班級，
   而是退回預設值並在畫面上提示——否則學生的資料會存進一個
   老師永遠不會去看的地方。                                      */
(function (C) {
  if (!C) return;
  var list = (C.classes && C.classes.length) ? C.classes.slice() : [C.classId];
  C.classes = list;
  if (list.indexOf(C.classId) < 0) C.classId = list[0];

  var q = "";
  try { q = (typeof location !== "undefined" && location.search) || ""; } catch (e) {}
  var m = /[?&]class=([^&#]*)/.exec(q);
  if (!m) return;

  var want = "";
  try { want = decodeURIComponent(m[1]).trim(); } catch (e) { want = String(m[1]).trim(); }
  if (!want) return;

  if (list.indexOf(want) >= 0) { C.classId = want; return; }
  C.classWarning = "網址指定的班級「" + want + "」不在 config.js 的 classes 清單裡，" +
    "已改用「" + C.classId + "」。請確認發出去的連結。";
})(window.HPL_CONFIG);
