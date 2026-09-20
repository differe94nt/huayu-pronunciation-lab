# v2 發布清單

**請從乾淨的 `github-v2` 發布副本推送，不要推送原專案。**
原專案的 Git 歷史含有錄音；`.gitignore` 不會刪除歷史。
發布副本不含錄音、私人 `audio-manifest.json` 或原本的 `.git`。

## 1. Google 設定（第一次約 10 分鐘）

照 [backend/SETUP.md](backend/SETUP.md) 完成：

1. 私人試算表 → 擴充功能 → Apps Script，貼上 `backend/Code.gs`。
2. 在專案設定的指令碼屬性填 `AUDIO_FOLDER_ID` 與 `AUDIO_PASSWORD`。
3. 執行 `setAudioPassword` 檢查設定，執行 `lockDownAudioFiles` 並檢查 Drive 分享權限。
4. 部署成網頁應用程式：執行身分「我」、存取「所有人」。
5. 把 `/exec` URL 填進 **發布副本的 `v2/config.js`** 的 `backendUrl`。

GitHub 無法代替你建立或授權 Google 後端。尚未完成此步時，網站可先發布，
但錄音會顯示尚未設定，學生資料只存在各自瀏覽器。
音檔密碼不保護學生資料 API，使用前請閱讀 SETUP.md 第 5 節。

## 2. 推送發布副本

本次準備好的 `github-v2/` 是獨立 Git repository，已有乾淨的初始 commit。
先在 GitHub 建立一個空 repo（不要初始化 README 或其他檔案），然後：

```bash
cd github-v2
# Google 設定完成後，將剛才的 URL 修改存入 commit：
git add v2/config.js
git diff --cached
git commit -m "Configure Google backend"
# 如果沒有修改，略過上面的 commit。
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPO.git
git push -u origin main
```

在 GitHub **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
若首次 push 時尚未啟用 Pages，到 **Actions → Publish v2 → Run workflow** 重跑一次。
之後 push `main` 就會自動測試並更新網站。
參考 [GitHub 官方 Pages workflow 文件](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

| 頁面 | 網址 |
|---|---|
| 聽問查教 | `https://YOUR_ACCOUNT.github.io/YOUR_REPO/v2/` |
| 華語糾音 | `https://YOUR_ACCOUNT.github.io/YOUR_REPO/v2/workbench.html` |
| 即時看板 | `https://YOUR_ACCOUNT.github.io/YOUR_REPO/v2/live.html` |

根網址也會轉向 `v2/`。看板是公開頁面，沒有教師登入驗證。

## 3. 發布後檢查

- 無痕視窗：未輸入密碼及錯誤密碼都不能載入錄音。
- 正確密碼：測試播放、暫停、跳到中段，再按「抓時間碼」。
- 切換組別，確認三個錄音對應正確；建議用教室網路實測。
- 若使用同步，以不具識別性的測試資料確認儲存與看板。

本機測試已驗證程式行為，不代表 Google 部署、Drive 權限與實際串流已驗證。

## 日後更新

直接在 `github-v2` repo 修改、測試、commit、push 即可。
這是一份獨立副本，原專案的修改不會自動同步進來。
測試指令（在發布 repo 根目錄）：

```bash
node --test v2/tests/*.test.cjs
python3 -m unittest discover -s v2/tests -p '*_test.py'
python3 -m http.server 8000
# 瀏覽 http://localhost:8000/v2/_selftest.html
```

若要從原專案重新匯出到全新路徑，執行
`python3 v2/scripts/prepare_publish.py --output /你的新路徑`。
匯出工具只建立檔案，不會覆蓋既有路徑，也不會自動建立 Git history。
手動匯出後可執行 `git init -b main`、`git add .`、`git commit -m "Publish v2"`。
