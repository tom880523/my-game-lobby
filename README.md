# 線上遊戲大廳 (Game Lobby)

一個使用 React + Firebase 打造的多人線上遊戲大廳平台。

---

## 📋 專案概述

這是一個 **單頁應用程式 (SPA)**，提供多款派對遊戲，目前已上線六款遊戲：「天生戲精」、「表情密碼」、「極限記憶」、「靈魂畫手」、「諜影行動」與「心靈共鳴」。

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
│   ├── SketchGame.js        # 靈魂畫手遊戲主元件
│   ├── SpyGame.js           # 諜影行動遊戲主元件
│   ├── ShareGame.js         # 心靈共鳴遊戲主元件 [NEW]
│   ├── firebase.js          # Firebase 配置與初始化
│   ├── FirebaseMonitor.js   # Firebase 效能監控工具 [NEW]
│   ├── dbOperations.js      # 統一 Firebase 函式匯出 [NEW]
│   ├── index.js             # React 應用程式入口
│   ├── index.css            # 全域樣式 (Tailwind 引入)
│   ├── words.js             # 比手畫腳題庫 (2000+ 題目)
│   ├── emojiData.js         # Emoji 猜成語題庫 (80+ 題目)
│   ├── spyData.js           # 諜影行動詞對題庫
│   ├── shareData.js         # 心靈共鳴問題題庫 (50題) [NEW]
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
| **題庫系統**   | 內建 56 Emoji、**雲端分享 (上傳僅 Admin)**   |
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

### 6. 心靈共鳴 (Soul Resonance) [NEW]

輪流分享的深度交流遊戲，拉近玩家距離：

| 功能           | 說明                                      |
|:--------------|:-----------------------------------------|
| **房間系統**   | 建立/加入房間、房主權限管理                  |
| **分享機制**   | 隨機決定順序，輪流成為分享者                 |
| **題庫系統**   | 內建 50 題破冰與深度交流、雲端題庫 (上傳僅 Admin) |
| **分享者視圖** | 顯示題目卡片、換題、下一位按鈕               |
| **傾聽者視圖** | 顯示目前題目、呼吸燈動畫營造專注感           |
| **UI 風格**   | 琥珀色/暖橘色主調，溫暖治癒氛圍              |

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
| `sketch_rooms`      | 靈魂畫手遊戲房間資料      |
| `spy_rooms`         | 諜影行動遊戲房間資料      |
| `spy_cloud_decks`   | 諜影行動雲端題庫          |
| `share_rooms`       | 心靈共鳴遊戲房間資料 [NEW] |
| `share_cloud_decks` | 心靈共鳴雲端題庫 [NEW]     |

---

## 📝 版本資訊

**目前版本**: v12.9.3 靈魂畫手換題 Bug 修復

### 更新歷史

#### v12.9.3 (2026-01-23) - 靈魂畫手換題 Bug 修復
- ✅ **換題限制失效修復**：
  - 原問題：換題後因為 `currentWord` 改變觸發 useEffect，導致 `hasSwapped` 錯誤重置，可無限換題
  - 修正：將 `hasSwapped` 重置的依賴條件從 `currentWord` 改為 `currentDrawerId`
  - 結果：只有在「換下一位畫家/下一回合」時才會重置換題權限，本回合內換過一次即鎖定

#### v12.9.2 (2026-01-23) - 靈魂畫手 (SketchGame) 手機版優化
- ✅ **手機版全螢幕畫布**：
  - 隱藏頂部隊伍積分區塊（手機版）
  - 強制畫布高度為 `70vh`（約螢幕 70%），並設定 `w-full`
  - 新增手機版精簡計時器與題目顯示
- ✅ **換題功能優化**：
  - 每回合限制換題一次（透過 `hasSwapped` state）
  - 當題目改變時自動重置換題狀態
  - 換題按鈕在已換過時會變為 Disabled
- ✅ **效能優化**：
  - 新回合開始時確實清除 `canvasImage` 資料，減輕 Firestore 負擔

#### v12.9.1 (2026-01-23) - 移除未使用的 isSpectator 變數
- ✅ **ESLint 修復 (no-unused-vars)**：
  - 移除 5 個遊戲中的 `isSpectator` state 宣告
  - 移除相關的 `setIsSpectator` 呼叫
  - 移除 useEffect 依賴陣列中的 `isSpectator`
  - 影響範圍：SketchGame, MemoryGame, CharadesGame, EmojiGame, ShareGame

#### v12.9 (2026-01-23) - 移除觀戰模式，改為阻擋中途加入
- ✅ **中途加入規則調整**：
  - 移除觀戰模式邏輯
  - 新玩家在遊戲進行中（status = 'playing'）嘗試加入時，會收到錯誤訊息「遊戲已經開始，請等待下一局！」
  - 斷線玩家（已在 players 列表）仍可正常重連並繼續遊玩
  - 影響範圍：6 個遊戲（SketchGame, MemoryGame, CharadesGame, EmojiGame, ShareGame, SpyGame）
- ✅ **改善使用者體驗**：
  - 明確告知玩家無法加入的原因
  - 避免玩家進入房間後卡在無法互動的狀態

#### v12.8.3 (2026-01-23) - ESLint 依賴修復 (Vercel 部署)
- ✅ **修復 useEffect 依賴缺失**：
  - 問題：ESLint exhaustive-deps 規則檢測到 useEffect 缺少 `isSpectator` 依賴
  - 修正：5 個遊戲檔案的房間監聽 useEffect 依賴陣列加入 `isSpectator`
  - 影響範圍：CharadesGame, EmojiGame, MemoryGame, ShareGame, SketchGame

#### v12.8.2 (2026-01-23) - 觀戰者保護 + 靈魂畫手 Canvas 擴大
- ✅ **觀戰者保護邏輯強化**：
  - 新增 `isSpectator` state 追蹤觀戰者狀態
  - `onSnapshot` 踢人邏輯加入 `!isSpectator` 檢查，避免誤踢觀戰者
  - `leaveRoom` 重置 `isSpectator` 狀態
  - 影響範圍：5 個遊戲（SketchGame, MemoryGame, CharadesGame, EmojiGame, ShareGame）
- ✅ **靈魂畫手 Canvas 擴大**：
  - Canvas max-height 從 55vh/60vh 提升至 80vh（幾乎全螢幕）
  - 手機與電腦都能獲得更大的繪圖空間

#### v12.8.1 (2026-01-22) - SpyGame 勝負判定修復
- ✅ **Bug 修復 - 白板陣營判定**：
  - 原問題：當臥底被淘汰但白板還活著時，遊戲不會結束（平民不會獲勝）
  - 根本原因：勝負判定邏輯要求 `aliveUndercovers === 0 && aliveWhiteboards === 0` 才算平民獲勝
  - 修正：白板屬於平民陣營，只需 `aliveUndercovers === 0` 即可判定平民獲勝
  - 影響範圍：`eliminatePlayer` 與 `resolvePK` 兩處勝負判定邏輯

#### v12.8 (2026-01-22) - 斷線重連 + 靈魂畫手優化 + 極限記憶修復 + 觀戰模式
- ✅ **全域修復 - 斷線重連機制**：
  - 原問題：玩家在遊戲進行中重整網頁後無法回到遊戲畫面（view 狀態為 'lobby'）
  - 修正邏輯：`onSnapshot` 改為檢查 `amIInRoom` 而非 `view === 'room'`，確保玩家重整後自動切換回遊戲並可繼續遊玩
  - 影響範圍：所有 6 個遊戲（SketchGame, MemoryGame, CharadesGame, EmojiGame, SpyGame, ShareGame）
- ✅ **靈魂畫手專項優化**：
  - **新局初始化 Bug**：`startGame` 強制重置 `roundResult: null`，避免閃現上局結果
  - **預設時間調整**：Phase 1/2/3 從 20s 改為 30s/30s/40s，給予更充裕時間
  - **畫板放大**：canvas 從 600x400 升級至 800x600，使用響應式設計（`aspect-[4/3]`）確保手機與電腦皆有良好畫面
  - **換一題功能**：新增「換一題」按鈕（Phase 1 限用一次），舊題目移至佇列底部避免浪費
  - **Phase 3 答對顯示修復**：Phase 3 結束前檢查 `roundResult` 是否已存在，防止覆蓋搶答成功的結果
- ✅ **極限記憶 10x10 修復**：
  - **背景溢位修復**：容器新增 `pb-8` 底部留白，確保捲動時背景延伸
  - **卡片大小動態調整**：10x10 網格使用 `text-2xl md:text-3xl`（稍微縮小但保持手機可讀），8x8 使用 `text-3xl md:text-4xl`
- ✅ **觀戰模式**：
  - 遊戲進行中加入房間的新玩家不再被加入 `players` 列表，僅能觀看遊戲進行
  - 遊戲開始前加入的玩家正常參與
  - 遊戲中重整的玩家可重連並繼續遊玩
  - 影響範圍：5 個遊戲（SketchGame, MemoryGame, CharadesGame, EmojiGame, ShareGame）

#### v12.7 (2026-01-21) - MemoryGame 題庫數量顯示修正
- ✅ **Bug 修復 - SettingsModal 題庫計算**：
  - 原問題：`availablePairs` 固定計算 `DEFAULT_EMOJI_PAIRS.length`，未檢查 `useDefaultEmojis` 是否啟用
  - 修正後：正確計算只有「啟用中」的題庫數量
  - 自訂題庫也檢查 `enabled !== false` 狀態
- ✅ **題庫擴充**：內建 Emoji 題庫從 48 題擴充至 56 題
- ✅ **Debug Log**：設定頁面新增可用題庫數量日誌

#### v12.6 (2026-01-19) - ShareDeckEditorModal CSV 匯入功能
- ✅ **新增 CSV/TXT 檔案匯入**：`ShareDeckEditorModal` 元件新增讀取檔案功能
  - 引入 `FileText` lucide-react 圖示
  - 新增 `handleCSVUpload` 函式，支援逗號或換行分隔
  - 自動去除重複題目（使用 `Set` 資料結構）
  - 題目編輯區右側新增檔案上傳按鈕
  - 匯入後顯示成功 Alert 提示

#### v12.5 (2026-01-18) - useEffect 依賴穩定性修復
- ✅ **ShareGame.js 依賴穩定性修復**：
  - 原問題：`turnOrder = roomData.turnOrder || []` 每次渲染產生新陣列，導致 `useEffect` 依賴不穩定
  - 解決方案：使用 `useMemo` 包裹 `turnOrder`，確保陣列參照穩定
  - 新增 `useMemo` 到 React imports

#### v12.4 (2026-01-18) - ESLint 修正 for Vercel Deploy
- ✅ **ShareGame.js Linter 修復**：
  - 原問題：`useMemo` 缺少 `remainingPlayers` 依賴導致 Vercel 部署失敗
  - 解決方案：將計算邏輯移入 `useEffect` 內部，避免外部依賴
  - 移除 `eslint-disable-next-line` 註解，改為正確的依賴陣列 `[currentIndex, turnOrder, roomData.players]`

#### v12.3 (2026-01-18) - 隱藏真實順序
- ✅ **防劇透**：「指定下一位」Modal 候選人名單改為隨機排序
  - 使用 `useState` + `useEffect` + `displayCandidates` 實作
  - 依賴 `currentIndex` 與 `turnOrder`，換人時才重新洗牌

#### v12.2 (2026-01-18) - 權限修正 + 預約制指定
- ✅ **權限修正**：「瀏覽雲端題庫」按鈕限主持人可見
- ✅ **UI 微調**：Lobby 輸入框 `bg-black/30` → `bg-amber-900/30` 暖色調
- ✅ **指定功能重構**：改為「本地預約制」
  - 選擇後僅顯示預約提示，不立即寫入 Firestore
  - 按「下一位」時才執行交換 + 原子操作更新
  - `useEffect` 監聽回合變化，自動重置預約

#### v12.1 (2026-01-18) - ShareGame 護眼配色 + 指定下一位
- ✅ **UI 重構**：高飽和度 Amber/Orange → 低飽和度 Stone 暖灰色系
  - Lobby：深暖灰背景 (`stone-800/900`)
  - Room/Game：柔和米色背景 (`#fdfbf7`)
  - 題目卡片：紙質書寫風格
- ✅ **新增功能**：「指定下一位」按鈕
  - 分享者/主持人可從尚未發言的玩家中指定下一位
  - 採用 Swap 邏輯交換 `turnOrder` 順序
  - Modal 介面顯示剩餘玩家列表

#### v12.0 (2026-01-18) - 心靈共鳴 (Share Game)
- ✅ **全新遊戲**：心靈共鳴 - 輪流分享的社交破冰遊戲
- ✅ **遊戲流程**：隨機決定順序 → 分享者回答題目 → 傾聽者專注聆聽 → 下一位
- ✅ **題庫系統**：
  - 內建 50 題 (輕鬆破冰/情感回憶/價值觀/未來展望)
  - 自訂題庫 + 雲端題庫 (`share_cloud_decks`)
- ✅ **UI 風格**：琥珀色/暖橘色主調，營造溫暖治癒氛圍
- ✅ **檔案新增**：`shareData.js`, `ShareGame.js`

#### v11.4 (2026-01-18) - 遊戲名稱統一化 (四字風格)
- ✅ **比手畫腳大亂鬥** → **天生戲精**
- ✅ **Emoji 猜詞語** → **表情密碼**
- ✅ **記憶翻牌** → **極限記憶**
- 修改範圍：`App.js`, `CharadesGame.js`, `EmojiGame.js`, `MemoryGame.js`

#### v11.3 (2026-01-18) - SpyGame 邏輯修正
- ✅ **Bug 修復 - 投票分母計算**：
  - 移除 `alivePlayers.length - 1` 中的 `-1`
  - 結算按鈕現在隨時可見，顯示正確的 X/Y 已投票人數
- ✅ **詞彙隨機分配**：
  - 50% 機率對調 A/B 詞彙 (`swapWords`)
  - 存入 `currentPair: { a: civilianWord, b: undercoverWord }` 確保結算顯示正確

#### v11.2 (2026-01-18) - SpyGame v2.1 體驗優化
- ✅ **UI 調整**：遊戲規則從「大廳」移至「房間內」右側欄
- ✅ **Bug 修復**：發言者高亮 (Ring) 只在「敘述階段」顯示，避免投票混淆
- ✅ **日誌保留**：整場遊戲的敘述日誌不再清空，每輪新增系統分隔線
- ✅ **規則變更 - PK 驟死機制**：
  - 若 PK 階段再次平手 → **所有平手玩家同時淘汰**
  - 新增 `eliminateMultiplePlayers` 函式處理批量淘汰
  - 淘汰後立即檢查勝負條件

#### v11.1 (2026-01-18) - SpyGame 穩定性修復
- ✅ **Bug 修復 - 斷線重連機制**：
  - 原問題：遊戲中玩家若重新整理頁面會無法返回房間
  - 修正：`joinRoom` 函式新增判斷邏輯，舊玩家 (已在 `players` 列表中) 允許重連
- ✅ **Bug 修復 - 投票狀態卡死**：
  - 原問題：第二輪投票或 PK 時，本地狀態未重置導致無法投票
  - 修正：新增 `useEffect` 監聽 `status`, `currentRound`, `pkPlayers` 變化，自動重置 `voteSubmitted` 與 `selectedCandidateId`

#### v11.0 (2026-01-17) - 諜影行動 (Spy Game)
- ✅ **全新遊戲**：諜影行動 - 誰是臥底推理遊戲
- ✅ **三種身分**：
  - 🙂 平民：拿到 WordA，需找出臥底
  - 😎 臥底：拿到 WordB，需隱藏身分
  - 👻 白板：拿到 ???，需靠猜測混入
- ✅ **遊戲流程**：敘述 → 投票 → (PK) → 出局 → 判定
- ✅ **勝負判定**：
  - 臥底人數 ≥ 平民+白板 → 臥底勝
  - 所有臥底與白板出局 → 平民勝
- ✅ **30 組內建詞對** + 雲端題庫 (spy_cloud_decks)
- ✅ **身分卡片**：點擊翻牌查看詞彙

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
