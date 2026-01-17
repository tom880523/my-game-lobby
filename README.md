# 線上遊戲大廳 (Game Lobby)

一個使用 React + Firebase 打造的多人線上遊戲大廳平台。

---

## 📋 專案概述

這是一個 **單頁應用程式 (SPA)**，提供多款派對遊戲，目前已上線三款遊戲：「比手畫腳大亂鬥」、「Emoji 猜成語」與「記憶翻牌」。

### 技術架構

| 技術          | 版本/說明                                         |
|:-------------|:-------------------------------------------------|
| **框架**      | React 18.2.0                                     |
| **後端服務**   | Firebase (Authentication + Firestore)            |
| **UI 圖示**   | Lucide React 0.263.0                             |
| **樣式**      | Tailwind CSS                                     |
| **建置工具**   | Create React App (react-scripts 5.0.1)           |

---

## 📁 專案結構

```
Game Lobby Modify By Antigravity/
├── public/
│   └── index.html           # HTML 入口檔案
├── src/
│   ├── App.js               # 主應用程式 (遊戲大廳 + 路由切換)
│   ├── CharadesGame.js      # 比手畫腳遊戲主元件
│   ├── EmojiGame.js         # Emoji 猜成語遊戲主元件
│   ├── MemoryGame.js        # 記憶翻牌遊戲主元件
│   ├── firebase.js          # Firebase 配置與初始化
│   ├── FirebaseMonitor.js   # Firebase 效能監控工具 [NEW]
│   ├── dbOperations.js      # 統一 Firebase 函式匯出 [NEW]
│   ├── index.js             # React 應用程式入口
│   ├── index.css            # 全域樣式 (Tailwind 引入)
│   ├── words.js             # 比手畫腳題庫 (2000+ 題目)
│   ├── emojiData.js         # Emoji 猜成語題庫 (80+ 題目)
│   └── 題庫EX/              # CSV 格式題庫擴充檔
│       ├── Food.csv
│       ├── 動物與昆蟲.csv
│       ├── 動畫與電影腳色.csv
│       ├── 成語與俗語.csv
│       └── 日常生活.csv
├── package.json             # 專案依賴配置
└── tailwind.config.js       # Tailwind CSS 配置
```

---

## 📊 效能監控 (Firebase Monitor)

本專案內建 Firebase 讀寫操作監控面板，協助開發者追蹤資料庫使用狀況。

### 功能特色

| 功能 | 說明 |
|:----|:----|
| **即時計數** | 顯示讀取 (Read) 與寫入 (Write) 次數 |
| **操作日誌** | 記錄每次 Firebase 操作的詳細資訊 |
| **歸零按鈕** | 隨時重置計數器 |
| **快捷鍵** | `Ctrl + Shift + M` 切換顯示/隱藏 |

### 使用方式

1. 啟動開發伺服器後，畫面右下角會顯示浮動監控圖示
2. 點擊圖示展開詳細面板
3. 觀察遊戲過程中的讀寫次數變化
4. 若發現異常頻繁寫入，檢查程式碼是否有不當的 `updateDoc` 呼叫

### 計時器優化說明

所有遊戲的計時器已使用 **目標時間戳 (Target Timestamp)** 模式：

- **寫入**: 僅在倒數開始時寫入一次 `endTime`
- **讀取**: 客戶端本地計算 `remaining = endTime - now`
- **效果**: 60 秒倒數從 ~~60 次寫入~~ 降為 **1 次寫入**

---

## 🎮 功能說明

### 1. 遊戲大廳 (Lobby)

- **大廳首頁**：顯示所有可用遊戲卡片
- **使用者認證**：
  - 自動匿名登入 (訪客模式)
  - Google 帳號登入 (啟用管理權限)
- **時間同步**：客戶端與 Firebase 伺服器時間校正

### 2. 比手畫腳大亂鬥 (Charades Game)

主要遊戲功能，支援多人連線對戰：

| 功能           | 說明                                      |
|:--------------|:-----------------------------------------|
| **房間系統**   | 建立/加入房間、房主權限管理                  |
| **隊伍系統**   | 多隊伍支援、拖拉換隊、隊伍命名               |
| **題庫系統**   | 內建 2000+ 題、CSV 匯入、**雲端分享 (上傳僅 Admin)** |
| **遊戲流程**   | 計時器、答對/跳過/搶答、即時計分             |
| **權限控制**   | 房主/管理員權限、踢人、轉讓房主              |

### 3. Emoji 猜詞語 (Emoji Guessing Game)

看 Emoji 猜答案的搶答遊戲：

| 功能           | 說明                                      |
|:--------------|:-----------------------------------------|
| **房間系統**   | 建立/加入房間、房主權限管理                  |
| **隊伍系統**   | 多隊伍支援、主持人可加入隊伍參賽             |
| **題庫系統**   | 內建 80+ 題、**雲端分享 (上傳僅 Admin，下載全球開放)** |
| **自動判定**   | 系統自動判定答案，無需主持人確認            |
| **全域同步**   | 答對/時間到結果同步顯示給所有玩家         |
| **即時搶答**   | 所有玩家同時搶答，第一個答對的隊伍得分        |
| **計時器**     | 預設 40 秒、時間過半提示 (僅顯示第一字)     |
| **暫停功能**   | 主持人可暫停/繼續遊戲，所有玩家同步顯示 PAUSED |
| **主持人控制** | 提前結束按鈕、設定題目/得分/時間         |
| **慶祝動畫**   | 答對時顯示綠色閃爍與 Confetti 動畫          |

### 4. 記憶翻牌 (Memory Match Game) [NEW]

翻牌配對的經典記憶遊戲：

| 功能           | 說明                                      |
|:--------------|:-----------------------------------------|
| **房間系統**   | 建立/加入房間、房主權限管理                  |
| **隊伍模式**   | 多隊伍支援、**個人賽模式 (一人一隊)**         |
| **題庫系統**   | 內建 48 Emoji、**雲端分享 (上傳僅 Admin)**   |
| **網格大小**   | 4x4 (8對) / 6x6 (18對)                    |
| **Bonus Turn** | 配對成功可繼續翻牌                          |
| **即時同步**   | 所有玩家即時看到翻牌結果                    |

### 5. 靈魂畫手 (Soul Painter) [NEW]

畫圖猜題的經典遊戲，採用「兩段式快照」機制優化 Firebase 寫入成本：

| 功能           | 說明                                      |
|:--------------|:-----------------------------------------|
| **房間系統**   | 建立/加入房間、房主權限管理                  |
| **隱伍機制**   | Phase 1 (10秒) 僅隊友可見、Phase 2 全員可見   |
| **Canvas 畫布** | 畫筆顏色、橡皮擦、一鍵清除                    |
| **得分設定**   | Phase 1 答對 3 分 / Phase 2 答對 1 分       |
| **題庫系統**   | 共用 Charades 題庫、支援自訂                 |

---

## 🔧 環境需求

- **Node.js**: v16+ (建議 v18+)
- **npm**: v8+
- **瀏覽器**: Chrome / Edge / Firefox / Safari (最新版本)

---

## 🚀 本地開發指南

### 安裝依賴

```bash
npm install
```

### 啟動開發伺服器

```bash
npm start
```

啟動後會自動開啟瀏覽器，預設位址為 `http://localhost:3000`

### 建置生產版本

```bash
npm run build
```

生成的檔案會放在 `build/` 資料夾中。

---

## 🔥 Firebase 配置

專案使用以下 Firebase 專案：

- **Project ID**: `game-lobby-c3225`
- **Auth Domain**: `game-lobby-c3225.firebaseapp.com`

### Firestore 資料結構

| 集合 (Collection)    | 說明                  |
|:--------------------|:---------------------|
| `charades_rooms`    | 比手畫腳遊戲房間資料      |
| `emoji_rooms`       | Emoji 遊戲房間資料 (含 roundResult, customCategories) |
| `admins`            | 管理員 UID 清單         |
| `time_sync`         | 時間同步用暫存文件       |
| `cloud_decks`       | 比手畫腳雲端共享題庫      |
| `emoji_cloud_decks` | Emoji 雲端共享題庫         |
| `memory_rooms`      | 記憶翻牌遊戲房間資料      |
| `memory_cloud_decks`| 記憶翻牌雲端共享題庫      |
| `sketch_rooms`      | 靈魂畫手遊戲房間資料 [NEW] |

---

## 📝 版本資訊

**目前版本**: v10.0 Soul Painter (靈魂畫手)

### 更新歷史

#### v10.0 (2026-01-17) - Soul Painter (靈魂畫手)
- ✅ **全新遊戲**：靈魂畫手 - 畫圖猜題
- ✅ **兩段式快照機制**：
  - Phase 1: 10 秒內僅隊友可見
  - Phase 2: 10 秒後全員可觋搶答
- ✅ **Canvas 畫布**：畫筆顏色 (5 色)、橡皮擦、清除
- ✅ **得分機制**：Phase 1 答對 +3 分 / Phase 2 +1 分
- ✅ **Firebase 成本優化**：絕不即時同步筆劃，僅傳送快照
- ✅ **共用題庫**：直接使用 Charades 的 1000+ 題庫

#### v9.3 (2026-01-17) - MemoryGame 題庫開關功能
- ✅ **移除 PerformanceOverlay**：`App.js` 不再顯示右下角效能監控面板
- ✅ **MemoryGame 題庫開關**：
  - 新增 `toggleDeck` 函式，僅主持人可操作
  - 題庫列表新增 ✅ 勾選切換按鈕 (綠/灰色)
  - 停用的題庫顯示刪除線樣式
  - 新增 `Check` lucide-react icon

#### v9.2 (2026-01-17) - ESLint 修正 for Vercel Deploy
- ✅ **CharadesGame.js 清理**：
  - 移除未使用的 `Zap` import
  - 移除未使用的 `canSwitchTeam` 變數
  - `getCurrentTime` 改用 `useCallback` 包裝，修正 exhaustive-deps 警告
  - 新增 `draggedPlayer` eslint-disable 註解 (用於拖拉操作 closure)
- ✅ **EmojiGame.js 修正**：
  - `getCurrentTime` 改用 `useCallback` 包裝
  - `handleTimeout` 改用 `useCallback` 包裝，明確列出依賴
  - 新增 eslint-disable 註解避免計時器無窮迴圈
  - 新增 `draggedPlayer` eslint-disable 註解
- ✅ **MemoryGame.js 清理**：
  - 移除未使用的 `Users`, `Check`, `Sparkles`, `PartyPopper` lucide-react imports

#### v9.1 (2026-01-17) - Firestore 成本優化
- ✅ **EmojiGame 寫入合併**：每題從 2 次寫入降為 1 次（節省 50%）
  - `handleTimeout` 和 `submitAnswer` 合併寫入 `roundResult` + 下一題資料
  - 移除清除 `roundResult` 的 setTimeout 寫入
  - 使用 `timestamp` 追蹤已處理的結果，本地 setTimeout 控制動畫顯示
- ✅ **MemoryGame 配對優化**：配對成功從 3 次寫入降為 2 次（節省 33%）
  - 翻第二張牌時直接判斷配對，合併翻牌 + 結算寫入
  - 加強 `isProcessing` 鎖定，防止快速點擊重複寫入
- ✅ **Debug Log 增強**：新增詳細的合併寫入日誌

#### v9.0 (2026-01-15)
- ✅ **Firebase 效能監控面板**：即時追蹤讀/寫次數
- ✅ 浮動 UI 面板（右下角），含歸零與操作日誌
- ✅ 快捷鍵 `Ctrl+Shift+M` 切換顯示
- ✅ 確認所有遊戲已使用時間戳模式（無每秒寫入）

#### v8.3 (2026-01-14)
- ✅ **題庫編輯器 Modal**：可視化編輯題目配對
- ✅ 新增/刪除單一題目
- ✅ CSV 批量匯入 (支援逗號或 | 分隔)
- ✅ Admin 雲端上傳功能
- ✅ SettingsModal 新增「允許參賽者編輯題庫」權限開關
- ✅ 題庫列表新增 Edit 按鈕

#### v8.2 (2026-01-13)
- ✅ **嚴格輪替**：隊伍 + 個人雙重檢查
- ✅ 顯示當前操作者名稱
- ✅ 配對成功牌消失 (Clean UI)
- ✅ Admin「新增並上傳至雲端」按鈕

#### v8.1 (2026-01-13)
- ✅ **Bug 修復**：修正提示詞狀態殘留問題
- ✅ 自訂 Rows × Cols 網格 (含偶數與題庫驗證)
- ✅ CSV 匯入本地題庫 (A|B 或 A 格式)
- ✅ 新增遊戲資訊與玩法說明面板
- ✅ 快速選擇常用網格尺寸

- ✅ 雲端題庫支援 (上傳限 Admin)
- ✅ 大廳新增記憶翻牌遊戲入口


#### v7.8 (2026-01-13)
- ✅ **資訊面板修復**：正確綁定 `totalRounds`, `roundDuration`, `pointsSkip` 變數
- ✅ **SettingsModal 補完**：新增「答對得分」和「跳過扣分」輸入欄位
- ✅ **遊戲玩法補完**：加入搶答規則說明 (stealTime 秒數)

#### v7.7 (2026-01-13)
- ✅ EmojiGame 結算修復：平手發光效果
- ✅ CharadesGame 資訊面板

#### v7.3 (2026-01-12)
- ✅ 全域更名為「Emoji 猜詞語」
- ✅ 雲端題庫上傳/刪除僅限 Admin
- ✅ 計時器使用目標時間戳機制

#### v7.2 (2026-01-12)
- ✅ Emoji 全域同步：答對/時間到結果同步顯示
- ✅ 提前結束遊戲按鈕
- ✅ 獨立的 `emoji_cloud_decks` 集合

#### v7.1
- ✅ 修復計時器與 Props 傳遞問題

---

## 📂 GitHub 上傳指南

### 初次上傳步驟

在專案根目錄下執行以下指令：

```bash
# 1. 初始化 Git 倉庫
git init

# 2. 加入所有檔案 (會自動套用 .gitignore)
git add .

# 3. 建立第一次 Commit
git commit -m "Initial commit: Game Lobby v7.4"

# 4. 重命名主分支為 main
git branch -M main

# 5. 連結遠端 GitHub 倉庫 (請替換為你的 URL)
git remote add origin https://github.com/你的帳號/你的倉庫名.git

# 6. 推送到 GitHub
git push -u origin main
```

### 後續更新步驟

```bash
git add .
git commit -m "更新內容描述"
git push
```

---

## 🧪 本地測試

```bash
npm start
```

---

## ⚠️ 注意事項

1. **Firebase 配置**：目前使用的是正式環境的 Firebase，本地測試時請確保網路連線。
2. **匿名登入**：首次進入會自動匿名登入，若要使用管理員功能需登入 Google 帳號。
3. **Debug Log**：程式碼中已加入 `console.log` 偵錯訊息。

---

## 📄 授權

MIT License
