# Google 後端設定

第一次部署需要在你自己的 Google 帳號完成以下操作。密碼與資料夾 ID
只放在 Google 的「指令碼屬性」，不要貼到 GitHub。
發布步驟見 [PUBLISH.md](../PUBLISH.md)。

## 1. 建立試算表與程式

1. 建立私人 Google 試算表，選 **擴充功能 → Apps Script**。
2. 用本資料夾的 `Code.gs` 全文取代預設程式，存檔。
3. 確認 `ALLOWED_CLASSES` 與 `config.js` 的 `classes` 清單完全一致（多班級見下方專節）。
4. 開啟 **專案設定 → 指令碼屬性 → 新增指令碼屬性**：

   | 屬性 | 值 |
   |---|---|
   | `AUDIO_FOLDER_ID` | 語料資料夾網址中 `/folders/` 後面的 ID |
   | `AUDIO_PASSWORD` | 課堂密碼，建議用長且不易猜的密碼，至少 8 個字 |

5. 執行 `setAudioPassword` 檢查設定；這個函式不會印出密碼。

沒有設定密碼時，後端會拒絕交出對照表。`clearAudioPassword` 會停用對照表，
不會切換成公開模式。更換屬性不需重新部署。

## 2. 調整 Drive 分享

執行 **`lockDownAudioFiles`**，第一次依 Google 畫面授權。
它會遞迴把資料夾與檔案的一般連結分享設成 **知道連結的人可以檢視**。
若資料夾原本開放編輯，這會降低一般連結使用者的權限。

**另外檢查 Drive 分享面板中的具名、群組、上層繼承權限。**
此函式不會移除這些權限；因此不能保證所有學生都失去編輯權。
學校管理員也可能禁止對外分享，遇到錯誤要依執行記錄處理。
參考 [Google 的 setSharing 說明](https://developers.google.com/apps-script/reference/drive/folder#setSharing(Access,Permission))。

資料夾結構與檔名必須對應 `content/groups.md`：

```text
語料/
├── 第一組/ American1.m4a、American2.m4a、American3.m4a
├── 第二組/ French1.wav、French2.wav、French3.wav
└── …
```

程式只查 **組別＋完整檔名**，不會跨組找同名檔案，因為同名可能是不同說話人。
完全沒有分組時可用 `_` 對照表，但同名檔不能代表不同人。

替換成壓縮 m4a 時，依說話人代號選對本機檔案，再依每一組對照命名；
原本 `.wav`／`.mp3` 的列也要把 `groups.md` 副檔名改成 `.m4a`。
不要把 m4a 內容改名成 wav。共用說話人可能需要放進多組，27 位說話人不等於 27 個組內檔案。
移除同資料夾內同名的舊檔，避免 Drive 允許重名造成歧義。
改完執行 **`refreshAudioManifest`** 並重新整理網頁；否則伺服器最多快取 15 分鐘。

## 3. 部署網頁應用程式

1. **部署 → 新增部署作業 → 網頁應用程式**。
2. 執行身分選 **我**；誰可以存取選 **所有人**。
3. 部署、授權，複製以 `/exec` 結尾的網址。
4. 貼到 `v2/config.js` 的 `backendUrl`。保留：

   ```js
   audioOrder: ["drive", "iframe"],
   audioManifest: "",
   ```

網址會出現在公開前端，並不是秘密。
改 `Code.gs` 後，要到 **部署 → 管理部署作業 → 編輯 → 新版本 → 部署**；
只存檔不會更新既有部署。網址維持原樣。
參考 [Google 網頁應用程式說明](https://developers.google.com/apps-script/guides/web)。

## 4. 驗證

先開 `/exec?action=ping`，應回傳 `ok: true`。
`/exec?action=manifest` 會回傳 `use_post`，這是正常的：密碼改由 POST 本文送出，
不再放在 URL。再用無痕視窗開網站：

- 未輸入密碼、輸入錯誤密碼時，沒有錄音 URL，播放器不能播放。
- 正確密碼解鎖後，應能播放、暫停、跳到中段並按「抓時間碼」。
- 「雲端硬碟」支援時間碼；「雲端播放器」是 iframe 後備，需要手填時間碼。
- 密碼會存在該瀏覽器的 localStorage；共用電腦課後請清除網站資料。
- 改密碼後重新載入頁面，舊密碼應失效。已開啟分頁與已知連結不會被自動收回。

HTTP `206` 與 Range 支援不能單獨證明瀏覽器解碼、播放或 seek 成功。
`preload="metadata"` 是瀏覽器提示，不保證只下載檔頭；請用教室的瀏覽器與網路實測。
參考 [MDN preload 說明](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preload)。

## 5. 保護範圍

密碼只控制 **Apps Script 是否交出檔案 ID 清單**。Drive 檔案本身仍然是連結分享。
知道檔案或資料夾連結的人可能直接繞過工作台；學生也能轉傳密碼、連結或下載副本。
因此不要在公開程式、文件或靜態對照表留下真實的資料夾／檔案 ID，
也不能保證陌生人或搜尋引擎永遠無法取得錄音。

換密碼不改 Drive 權限，也不收回已載入的清單。需要收回一般連結分享時，執行
`unshareAudioFiles`，再檢查具名、群組及繼承權限。已下載的副本無法收回。
`DOMAIN_WITH_LINK` 是網域限制，不代表只有修課學生，也可能影響直接播放。

**學生資料 API 目前沒有登入或組別權限驗證。** `rows`、`class`、新增／刪除／組別設定
不受音檔密碼保護；知道後端網址與班級代號的人可以讀寫資料。
`live.html` 的網址不是權限控制，學生頁面只顯示彙總也不代表 API 只提供彙總。
若要收集需保密的姓名或觀察紀錄，應先補上帳號及角色權限；現階段請使用不具識別性的資料。

## 同時開好幾個班級

資料本來就依 `classId` 分開存，同一份試算表、同一個 Apps Script 就能服務多個班級，
彼此看不到對方的資料。要開第二班，改兩個地方，**兩邊的清單必須一模一樣**：

**1. `v2/config.js`**

```js
classes: ["2026-fall-A", "2026-fall-B"],
classId: "2026-fall-A",          // 網址沒指定時的預設
```

**2. `backend/Code.gs`**

```js
var ALLOWED_CLASSES = ['2026-fall-A', '2026-fall-B'];
```

改完 `Code.gs` 要 **部署 → 管理部署作業 → 編輯 → 新版本 → 部署**，網址不變。

### 發給學生的連結

| 班級 | 學生用的網址 |
|---|---|
| A 班 | `https://<帳號>.github.io/<repo>/v2/?class=2026-fall-A` |
| B 班 | `https://<帳號>.github.io/<repo>/v2/?class=2026-fall-B` |

頁面右上角會顯示目前的班級代號，學生一眼就能確認自己開對了連結。

**網址打錯或少帶 `?class=` 會怎樣？** 不在清單裡的代號不會被接受——
網頁會退回預設班級並跳出提示。這是刻意的：如果放任任意代號通過，
學生的資料會存進一個你永遠不會去看的地方，而且當下完全沒有徵兆。

### 教師看板

`live.html` 右上角有班級下拉選單，切換會重新載入該班資料。
也可以直接開 `live.html?class=2026-fall-B`。

### 匯出

| 想做什麼 | 在 Apps Script 執行 |
|---|---|
| 匯出預設班 | `exportClassMarkdown` |
| 匯出指定班 | `exportClassMarkdown("2026-fall-B")` |
| 每班各匯出一份 | `exportAllClasses` |

### 其他注意事項

- **音檔密碼是全站共用的**，不分班級——它存在 Apps Script 的指令碼屬性裡，只有一個。
  要不同班用不同密碼，目前做不到，得改 `Code.gs` 讓密碼也依班級存。
- 學生的密碼記憶是**依班級**存的，所以同一台電腦切到另一班會再問一次密碼。學生通常只用一班，不受影響。
- 試算表的 `rows` 與 `meta` 分頁都有 `classId` 欄，要手動篩選或做樞紐分析都很直接。
- 舊班級的代號留在清單裡不會有副作用，資料也不會混到；學期結束後可以直接留著。


## 本機備課（不需要雲端）

清空 `backendUrl`，把 `audioOrder` 改成 `["local"]`，再從專案根目錄執行
`python3 -m http.server 8000`，開 `http://localhost:8000/v2/`。
本機音檔以說話人代號命名，例如 `../audio/A-a.m4a`。

> **本機預覽時「抓時間碼」會不準，這不是程式壞掉。**
> `python3 -m http.server` 不支援 Range 請求（實測回 `HTTP/1.0 200`，沒有 `accept-ranges`），
> 瀏覽器因此無法正常跳轉播放位置。GitHub Pages 與 Drive 都支援 Range，發布後就正常。
> 本機要測時間碼，改用支援 Range 的伺服器，例如：
>
> ```bash
> npx --yes http-server -p 8000 --cors
> ```
>
> 播放與解碼本身在 `python3 -m http.server` 下沒問題（已實測 m4a 讀出正確長度）。

若明確要測試無密碼的靜態 Drive 對照表，執行 `printAudioManifest`，
把 JSON 存成 `v2/audio-manifest.json`，並設定同名 `audioManifest`。
這個檔案只能留在本機，發布工具不會複製它。
