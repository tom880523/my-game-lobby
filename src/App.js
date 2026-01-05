import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, 
  arrayUnion, increment, arrayRemove, runTransaction, 
  serverTimestamp, addDoc, collection, deleteDoc 
} from 'firebase/firestore';
import { 
  Users, Play, Settings, Plus, Check, X, 
  Shuffle, AlertCircle, ClipboardCopy, Trophy, 
  Gamepad2, ArrowLeft, Construction, LogOut, Trash2, Crown,
  Eye, EyeOff, Pause, RotateCcw, Timer, FastForward, UserCheck
} from 'lucide-react';

// =================================================================
// ★★★ 你的 Firebase Config (已自動填入) ★★★
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA5vgv34lsCJGOgmKhVZzZUp9L0Ut-JdUY",
  authDomain: "game-lobby-c3225.firebaseapp.com",
  projectId: "game-lobby-c3225",
  storageBucket: "game-lobby-c3225.firebasestorage.app",
  messagingSenderId: "900294983374",
  appId: "1:900294983374:web:696061e1ab31ca49bb5a9f"
};

// --- Firebase 初始化 ---
let app, auth, db;
let initError = "";

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Init Error:", e);
  initError = e.message;
}

// --- 預設超大題庫 ---
const DEFAULT_WORDS_LARGE = [
  "珍珠奶茶", "臭豆腐", "牛肉麵", "小籠包", "滷肉飯", "雞排", "鳳梨酥", "火鍋", "生魚片", "披薩", "漢堡", "薯條", "冰淇淋", "巧克力", "西瓜", "香蕉", "榴槤", "苦瓜", "荷包蛋", "爆米花", "芒果冰", "蚵仔煎", "豬血糕", "大腸包小腸", "潤餅", "肉圓", "太陽餅", "鐵蛋", "豆花", "燒仙草", "可樂", "咖啡", "壽司", "義大利麵", "牛排",
  "台北101", "夜市", "迪士尼樂園", "便利商店", "動物園", "機場", "醫院", "學校", "圖書館", "電影院", "健身房", "游泳池", "外太空", "金字塔", "萬里長城", "艾菲爾鐵塔", "自由女神", "北極", "鬼屋", "監獄", "麥當勞", "肯德基", "星巴克", "捷運站", "加油站", "月球", "火星", "沙漠", "玉山", "日月潭",
  "刷牙", "洗澡", "化妝", "自拍", "打噴嚏", "剪指甲", "伏地挺身", "騎腳踏車", "開車", "釣魚", "打棒球", "打籃球", "踢足球", "游泳", "溜滑梯", "盪鞦韆", "放風箏", "求婚", "吵架", "偷看", "打蚊子", "穿針引線", "舉重", "拔河", "相撲", "衝浪", "滑雪", "彈吉他", "打鼓", "指揮交通", "煮飯", "洗碗", "遛狗", "睡覺", "打呼",
  "大象", "長頸鹿", "企鵝", "猴子", "猩猩", "袋鼠", "無尾熊", "熊貓", "獅子", "老虎", "豬", "狗", "貓", "雞", "鴨子", "青蛙", "烏龜", "蛇", "蜘蛛", "暴龍", "鱷魚", "河馬", "犀牛", "斑馬", "駱駝", "草泥馬", "狐狸", "兔子", "老鼠", "松鼠", "海豚", "鯨魚", "鯊魚", "章魚", "水母",
  "鋼鐵人", "蜘蛛人", "皮卡丘", "哆啦A夢", "瑪利歐", "殭屍", "吸血鬼", "聖誕老公公", "外星人", "忍者", "醫生", "護士", "警察", "消防員", "老師", "學生", "廚師", "司機", "空姐", "機師", "畫家", "歌手", "演員", "魔術師", "小丑", "總統", "太空人", "科學家", "偵探", "小偷", "海盜", "牛仔", "騎士", "公主", "王子",
  "手機", "電腦", "吹風機", "雨傘", "馬桶", "衛生紙", "遙控器", "麥克風", "眼鏡", "口罩", "手錶", "戒指", "項鍊", "背包", "牙刷", "電風扇", "冷氣", "冰箱", "電視", "洗衣機", "微波爐", "筷子", "湯匙", "安全帽", "鑰匙",
  "畫蛇添足", "對牛彈琴", "一石二鳥", "井底之蛙", "守株待兔", "掩耳盜鈴", "狐假虎威", "盲人摸象", "雞飛狗跳", "七上八下", "三頭六臂", "心碎", "開心", "憤怒", "緊張", "害怕", "尷尬", "無聊", "驚喜"
];

// --- 錯誤邊界 ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-red-600 bg-red-50 min-h-screen flex flex-col items-center justify-center">
          <AlertCircle size={48} className="mb-4" />
          <h1 className="text-2xl font-bold mb-2">發生錯誤</h1>
          <pre className="text-left bg-white p-4 rounded border border-red-200 overflow-auto max-w-lg text-xs">
            {this.state.error.toString()}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
            重新整理
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- 主程式 ---
export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [currentApp, setCurrentApp] = useState('home');
  const [serverTimeOffset, setServerTimeOffset] = useState(0);

  // 初始化時計算時間差 (Time Sync)
  useEffect(() => {
    const syncTime = async () => {
      try {
        // 1. 寫入一個暫時文件，包含 Server Timestamp
        const tempDocRef = await addDoc(collection(db, 'time_sync'), {
          timestamp: serverTimestamp()
        });
        
        // 2. 監聽該文件以獲取 Server 寫入的時間
        const unsubscribe = onSnapshot(tempDocRef, (snap) => {
          if (snap.exists() && snap.data().timestamp) {
            const serverTime = snap.data().timestamp.toMillis();
            const localTime = Date.now();
            const offset = serverTime - localTime;
            console.log("Server Time Offset:", offset, "ms");
            setServerTimeOffset(offset);
            
            // 清理
            unsubscribe();
            deleteDoc(tempDocRef);
          }
        });
      } catch (e) {
        console.error("Time sync failed:", e);
      }
    };
    
    if (db) syncTime();
  }, []);

  // 封裝一個取得「現在校正後時間」的函式
  const getNow = () => Date.now() + serverTimeOffset;

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Firebase 設定錯誤</h2>
          <p className="text-gray-600 mb-4">{initError}</p>
        </div>
      </div>
    );
  }

  if (currentApp === 'home') return <GameLobby onSelectGame={setCurrentApp} />;
  if (currentApp === 'charades') return <CharadesGame onBack={() => setCurrentApp('home')} getNow={getNow} />;
  return null;
}

// --- 1. 大廳 ---
function GameLobby({ onSelectGame }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      
      <header className="w-full max-w-4xl flex justify-between items-center mb-12 z-10">
         <h1 className="text-3xl font-bold flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            <Gamepad2 className="text-indigo-400 w-8 h-8" />
            線上派對遊戲中心
         </h1>
      </header>
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl z-10">
        <button 
          onClick={() => onSelectGame('charades')}
          className="group relative bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700 rounded-2xl p-1 overflow-hidden hover:scale-105 transition-all duration-300 text-left shadow-xl"
        >
          <div className="h-full rounded-xl p-6 flex flex-col justify-between min-h-[200px]">
             <div>
               <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:rotate-12 transition-transform">
                  <Users className="text-white w-8 h-8" />
               </div>
               <h2 className="text-2xl font-bold mb-2 text-white">比手畫腳大亂鬥</h2>
               <p className="text-slate-400 text-sm">經典派對遊戲！內建豐富題庫、支援搶答、自訂題目與即時計分。</p>
             </div>
             <div className="flex items-center gap-2 text-indigo-400 font-bold mt-6 group-hover:translate-x-2 transition-transform">
                進入遊戲 <ArrowLeft className="rotate-180" size={16}/>
             </div>
          </div>
        </button>

        {/* 佔位卡片 */}
        {[
          { icon: <Construction />, title: "間諜家家酒", desc: "誰是臥底？開發中..." },
          { icon: <Construction />, title: "你畫我猜", desc: "靈魂繪師大顯身手..." }
        ].map((item, idx) => (
          <div key={idx} className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 flex flex-col justify-between min-h-[200px] opacity-50 cursor-not-allowed">
             <div>
               <div className="w-14 h-14 bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
                  {React.cloneElement(item.icon, { className: "text-slate-500 w-8 h-8" })}
               </div>
               <h2 className="text-xl font-bold text-slate-500 mb-2">{item.title}</h2>
               <p className="text-slate-600 text-sm">{item.desc}</p>
             </div>
          </div>
        ))}
      </main>
      <footer className="mt-auto pt-12 text-slate-600 text-sm z-10">v2.4 Host & Time Sync</footer>
    </div>
  );
}

// --- 2. 遊戲主邏輯 ---
const DEFAULT_SETTINGS = {
  answerTime: 30, stealTime: 10, roundDuration: 600, totalRounds: 2, 
  pointsCorrect: 3, pointsSkip: -1, startTeam: 'A'
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

function CharadesGame({ onBack, getNow }) {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else signInAnonymously(auth).catch(console.error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !roomId) return;
    const unsubscribe = onSnapshot(doc(db, 'rooms', `room_${roomId}`), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);
        
        const amIInRoom = data.players && data.players.some(p => p.id === user.uid);
        if (!amIInRoom && view !== 'lobby') {
           alert("你已被踢出房間或房間已重置");
           setView('lobby');
           setRoomData(null);
           return;
        }

        if (data.status === 'playing' && view === 'room') setView('game');
        if (data.status === 'finished' && view === 'game') setView('result');
        if (data.status === 'waiting' && (view === 'game' || view === 'result')) setView('room');
      } else if (view !== 'lobby') {
        alert("房間已關閉");
        setView('lobby');
        setRoomData(null);
      }
    });
    return () => unsubscribe();
  }, [user, roomId, view]);

  const createRoom = async () => {
    if (!playerName.trim()) return alert("請輸入名字");
    setLoading(true);
    try {
      const newRoomId = generateRoomId();
      const me = { id: user.uid, name: playerName, team: null, isHost: true };
      
      await setDoc(doc(db, 'rooms', `room_${newRoomId}`), {
        id: newRoomId, hostId: user.uid, status: 'waiting',
        players: [me],
        settings: DEFAULT_SETTINGS, scores: { A: 0, B: 0 },
        currentRound: 1, currentTeam: 'A', wordQueue: [], customWords: [],
        currentWord: null, roundEndTime: null, turnEndTime: null, gameState: 'idle',
        lastEvent: null 
      });
      setRoomId(newRoomId);
      setView('room');
    } catch (e) {
      console.error(e);
      alert("建立失敗: " + e.message);
    }
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomId.trim()) return alert("請輸入資料");
    setLoading(true);
    try {
      const rId = roomId.toUpperCase();
      const roomRef = doc(db, 'rooms', `room_${rId}`);

      await runTransaction(db, async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists()) throw new Error("房間不存在");

        const data = roomDoc.data();
        const currentPlayers = data.players || [];
        const playerIndex = currentPlayers.findIndex(p => p.id === user.uid);
        const newPlayer = { id: user.uid, name: playerName, team: null, isHost: false };
        let newPlayersList;

        if (playerIndex >= 0) {
          newPlayersList = [...currentPlayers];
          newPlayersList[playerIndex] = { ...newPlayersList[playerIndex], name: playerName };
        } else {
          newPlayersList = [...currentPlayers, newPlayer];
        }
        transaction.update(roomRef, { players: newPlayersList });
      });

      setRoomId(rId);
      setView('room');
    } catch (e) {
      console.error(e);
      alert("加入失敗: " + e.message);
    }
    setLoading(false);
  };

  const leaveRoom = async () => {
    if (!window.confirm("確定離開房間？")) return;
    try {
      const ref = doc(db, 'rooms', `room_${roomId}`);
      const newPlayers = roomData.players.filter(p => p.id !== user.uid);
      if (newPlayers.length === 0) await updateDoc(ref, { players: [] }); 
      else {
         if (roomData.hostId === user.uid) await updateDoc(ref, { players: newPlayers, hostId: newPlayers[0].id });
         else await updateDoc(ref, { players: newPlayers });
      }
    } catch(e) { console.error("Leave error", e); }
    setView('lobby'); setRoomId(''); setRoomData(null);
  };

  if (view === 'lobby') return <LobbyView onBack={onBack} playerName={playerName} setPlayerName={setPlayerName} roomId={roomId} setRoomId={setRoomId} createRoom={createRoom} joinRoom={joinRoom} loading={loading} user={user} />;
  
  if (!roomData) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">載入中...</div>;
  const isHost = roomData.hostId === user?.uid;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
       <header className="bg-white shadow-sm p-3 flex justify-between items-center z-20 sticky top-0">
          <div className="flex items-center gap-2">
            <button onClick={leaveRoom} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"><LogOut size={20} /></button>
            <div className="flex flex-col">
                <span className="text-xs text-slate-400">房間代碼</span>
                <div className="flex items-center gap-1 font-mono font-bold text-slate-700 text-lg">
                    {roomData.id}
                    <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-slate-400 hover:text-indigo-600"><ClipboardCopy size={14}/></button>
                </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex flex-col items-end mr-2">
                <span className="text-xs text-slate-400">玩家</span>
                <span className="font-bold text-slate-700">{user.isAnonymous ? playerName : user.displayName || playerName}</span>
             </div>
             {isHost && view === 'room' && <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-sm font-medium transition"><Settings size={16} /> 設定</button>}
          </div>
       </header>

       <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
          {view === 'room' && <RoomView roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user}
            onStart={async () => {
             const allWords = [...DEFAULT_WORDS_LARGE, ...roomData.customWords].sort(() => 0.5 - Math.random());
             await updateDoc(doc(db, 'rooms', `room_${roomId}`), {
               status: 'playing', wordQueue: allWords, scores: { A: 0, B: 0 },
               currentRound: 1, currentTeam: roomData.settings.startTeam, gameState: 'idle', currentWord: null, roundEndTime: null, turnEndTime: null
             });
          }} />}
          {view === 'game' && <GameInterface roomData={roomData} isHost={isHost} roomId={roomId} previewAsPlayer={previewAsPlayer} setPreviewAsPlayer={setPreviewAsPlayer} getNow={getNow} />}
          {view === 'result' && <ResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
       </main>

       {showSettings && <SettingsModal localSettings={localSettings} setLocalSettings={setLocalSettings} setShowSettings={setShowSettings} onSave={async () => { await updateDoc(doc(db, 'rooms', `room_${roomId}`), { settings: localSettings }); setShowSettings(false); }} />}
    </div>
  );
}

// --- Components ---

function LobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
        <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors"><ArrowLeft /></button>
        <div className="text-center pt-6">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-pink-500">比手畫腳</h1>
          <p className="text-white/60 text-sm mt-1">輸入名字與房間代碼開始</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/70 ml-1">你的名字</label>
            <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none placeholder-white/30 text-white" placeholder="例如：比手畫腳之神" />
          </div>
          <button onClick={createRoom} disabled={loading || !user} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95">建立新房間</button>
          <div className="relative py-2"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-2 text-white/40">或是加入房間</span></div></div>
          <div className="flex gap-2">
            <input value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl uppercase text-center font-mono tracking-widest placeholder-white/30 text-white" placeholder="房間 ID" />
            <button onClick={joinRoom} disabled={loading || !user} className="px-6 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-bold transition">加入</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomView({roomData, isHost, roomId, onStart, currentUser}) {
  const [newWord, setNewWord] = useState('');
  const players = roomData.players || [];
  // 濾掉主持人，只讓參賽者分組
  const participants = players.filter(p => p.id !== roomData.hostId);
  const teamA = participants.filter(p => p.team === 'A');
  const teamB = participants.filter(p => p.team === 'B');
  // 未分組 = 參賽者中沒有隊伍的人
  const unassigned = participants.filter(p => !p.team); 
  // 找出主持人資料
  const hostPlayer = players.find(p => p.id === roomData.hostId);
  
  const randomize = async () => {
    // 只對「非主持人」的玩家進行隨機分組
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    const mid = Math.ceil(shuffled.length / 2);
    
    // 重新組裝所有玩家列表：Host 保持原狀 (或清空 team)，其他人分 A/B
    const newParticipants = shuffled.map((p, i) => ({ ...p, team: i < mid ? 'A' : 'B' }));
    
    // 如果有主持人，確保他在列表裡，且 team 為 null (不參賽)
    const newPlayersList = hostPlayer 
        ? [...newParticipants, { ...hostPlayer, team: null }] 
        : newParticipants;

    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: newPlayersList });
  };

  const kickPlayer = async (targetId) => {
      if(!window.confirm("確定要踢出這位玩家嗎？")) return;
      const newPlayers = players.filter(p => p.id !== targetId);
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: newPlayers });
  };

  const makeHost = async (targetId) => {
      if(!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { hostId: targetId });
  };

  const PlayerItem = ({ p, showKick, showPromote }) => (
      <div className="flex items-center justify-between bg-white/60 p-2 rounded-lg mb-1 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-slate-700 font-medium">{p.name}</span>
            {p.id === roomData.hostId && <Crown size={14} className="text-yellow-500 fill-yellow-500"/>}
            {p.id === currentUser.uid && <span className="text-xs bg-slate-200 text-slate-600 px-1 rounded">我</span>}
          </div>
          <div className="flex gap-1">
            {showPromote && (
                <button onClick={() => makeHost(p.id)} className="text-slate-400 hover:text-yellow-500 p-1" title="設為主持人">
                    <Crown size={14}/>
                </button>
            )}
            {showKick && (
                <button onClick={() => kickPlayer(p.id)} className="text-slate-400 hover:text-red-500 p-1" title="踢出玩家">
                    <Trash2 size={14}/>
                </button>
            )}
          </div>
      </div>
  );

  return (
    <div className="p-4 md:p-8 w-full space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-indigo-500"/> 參賽玩家 ({participants.length})</h2>
                {isHost && <button onClick={randomize} className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full hover:bg-indigo-100 font-bold transition flex items-center gap-1"><Shuffle size={14}/> 隨機分組</button>}
            </div>
            
            {/* 主持人顯示區 */}
            <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wider mb-2">目前主持人</h4>
                {hostPlayer ? <PlayerItem p={hostPlayer} showKick={false} showPromote={false} /> : <div className="text-gray-400 text-sm">無主持人</div>}
            </div>

            <div className={`bg-slate-50 p-3 rounded-xl border border-dashed transition-colors ${unassigned.length>0 ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between"><span>等待分組</span><span className="bg-slate-200 px-2 rounded-full text-slate-600">{unassigned.length}</span></h4>
                <div className="grid grid-cols-2 gap-2">
                    {unassigned.length === 0 && <span className="text-slate-400 text-xs italic col-span-2 text-center py-2">所有參賽者皆已分組</span>}
                    {unassigned.map(p => <PlayerItem key={p.id} p={p} showKick={isHost && p.id !== currentUser.uid} showPromote={isHost} />)}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                    <h3 className="font-bold text-red-600 mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> A 隊</h3>
                    <div className="space-y-1">{teamA.map(p => <PlayerItem key={p.id} p={p} showKick={isHost && p.id !== currentUser.uid} showPromote={isHost} />)}</div>
                </div>
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                    <h3 className="font-bold text-blue-600 mb-3 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> B 隊</h3>
                    <div className="space-y-1">{teamB.map(p => <PlayerItem key={p.id} p={p} showKick={isHost && p.id !== currentUser.uid} showPromote={isHost} />)}</div>
                </div>
            </div>
        </div>
        <div className="space-y-6">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold mb-4 text-slate-800">自訂題目 (選填)</h2>
                <div className="flex gap-2">
                    <input value={newWord} onChange={e=>setNewWord(e.target.value)} className="border border-slate-200 p-3 rounded-xl flex-1 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="輸入題目..." />
                    <button onClick={() => { if(newWord.trim()){ updateDoc(doc(db, 'rooms', `room_${roomId}`), { customWords: arrayUnion(newWord.trim()) }); setNewWord(''); }}} className="bg-slate-800 hover:bg-slate-700 text-white px-4 rounded-xl"><Plus/></button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {roomData.customWords?.map((w,i)=><span key={i} className="bg-yellow-50 px-3 py-1 rounded-full text-sm border border-yellow-200 text-yellow-800">{w}</span>)}
                    {(!roomData.customWords || roomData.customWords.length === 0) && <div className="text-slate-400 text-sm bg-slate-50 p-3 rounded-lg w-full text-center border border-slate-100">已載入內建題庫 ({DEFAULT_WORDS_LARGE.length} 題)</div>}
                </div>
            </div>
            {isHost ? (
                <button onClick={onStart} className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold rounded-2xl shadow-lg shadow-green-200 transform hover:scale-[1.02] transition-all flex justify-center items-center gap-2"><Play className="fill-white" /> 開始遊戲</button>
            ) : <div className="text-center p-8 bg-slate-50 border border-slate-200 rounded-2xl"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div><h3 className="font-bold text-slate-700 text-lg">等待主持人開始...</h3></div>}
        </div>
      </div>
    </div>
  );
}

// ★★★ 核心遊戲介面 ★★★
function GameInterface({roomData, isHost, roomId, previewAsPlayer, setPreviewAsPlayer, getNow}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  const [notification, setNotification] = useState(null); 
  // 記錄最後一次顯示的事件時間戳，避免重複顯示
  const lastEventRef = useRef(0);

  // 事件通知監聽 (修正：不依賴系統時間，只要有新事件就顯示)
  useEffect(() => {
    if (roomData.lastEvent && roomData.lastEvent.timestamp !== lastEventRef.current) {
      setNotification(roomData.lastEvent);
      lastEventRef.current = roomData.lastEvent.timestamp;
      
      const timer = setTimeout(() => setNotification(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [roomData.lastEvent]);

  // 計時器邏輯 (使用 getNow() 進行同步)
  useEffect(() => {
    const t = setInterval(() => {
      const now = getNow(); // 使用校正後的時間
      
      // 題目計時
      if (roomData.gameState === 'paused' && roomData.savedState) {
        setTimeLeft(Math.max(0, Math.ceil(roomData.savedState.remainingTurn / 1000)));
      } else if (roomData.turnEndTime) {
        const remaining = Math.max(0, Math.ceil((roomData.turnEndTime - now)/1000));
        setTimeLeft(remaining);
      } else {
        setTimeLeft(roomData.settings.answerTime);
      }

      // 回合計時
      if (roomData.gameState === 'paused' && roomData.savedState) {
        setRoundTimeLeft(Math.max(0, Math.ceil(roomData.savedState.remainingRound / 1000)));
      } else if (roomData.gameState === 'active' && roomData.roundEndTime) {
        const rRemaining = Math.max(0, Math.ceil((roomData.roundEndTime - now)/1000));
        setRoundTimeLeft(rRemaining);
      } else {
        setRoundTimeLeft(roomData.settings.roundDuration);
      }
    }, 100);
    return () => clearInterval(t);
  }, [roomData, getNow]); // 相依 getNow 確保時間正確

  const updateGame = (data) => updateDoc(doc(db, 'rooms', `room_${roomId}`), data);
  
  // 觸發全場通知事件 (加上亂數後綴確保每次都是新物件)
  const triggerEvent = (text, color, extraData = {}) => {
    updateGame({
      ...extraData,
      lastEvent: { text, color, timestamp: Date.now() + Math.random() }
    });
  };

  const nextWord = (isSkip = false) => {
     let q = [...roomData.wordQueue];
     if(q.length === 0) q = [...DEFAULT_WORDS_LARGE, ...roomData.customWords].sort(()=>0.5-Math.random());
     const w = q.pop();
     
     // 這裡用 getNow() 確保 host 設定的時間是同步後的 server 時間
     const now = getNow();
     const newTurnEnd = now + roomData.settings.answerTime*1000;
     
     if (isSkip) {
        triggerEvent("跳過！扣分", "text-red-500", { 
            wordQueue: q, currentWord: w, turnEndTime: newTurnEnd,
            [`scores.${roomData.currentTeam}`]: increment(roomData.settings.pointsSkip)
        });
     } else {
        updateGame({ wordQueue: q, currentWord: w, turnEndTime: newTurnEnd });
     }
  };

  const handleCorrect = () => {
      let q = [...roomData.wordQueue];
      if(q.length === 0) q = [...DEFAULT_WORDS_LARGE, ...roomData.customWords].sort(()=>0.5-Math.random());
      const w = q.pop();
      const now = getNow();
      const newTurnEnd = now + roomData.settings.answerTime*1000;

      triggerEvent(`${roomData.currentTeam} 隊得分！`, "text-green-500", {
          wordQueue: q, currentWord: w, turnEndTime: newTurnEnd,
          [`scores.${roomData.currentTeam}`]: increment(roomData.settings.pointsCorrect)
      });
  };

  const pauseGame = () => {
      const now = getNow();
      const remainingTurn = roomData.turnEndTime ? roomData.turnEndTime - now : 0;
      const remainingRound = roomData.roundEndTime ? roomData.roundEndTime - now : 0;
      
      updateGame({
          gameState: 'paused',
          savedState: { remainingTurn, remainingRound }
      });
  };

  const resumeGame = () => {
      const now = getNow();
      const newTurnEnd = now + (roomData.savedState?.remainingTurn || 0);
      const newRoundEnd = now + (roomData.savedState?.remainingRound || 0);
      
      updateGame({
          gameState: 'active',
          turnEndTime: newTurnEnd,
          roundEndTime: newRoundEnd,
          savedState: null
      });
  };

  const resetRound = () => {
      if(!window.confirm("確定要重置本回合嗎？")) return;
      updateGame({
          gameState: 'idle',
          roundEndTime: null,
          turnEndTime: null,
          currentWord: null
      });
  };

  const switchTeam = () => {
     let nextTeam = roomData.currentTeam === 'A' ? 'B' : 'A';
     let nextRound = roomData.currentRound + (roomData.currentTeam === 'B' ? 1 : 0); 
     if(nextRound > roomData.settings.totalRounds) updateGame({ status: 'finished' });
     else updateGame({ currentTeam: nextTeam, currentRound: nextRound, gameState: 'idle', currentWord: null, roundEndTime: null, turnEndTime: null });
  };

  const forceEndGame = () => {
      if(!window.confirm("確定要提前結束遊戲並結算分數嗎？")) return;
      updateGame({ status: 'finished' });
  };

  const isSteal = timeLeft > 0 && timeLeft <= roomData.settings.stealTime;
  const isRoundOver = roundTimeLeft <= 0 && roomData.gameState === 'active';
  const showControls = isHost && !previewAsPlayer;
  const wordDisplay = showControls ? roomData.currentWord : (roomData.currentWord ? roomData.currentWord.replace(/[^\s]/g, '❓') : "準備中");

  return (
    <div className="flex-1 bg-slate-900 text-white flex flex-col relative overflow-hidden">
       {/* 全場通知彈出層 */}
       {notification && (
           <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
               <div className={`text-6xl font-black bg-white/90 px-8 py-4 rounded-3xl shadow-2xl backdrop-blur-md animate-bounce ${notification.color}`}>
                   {notification.text}
               </div>
           </div>
       )}

       {/* 暫停遮罩 */}
       {roomData.gameState === 'paused' && (
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
               <Pause size={64} className="text-white mb-4 animate-pulse"/>
               <h2 className="text-3xl font-bold text-white">遊戲暫停中</h2>
               {showControls && <button onClick={resumeGame} className="mt-6 px-8 py-3 bg-green-500 hover:bg-green-600 rounded-full text-xl font-bold">繼續遊戲</button>}
           </div>
       )}

       {/* 遊戲計分板 */}
       <div className="bg-slate-800 p-4 flex justify-between items-center z-10 shadow-md">
          <div className={`transition-all duration-300 ${roomData.currentTeam==='A'?'scale-110 opacity-100':'opacity-50 grayscale'}`}>
             <div className="flex flex-col items-center p-2 rounded-xl bg-red-900/30 border border-red-500/30 min-w-[80px]">
                 <span className="text-red-400 font-bold text-xs uppercase tracking-wider">A 隊</span>
                 <span className="text-3xl font-black text-white">{roomData.scores.A}</span>
             </div>
          </div>

          <div className="text-center flex flex-col items-center">
             <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Round {roomData.currentRound} / {roomData.settings.totalRounds}</div>
             <div className={`text-2xl font-mono font-bold px-4 py-1 rounded bg-black/40 ${roundTimeLeft < 60 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {isRoundOver ? "00:00" : `${Math.floor(roundTimeLeft/60)}:${String(roundTimeLeft%60).padStart(2,'0')}`}
             </div>
             {isHost && <button onClick={()=>setPreviewAsPlayer(!previewAsPlayer)} className="text-[10px] bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded mt-2 flex items-center gap-1 transition-colors">{previewAsPlayer ? <EyeOff size={10}/> : <Eye size={10}/>} {previewAsPlayer?"退出預覽":"預覽玩家"}</button>}
          </div>

          <div className={`transition-all duration-300 ${roomData.currentTeam==='B'?'scale-110 opacity-100':'opacity-50 grayscale'}`}>
             <div className="flex flex-col items-center p-2 rounded-xl bg-blue-900/30 border border-blue-500/30 min-w-[80px]">
                 <span className="text-blue-400 font-bold text-xs uppercase tracking-wider">B 隊</span>
                 <span className="text-3xl font-black text-white">{roomData.scores.B}</span>
             </div>
          </div>
       </div>

       {/* 主遊戲區 */}
       <div className="flex-1 flex flex-col items-center justify-center p-6 z-10 text-center relative">
          <div className={`absolute inset-0 bg-gradient-to-b ${roomData.currentTeam==='A' ? 'from-red-900/20' : 'from-blue-900/20'} to-slate-900 pointer-events-none`}></div>

          {/* 狀態：回合結束 */}
          {isRoundOver ? (
              <div className="z-10 animate-in zoom-in duration-300 bg-slate-800/80 p-8 rounded-3xl border border-slate-600 backdrop-blur-md">
                  <Timer size={64} className="text-red-400 mx-auto mb-4"/>
                  <h2 className="text-4xl font-bold mb-2 text-white">時間到！</h2>
                  <p className="text-slate-400 mb-6">本回合結束，請準備交換隊伍。</p>
                  {showControls ? (
                      <button onClick={switchTeam} className="px-10 py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-full font-bold text-xl shadow-lg transition-transform hover:scale-105">
                          換下一隊
                      </button>
                  ) : <div className="text-amber-400 font-bold animate-pulse">等待主持人切換...</div>}
              </div>
          ) : roomData.gameState === 'idle' ? (
             <div className="z-10 animate-in zoom-in duration-300">
                <h2 className="text-4xl font-bold mb-6 drop-shadow-lg">
                    輪到 <span className={roomData.currentTeam === 'A' ? 'text-red-400' : 'text-blue-400'}>{roomData.currentTeam} 隊</span>
                </h2>
                {showControls ? <button onClick={() => {
                   const now = getNow();
                   const roundEnd = (roomData.roundEndTime && roomData.roundEndTime > now) ? roomData.roundEndTime : now + roomData.settings.roundDuration * 1000;
                   updateGame({ gameState: 'active', roundEndTime: roundEnd });
                   nextWord();
                }} className="px-10 py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-full font-bold shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] transition-all text-xl">開始回合計時</button> 
                : <div className="animate-pulse text-slate-400 text-lg">等待主持人開始...</div>}
             </div>
          ) : (
             <div className="w-full max-w-2xl z-10">
                <div className="mb-10 relative inline-block">
                    <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center bg-slate-800 text-5xl font-mono font-bold shadow-2xl ${isSteal?'border-yellow-500 animate-pulse text-yellow-500':'border-slate-600 text-white'}`}>
                        {timeLeft}
                    </div>
                    {isSteal && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-3 py-1 text-xs font-bold rounded-full animate-bounce whitespace-nowrap shadow-lg border-2 border-slate-900">搶答時間!</div>}
                </div>
                
                <div className="bg-white text-slate-900 p-10 rounded-3xl shadow-2xl min-h-[240px] flex flex-col justify-center items-center border-4 border-slate-200 transform transition-all">
                   <h1 className="text-5xl md:text-7xl font-black break-all leading-tight">{wordDisplay}</h1>
                   {!showControls && isSteal && <p className="text-red-500 font-bold mt-6 text-xl animate-bounce">⚠️ 對方可搶答！</p>}
                   {showControls && <p className="text-slate-400 mt-4 text-sm font-bold">({roomData.currentWord?.length || 0} 個字)</p>}
                </div>
             </div>
          )}
       </div>

       {/* 主持人控制區 */}
       {showControls && (
         <div className="bg-slate-800 p-4 border-t border-slate-700 z-20 pb-8 md:pb-4">
            {isRoundOver ? (
                <div className="flex justify-center gap-4">
                    <button onClick={resetRound} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-bold">重置本回合</button>
                    <button onClick={switchTeam} className="px-8 py-3 bg-amber-500 hover:bg-amber-600 rounded-xl text-slate-900 font-bold shadow-lg">切換下一隊</button>
                </div>
            ) : roomData.gameState === 'active' || roomData.gameState === 'paused' ? (
               <div className="grid grid-cols-6 gap-2 max-w-3xl mx-auto h-20">
                  <button onClick={() => nextWord(true)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-2xl flex flex-col items-center justify-center transition active:scale-95 group">
                      <X className="group-hover:text-white transition-colors"/><span className="text-[10px] mt-1 font-bold">跳過</span>
                  </button>
                  
                  <button onClick={handleCorrect} className="col-span-2 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shadow-green-900/50 transform transition active:scale-95">
                      <Check size={32} strokeWidth={3} /> <span className="text-sm font-bold mt-1">答對 (+{roomData.settings.pointsCorrect})</span>
                  </button>
                  
                  <button onClick={() => nextWord(false)} className="bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex flex-col items-center justify-center transition active:scale-95">
                      <span className="text-sm font-bold">下一題</span><span className="text-[10px] opacity-70">(無分)</span>
                  </button>

                  {/* 暫停/控制區 */}
                  <div className="flex flex-col gap-1">
                      {roomData.gameState === 'paused' ? (
                          <button onClick={resumeGame} className="flex-1 bg-green-500 rounded-lg flex items-center justify-center"><Play size={20}/></button>
                      ) : (
                          <button onClick={pauseGame} className="flex-1 bg-yellow-600 rounded-lg flex items-center justify-center"><Pause size={20}/></button>
                      )}
                      <button onClick={resetRound} className="flex-1 bg-slate-600 rounded-lg flex items-center justify-center text-xs" title="重置"><RotateCcw size={16}/></button>
                  </div>

                  {/* 提前結算按鈕 */}
                  <button onClick={forceEndGame} className="bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 rounded-2xl flex flex-col items-center justify-center text-[10px] font-bold" title="提前結束遊戲">
                      <Trophy size={16} className="mb-1"/> 提前<br/>結算
                  </button>
               </div>
            ) : null}
         </div>
       )}
    </div>
  );
}

function ResultView({roomData, isHost, roomId}) {
   const winner = roomData.scores.A > roomData.scores.B ? 'A' : roomData.scores.A < roomData.scores.B ? 'B' : '平手';
   return (
     <div className="flex-1 bg-slate-900 flex items-center justify-center text-white p-4 text-center">
        <div className="space-y-8 animate-in zoom-in duration-500">
           <div className="relative inline-block">
               <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-bounce"/>
               <div className="absolute -top-4 -right-4 text-6xl">🎉</div>
               <div className="absolute -bottom-2 -left-4 text-6xl">✨</div>
           </div>
           
           <div>
               <h2 className="text-slate-400 font-bold uppercase tracking-widest mb-2">WINNER</h2>
               <h1 className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300">
                   {winner} 隊
               </h1>
           </div>

           <div className="flex gap-4 justify-center">
              <div className="bg-red-900/40 border border-red-500/30 p-6 rounded-2xl min-w-[120px]">
                  <div className="text-red-400 font-bold mb-2">A 隊</div>
                  <div className="text-4xl font-mono font-black">{roomData.scores.A}</div>
              </div>
              <div className="bg-blue-900/40 border border-blue-500/30 p-6 rounded-2xl min-w-[120px]">
                  <div className="text-blue-400 font-bold mb-2">B 隊</div>
                  <div className="text-4xl font-mono font-black">{roomData.scores.B}</div>
              </div>
           </div>
           
           {isHost && (
               <button onClick={() => updateDoc(doc(db, 'rooms', `room_${roomId}`), { status: 'waiting', gameState: 'idle' })} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-full font-bold text-lg shadow-lg shadow-indigo-900/50 transition transform hover:-translate-y-1">
                   回到大廳
               </button>
           )}
        </div>
     </div>
   );
}

function SettingsModal({ localSettings, setLocalSettings, setShowSettings, onSave }) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-5 shadow-2xl animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="font-bold text-lg text-slate-800">遊戲設定</h3>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1"><label className="text-slate-500 font-medium">總輪數</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={localSettings.totalRounds} onChange={e=>setLocalSettings({...localSettings, totalRounds: +e.target.value})} /></div>
                <div className="space-y-1"><label className="text-slate-500 font-medium">每題秒數</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={localSettings.answerTime} onChange={e=>setLocalSettings({...localSettings, answerTime: +e.target.value})} /></div>
                <div className="space-y-1"><label className="text-slate-500 font-medium">搶答秒數</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={localSettings.stealTime} onChange={e=>setLocalSettings({...localSettings, stealTime: +e.target.value})} /></div>
                <div className="space-y-1"><label className="text-slate-500 font-medium">單隊限時</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" value={localSettings.roundDuration} onChange={e=>setLocalSettings({...localSettings, roundDuration: +e.target.value})} /></div>
                <div className="col-span-2 border-t pt-3 mt-1 font-bold text-slate-800">分數規則</div>
                <div className="space-y-1"><label className="text-slate-500 font-medium text-green-600">答對得分</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" value={localSettings.pointsCorrect} onChange={e=>setLocalSettings({...localSettings, pointsCorrect: +e.target.value})} /></div>
                <div className="space-y-1"><label className="text-slate-500 font-medium text-red-500">跳過扣分</label><input type="number" className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-red-500 outline-none" value={localSettings.pointsSkip} onChange={e=>setLocalSettings({...localSettings, pointsSkip: +e.target.value})} /></div>
              </div>
              <button onClick={onSave} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-lg">儲存設定</button>
            </div>
         </div>
    );
}