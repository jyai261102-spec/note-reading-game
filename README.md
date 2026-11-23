# 🎵 睇譜小遊戲 · Note Reading Game

一個俾小朋友學睇五線譜嘅網頁小遊戲。純前端（HTML / CSS / JavaScript），無需後端。

## 玩法
- **三個模式**：高音譜號（G Clef）、低音譜號（F Clef）、混合（G + F 一齊）
- **題數**：可以揀 10 / 20 / 30 題
- **每次隨機出題**：隨機揀音符，唔會連續重複
- **撳一下「聽個音」**：用 Web Audio 合成一個鋼琴音，聽返正確音高
- **答啱**：即刻顯示綠色 + 自動去下一題
- **答錯**：話你知錯咗、顯示正確答案（連 letter + solfège），撳「下一題」繼續
- **分數累積**：會記住累積答啱幾多題（存喺瀏覽器 localStorage）

## 學習範圍
- 高音譜號：E4 – A5（五線 + 上下加線）
- 低音譜號：G2 – C4
- 答案顯示音名（C D E F G A B）同唱名（Do Re Mi Fa Sol La Ti）

## 技術
- 零依賴、零建置。直接開 `index.html` 就用得。
- 譜號圖用 [Noto Music](https://fonts.google.com/noto/specimen/Noto+Music)（OFL 授權）字型 render 成 PNG。
- 音符位置用 `p`（由頂線數落嚟嘅 step）計，`y = 40 + p*14`，五線喺 p = 2/4/6/8/10。

## 本機執行
```bash
# 任何靜態 server 都得，例如：
python3 -m http.server 8000
# 然後開 http://localhost:8000
```

## 部署
部署喺 Vercel（靜態網站）。
