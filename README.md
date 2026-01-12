# 線上遊戲大廳 (Game Lobby)

一個使用 React + Firebase 打造的多人線上遊戲大廳平台。

---

## 📋 專案概述

這是一個 **單頁應用程式 (SPA)**，提供多款派對遊戲，目前已上線兩款遊戲：「比手畫腳大亂鬥」與「Emoji 猜成語」。

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
│   ├── EmojiGame.js         # Emoji 猜成語遊戲主元件 [NEW]
│   ├── firebase.js          # Firebase 配置與初始化
│   ├── index.js             # React 應用程式入口
│   ├── index.css            # 全域樣式 (Tailwind 引入)
│   ├── words.js             # 比手畫腳題庫 (2000+ 題目)
│   ├── emojiData.js         # Emoji 猜成語題庫 (80+ 題目) [NEW]
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

### 4. 開發中遊戲

- 你畫我猜 (Coming Soon)

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
| `emoji_cloud_decks` | **Emoji 雲端共享題庫** |

---

## 📝 版本資訊

**目前版本**: v7.5 Admin 權限修復 & 題庫編輯

### 更新歷史

#### v7.5 (2026-01-13)
- ✅ **Admin 權限修復**：修正 isAdmin prop 從 App.js 一路傳遞到 RoomView
- ✅ **題庫編輯功能**：EmojiGame 新增完整編輯 Modal，支援新增/刪除題目
- ✅ **權限設定**：SettingsModal 新增「允許參賽者新增題目」開關
- ✅ **CharadesGame 同步**：確保 isAdmin prop 正確傳遞

#### v7.4 (2026-01-12)
- ✅ 題庫設定 UI：本地新增、代碼下載、雲端圖書館
- ✅ 暫停遊戲：主持人可暫停/繼續
- ✅ 提示限制：時間過半僅顯示第一個字
- ✅ Git 配置：新增 `.gitignore`

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
