# 公開華語學習者語音語料庫

<!-- 每個語料庫一個 `##` 區塊，用 `- 鍵：值` 的清單寫欄位。查閱日期：2026 年 9 月。 -->

## LATIC

- 網址：https://ieee-dataport.org/open-access/latic-non-native-pre-labelled-mandarin-chinese-validation-corpus-automatic-speech
- 內容：**只有 4 位**華語學習者，母語為俄語、韓語、法語、阿拉伯語；約 4 小時、2,579 個音檔
- 標註：附三個層級的轉寫標註
- 取得：IEEE DataPort 開放取用，需免費帳號（DOI 10.21227/mqtj-qh10）
- 適用：最貼合本作業：一次取得四種母語背景，可直接做跨母語對比
- 但書：**每個母語各只有一位說話人**。任何「某某母語的學習者會……」的推論都不能只靠這份語料
- 推薦：是

## iCALL Corpus

- 網址：https://www.isca-archive.org/interspeech_2015/chen15f_interspeech.html
- 內容：305 位歐洲語言背景學習者、90,841 句、142 小時的華語朗讀語料
- 標註：含音段與聲調層級標註
- 取得：依 Interspeech 2015 論文所載方式向研究團隊申請
- 適用：規模大、標註細，是目前唯一能當統計基準線的一份
- 但書：分析結果見 Chen et al. (2016), *Speech Communication* 84, 46–56；本工作台的外部基準線就是取自這一篇

## OMPAL

- 網址：https://www.isca-archive.org/interspeech_2025/hsieh25b_interspeech.html
- 內容：46 位法語母語學習者、1,768 句華語語料
- 標註：四位具華語教學經驗的專家在詞與句層級逐一評分，另釋出基線評分模型
- 取得：論文載明開放供商業與非商業使用
- 適用：專家評分可作為「人的判斷」基準，用來檢驗 AI 評分的落差

## SAIT-EMA

- 網址：https://www.nature.com/articles/s41597-026-07237-9
- 內容：18 位受試者（其中**只有 6 位是 L2 學習者**，母語為越南語、西班牙語、俄語），12 位華語母語者為對照組
- 標註：舌位、唇形等發音器官動作軌跡（Carstens AG501，九個感測器）
- 取得：Scientific Data (2026) 隨文公開
- 適用：進階選項：想從「發音部位」而非「聽感」切入時使用

## Mozilla Common Voice（zh-TW／zh-CN）

- 網址：https://commonvoice.mozilla.org/zh-TW/datasets
- 內容：群眾朗讀語料，含自述口音欄位，可篩出帶外語口音者
- 標註：僅有文本對齊，無音段標註
- 取得：CC0 公眾領域
- 適用：補充來源：目標母語在上列語料庫中缺席時可用

## 臺灣華語文語料庫 COCT

- 網址：https://coct.naer.edu.tw/
- 內容：國家教育研究院建置，含學習者語料庫與詞彙分級
- 標註：以書面語為主
- 取得：線上檢索，免費
- 適用：用於挑選符合學習者等級的練習詞彙，以及書面偏誤的對照

## speechocean762 / L2-ARCTIC

- 網址：https://www.openslr.org/101/
- 內容：非華語：英語 L2 學習者語音（母語含華語）
- 標註：音段層級的發音評分標註，體例完整
- 取得：OpenSLR 開放下載
- 適用：不作為分析對象，作為標註規範與評分尺度的方法論範本
