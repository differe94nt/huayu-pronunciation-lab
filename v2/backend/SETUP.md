# Google 後端設定

第一次部署需要在你自己的 Google 帳號完成以下操作。密碼與資料夾 ID
只放在 Google 的「指令碼屬性」，不要貼到 GitHub。
發布步驟見 [PUBLISH.md](../PUBLISH.md)。

## 1. 建立試算表與程式

1. 建立私人 Google 試算表，選 **擴充功能 → Apps Script**。
2. 用本資料夾的 `Code.gs` 全文取代預設程式，存檔。
3. 確認 `ALLOWED_CLASSES` 與 `config.js` 的 `classId` 相同。
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

## 本機備課（不需要雲端）

清空 `backendUrl`，把 `audioOrder` 改成 `["local"]`，再從專案根目錄執行
`python3 -m http.server 8000`，開 `http://localhost:8000/v2/`。
本機音檔以說話人代號命名，例如 `../audio/A-a.m4a`。

若明確要測試無密碼的靜態 Drive 對照表，執行 `printAudioManifest`，
把 JSON 存成 `v2/audio-manifest.json`，並設定同名 `audioManifest`。
這個檔案只能留在本機，發布工具不會複製它。
