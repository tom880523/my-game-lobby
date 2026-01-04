import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, 
  arrayUnion, arrayRemove, increment 
} from 'firebase/firestore';
import { 
  Users, Play, Settings, Plus, Check, X, Clock, 
  Shuffle, AlertCircle, Eye, EyeOff, ClipboardCopy, Trophy
} from 'lucide-react';

// =================================================================
// 步驟 1: 請在這裡填入你的 Firebase Config
// 你可以在 Firebase Console -> Project Settings -> General -> Your apps 下方找到
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA5vgv34lsCJGOgmKhVZzZUp9L0Ut-JdUY",
  authDomain: "game-lobby-c3225.firebaseapp.com",
  projectId: "game-lobby-c3225",
  storageBucket: "game-lobby-c3225.firebasestorage.app",
  messagingSenderId: "900294983374",
  appId: "1:900294983374:web:696061e1ab31ca49bb5a9f"
};

// 初始化 Firebase (防止重複初始化)
let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase 初始化失敗，可能是 Config 尚未填寫", e);
}

// --- 預設資料 ---
const DEFAULT_WORDS = [
  "比手畫腳", "大象", "電腦", "珍珠奶茶", "鋼鐵人", "騎腳踏車", 
  "打棒球", "游泳", "睡覺", "化妝", "自拍", "放風箏", 
  "蜘蛛人", "打蚊子", "吃麵", "洗澡", "麥當勞", "求婚"
];

const DEFAULT_SETTINGS = {
  answerTime: 30,      // 每題時間
  stealTime: 10,       // 搶答時間
  roundDuration: 600,  // 一回合總時間限制 (秒)
  totalRounds: 2,      // 總輪數 (A+B 算一輪)
  pointsCorrect: 3,
  pointsSkip: -1,
  startTeam: 'A'
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// --- 主程式 ---
export default function CharadesGame() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('lobby'); // lobby, room, game, result
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [customWordInput, setCustomWordInput] = useState('');
  
  // 設定相關狀態
  const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  
  // 測試/預覽用
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);

  // 1. 登入邏輯
  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u);
      else signInAnonymously(auth).catch(e => setErrorMsg("登入失敗: " + e.message));
    });
    return () => unsubscribe();
  }, []);

  // 2. 監聽房間數據
  useEffect(() => {
    if (!user || !roomId || !db) return;

    // 路徑：rooms/room_ID
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRoomData(data);
        setErrorMsg('');
        
        // 自動跳轉邏輯
        if (data.status === 'playing' && view === 'room') setView('game');
        if (data.status === 'finished' && view === 'game') setView('result');
        if (data.status === 'waiting' && (view === 'game' || view === 'result')) setView('room');
      } else {
        if (view !== 'lobby') {
          setErrorMsg('房間不存在');
          setView('lobby');
          setRoomData(null);
        }
      }
    }, (err) => {
      console.error(err);
      setErrorMsg("連線錯誤，請檢查 Firebase Config 或網路");
    });

    return () => unsubscribe();
  }, [user, roomId, view]);

  // --- 操作功能 ---

  const createRoom = async () => {
    if (!playerName.trim()) return alert("請輸入名字");
    setLoading(true);
    const newRoomId = generateRoomId();
    const roomRef = doc(db, 'rooms', `room_${newRoomId}`);
    
    const initialData = {
      id: newRoomId,
      hostId: user.uid,
      status: 'waiting', // waiting, playing, finished
      players: [{ id: user.uid, name: playerName, team: null }],
      settings: DEFAULT_SETTINGS,
      scores: { A: 0, B: 0 },
      
      // 遊戲進度控制
      currentRound: 1,      // 目前第幾輪
      currentTeam: 'A',     // 目前哪一隊
      
      wordQueue: [],
      customWords: [],
      currentWord: null,
      
      // 時間控制
      roundEndTime: null,   // 回合結束時間戳
      turnEndTime: null,    // 單題結束時間戳
      gameState: 'idle'     // idle(暫停/換隊), active(進行中)
    };

    try {
      await setDoc(roomRef, initialData);
      setRoomId(newRoomId);
      setView('room');
      setPreviewAsPlayer(false);
    } catch (e) {
      console.error(e);
      setErrorMsg("建立房間失敗，請確認 Firestore 權限");
    }
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomId.trim()) return alert("請輸入名字與房間號");
    setLoading(true);
    const targetId = roomId.toUpperCase();
    const roomRef = doc(db, 'rooms', `room_${targetId}`);
    
    try {
      const docSnap = await getDoc(roomRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        // 如果不在房間內才加入
        if (!data.players.find(p => p.id === user.uid)) {
          await updateDoc(roomRef, {
            players: arrayUnion({ id: user.uid, name: playerName, team: null })
          });
        }
        setRoomId(targetId);
        setView('room');
      } else {
        alert("找不到房間");
      }
    } catch (e) {
      console.error(e);
      alert("加入失敗");
    }
    setLoading(false);
  };

  // --- 遊戲內操作 (僅主持人) ---

  const startGame = async () => {
    // 洗牌
    const allWords = [...DEFAULT_WORDS, ...roomData.customWords];
    const shuffledWords = allWords.sort(() => 0.5 - Math.random());
    
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    await updateDoc(roomRef, {
      status: 'playing',
      wordQueue: shuffledWords,
      scores: { A: 0, B: 0 },
      currentRound: 1,
      currentTeam: roomData.settings.startTeam,
      gameState: 'idle',
      currentWord: null,
      roundEndTime: null
    });
  };

  const startRoundTimer = async () => {
    const now = Date.now();
    let roundEnd = roomData.roundEndTime;
    // 如果是新的開始，設定該隊伍的總時間
    if (!roundEnd || roomData.gameState === 'idle' || (roundEnd - now <= 0)) {
      roundEnd = now + (roomData.settings.roundDuration * 1000);
    }
    
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    await updateDoc(roomRef, {
      gameState: 'active',
      roundEndTime: roundEnd,
    });
    nextWord();
  };

  const nextWord = async () => {
    let queue = [...roomData.wordQueue];
    if (queue.length === 0) {
      // 題庫用完自動重新洗牌
      const allWords = [...DEFAULT_WORDS, ...roomData.customWords];
      queue = allWords.sort(() => 0.5 - Math.random());
    }
    const nextW = queue.pop();
    const now = Date.now();

    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    await updateDoc(roomRef, {
      wordQueue: queue,
      currentWord: nextW,
      turnEndTime: now + (roomData.settings.answerTime * 1000)
    });
  };

  const handleScore = async (points) => {
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    await updateDoc(roomRef, {
      [`scores.${roomData.currentTeam}`]: increment(points)
    });
    nextWord();
  };

  const switchTeam = async () => {
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    
    let nextTeam = roomData.currentTeam === 'A' ? 'B' : 'A';
    let nextRound = roomData.currentRound;

    // 邏輯：如果你設定先攻是 A。
    // A -> B (仍在 Round 1)
    // B -> A (進入 Round 2)
    // 如果先攻設定改變，這裡邏輯可能要微調，目前假設 A 先攻
    if (roomData.currentTeam === 'B') {
        nextRound += 1;
    }

    // 檢查是否超過總輪數
    if (nextRound > roomData.settings.totalRounds) {
        await updateDoc(roomRef, { status: 'finished' });
    } else {
        await updateDoc(roomRef, {
            currentTeam: nextTeam,
            currentRound: nextRound,
            gameState: 'idle',
            currentWord: null,
            roundEndTime: null, // 重置回合時間
            turnEndTime: null
        });
    }
  };

  const resetGame = async () => {
    const roomRef = doc(db, 'rooms', `room_${roomId}`);
    await updateDoc(roomRef, { status: 'waiting', gameState: 'idle' });
  };

  // --- 畫面渲染輔助 ---
  const isHost = roomData?.hostId === user?.uid;
  
  if (!auth) return <div className="p-10 text-center">請先設定 Firebase Config (詳見程式碼註解)</div>;
  if (view === 'lobby') return <LobbyView {...{playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, errorMsg, loading}} />;
  if (view === 'result') return <ResultView roomData={roomData} isHost={isHost} resetGame={resetGame} />;
  
  // Room & Game View
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
       {/* 頂部資訊列 */}
       <header className="bg-white shadow p-3 flex justify-between items-center z-20">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-mono font-bold">
              ID: {roomData?.id}
            </span>
            <button onClick={() => navigator.clipboard.writeText(roomData?.id)}><ClipboardCopy size={16}/></button>
          </div>
          {isHost && view === 'room' && (
             <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }}>
                <Settings className="text-gray-600" />
             </button>
          )}
       </header>

       {/* 內容區 */}
       <main className="flex-1 flex flex-col">
          {view === 'room' ? (
             <RoomView 
                roomData={roomData} isHost={isHost} user={user} db={db} roomId={roomId} 
                startGame={startGame} 
                setLocalSettings={setLocalSettings} setShowSettings={setShowSettings}
             />
          ) : (
             <GameInterface 
                roomData={roomData} isHost={isHost} 
                startRoundTimer={startRoundTimer} nextWord={nextWord} handleScore={handleScore} 
                switchTeam={switchTeam} 
                previewAsPlayer={previewAsPlayer} setPreviewAsPlayer={setPreviewAsPlayer}
             />
          )}
       </main>

       {/* 設定彈窗 */}
       {showSettings && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4">
              <h3 className="font-bold text-lg">遊戲設定</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <label>總輪數 (Rounds)</label>
                <input type="number" className="border p-1 rounded" value={localSettings.totalRounds} onChange={e=>setLocalSettings({...localSettings, totalRounds: +e.target.value})} />
                
                <label>每題時間 (秒)</label>
                <input type="number" className="border p-1 rounded" value={localSettings.answerTime} onChange={e=>setLocalSettings({...localSettings, answerTime: +e.target.value})} />
                
                <label>搶答倒數 (秒)</label>
                <input type="number" className="border p-1 rounded" value={localSettings.stealTime} onChange={e=>setLocalSettings({...localSettings, stealTime: +e.target.value})} />
                
                <label>單隊限時 (秒)</label>
                <input type="number" className="border p-1 rounded" value={localSettings.roundDuration} onChange={e=>setLocalSettings({...localSettings, roundDuration: +e.target.value})} />
              </div>
              <div className="flex gap-2 pt-2">
                 <button onClick={() => setShowSettings(false)} className="flex-1 py-2 bg-gray-100 rounded">取消</button>
                 <button onClick={async () => {
                    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { settings: localSettings });
                    setShowSettings(false);
                 }} className="flex-1 py-2 bg-indigo-600 text-white rounded">儲存</button>
              </div>
            </div>
         </div>
       )}
    </div>
  );
}

// --- 子組件 (拆分以保持整潔) ---

function LobbyView({playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, errorMsg, loading}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-800">比手畫腳大亂鬥</h1>
        <div className="space-y-4">
          <input 
            value={playerName} onChange={e => setPlayerName(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg" placeholder="你的名字"
          />
          <button onClick={createRoom} disabled={loading} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold">建立房間</button>
          <div className="flex gap-2">
            <input 
              value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())}
              className="flex-1 px-4 py-2 border rounded-lg text-center uppercase" placeholder="輸入 ID"
            />
            <button onClick={joinRoom} disabled={loading} className="px-6 bg-purple-100 text-purple-700 rounded-lg font-bold">加入</button>
          </div>
          {errorMsg && <p className="text-red-500 text-center text-sm">{errorMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function RoomView({roomData, isHost, user, db, roomId, startGame}) {
  const [newWord, setNewWord] = useState('');
  const teamA = roomData.players.filter(p => p.team === 'A');
  const teamB = roomData.players.filter(p => p.team === 'B');
  const unassigned = roomData.players.filter(p => !p.team);

  const randomize = async () => {
    const shuffled = [...roomData.players].sort(() => 0.5 - Math.random());
    const mid = Math.ceil(shuffled.length / 2);
    const updated = shuffled.map((p, i) => ({ ...p, team: i < mid ? 'A' : 'B' }));
    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: updated });
  };

  const addWord = async () => {
    if(!newWord.trim()) return;
    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customWords: arrayUnion(newWord.trim()) });
    setNewWord('');
  };

  return (
    <div className="p-4 max-w-4xl mx-auto w-full grid gap-6">
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-xl font-bold">隊伍分配</h2>
           {isHost && <button onClick={randomize} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded"><Shuffle size={14}/> 隨機</button>}
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-red-50 p-3 rounded">
             <h3 className="font-bold text-red-600">A 隊</h3>
             {teamA.map(p => <div key={p.id}>{p.name}</div>)}
           </div>
           <div className="bg-blue-50 p-3 rounded">
             <h3 className="font-bold text-blue-600">B 隊</h3>
             {teamB.map(p => <div key={p.id}>{p.name}</div>)}
           </div>
        </div>
        {unassigned.length > 0 && <div className="mt-2 text-sm text-gray-500">未分組: {unassigned.map(p=>p.name).join(', ')}</div>}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm">
         <h2 className="text-lg font-bold mb-2">增加題目</h2>
         <div className="flex gap-2">
            <input value={newWord} onChange={e=>setNewWord(e.target.value)} className="border p-2 rounded flex-1" placeholder="輸入題目..."/>
            <button onClick={addWord} className="bg-indigo-600 text-white px-4 rounded"><Plus/></button>
         </div>
         <div className="mt-2 flex flex-wrap gap-2">
            {roomData.customWords.map((w, i) => (
              <span key={i} className="bg-yellow-50 px-2 py-1 text-xs rounded border border-yellow-200">{w}</span>
            ))}
         </div>
      </div>

      {isHost ? (
        <button onClick={startGame} className="w-full py-4 bg-green-500 text-white text-xl font-bold rounded-xl shadow-lg flex justify-center items-center gap-2">
           <Play /> 開始遊戲
        </button>
      ) : (
        <div className="text-center p-8 bg-indigo-50 rounded-xl text-indigo-800 font-bold animate-pulse">等待主持人開始...</div>
      )}
    </div>
  );
}

function GameInterface({roomData, isHost, startRoundTimer, nextWord, handleScore, switchTeam, previewAsPlayer, setPreviewAsPlayer}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (roomData.turnEndTime) setTimeLeft(Math.max(0, Math.ceil((roomData.turnEndTime - now)/1000)));
      else setTimeLeft(roomData.settings.answerTime);

      if (roomData.gameState === 'active' && roomData.roundEndTime) setRoundTimeLeft(Math.max(0, Math.ceil((roomData.roundEndTime - now)/1000)));
      else setRoundTimeLeft(roomData.settings.roundDuration);
    }, 100);
    return () => clearInterval(timer);
  }, [roomData]);

  const isSteal = timeLeft > 0 && timeLeft <= roomData.settings.stealTime;
  const showControls = isHost && !previewAsPlayer;
  const currentTeamColor = roomData.currentTeam === 'A' ? 'text-red-500' : 'text-blue-500';

  // 題目顯示遮罩
  const displayWord = useMemo(() => {
    if (showControls) return roomData.currentWord;
    if (!roomData.currentWord) return "準備中";
    return roomData.currentWord.split('').map(c => /[a-zA-Z0-9\u4e00-\u9fa5]/.test(c) ? "❓" : c).join('');
  }, [roomData.currentWord, showControls]);

  return (
    <div className="flex-1 bg-gray-900 text-white flex flex-col relative overflow-hidden">
       {/* 分數板 */}
       <div className="bg-gray-800 p-4 flex justify-between items-center z-10">
          <div className={`text-center ${roomData.currentTeam === 'A' ? 'opacity-100 scale-110' : 'opacity-50'}`}>
             <div className="text-red-400 font-bold text-sm">A 隊</div>
             <div className="text-3xl font-black">{roomData.scores.A}</div>
          </div>
          <div className="text-center">
             <div className="text-xs text-gray-400">Round {roomData.currentRound} / {roomData.settings.totalRounds}</div>
             <div className={`text-2xl font-mono ${roundTimeLeft < 60 ? 'text-red-500' : 'text-white'}`}>
                {Math.floor(roundTimeLeft/60)}:{String(roundTimeLeft%60).padStart(2,'0')}
             </div>
             {isHost && (
               <button onClick={()=>setPreviewAsPlayer(!previewAsPlayer)} className="text-[10px] bg-gray-700 px-2 rounded mt-1">
                 {previewAsPlayer ? "退出預覽" : "預覽玩家"}
               </button>
             )}
          </div>
          <div className={`text-center ${roomData.currentTeam === 'B' ? 'opacity-100 scale-110' : 'opacity-50'}`}>
             <div className="text-blue-400 font-bold text-sm">B 隊</div>
             <div className="text-3xl font-black">{roomData.scores.B}</div>
          </div>
       </div>

       {/* 中央遊戲區 */}
       <div className="flex-1 flex flex-col items-center justify-center p-4 z-10">
          {roomData.gameState === 'idle' ? (
             <div className="text-center space-y-4">
                <h2 className="text-3xl font-bold">輪到 <span className={currentTeamColor}>{roomData.currentTeam} 隊</span></h2>
                {showControls ? (
                  <button onClick={startRoundTimer} className="px-8 py-3 bg-white text-black rounded-full font-bold shadow-lg hover:scale-105 transition">
                    開始計時
                  </button>
                ) : <div className="animate-pulse text-gray-400">請看主持人指示...</div>}
             </div>
          ) : (
             <>
                <div className="relative mb-8">
                   <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center bg-gray-800 text-5xl font-mono font-bold ${isSteal ? 'border-yellow-500 animate-pulse' : 'border-indigo-500'}`}>
                      {timeLeft}
                   </div>
                   {isSteal && <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-2 text-xs font-bold animate-bounce whitespace-nowrap">搶答時間!</div>}
                </div>
                
                <div className="bg-white text-black rounded-2xl p-8 w-full max-w-xl text-center min-h-[200px] flex flex-col justify-center">
                   <h1 className="text-5xl md:text-6xl font-black break-all">{displayWord}</h1>
                   {!showControls && isSteal && <p className="text-red-600 font-bold mt-2 animate-pulse">對方可搶答！</p>}
                </div>
             </>
          )}
       </div>

       {/* 控制區 */}
       {showControls && (
         <div className="bg-gray-800 p-4 border-t border-gray-700 z-20">
            {roomData.gameState === 'active' ? (
               <div className="grid grid-cols-4 gap-3 max-w-2xl mx-auto h-20">
                  <button onClick={() => handleScore(roomData.settings.pointsSkip)} className="bg-gray-600 rounded-xl flex flex-col items-center justify-center hover:bg-gray-500">
                     <X/> <span className="text-xs">跳過</span>
                  </button>
                  <button onClick={() => handleScore(roomData.settings.pointsCorrect)} className="col-span-2 bg-green-500 rounded-xl flex flex-col items-center justify-center hover:bg-green-400 shadow-lg">
                     <Check size={32}/> <span className="font-bold">答對</span>
                  </button>
                  <button onClick={nextWord} className="bg-blue-600 rounded-xl flex flex-col items-center justify-center hover:bg-blue-500">
                     <span className="font-bold text-sm">下一題</span>
                     <span className="text-[10px]">(無分)</span>
                  </button>
               </div>
            ) : (
               <div className="flex justify-between max-w-2xl mx-auto">
                  <button onClick={switchTeam} className="bg-yellow-600 px-4 py-2 rounded text-white font-bold">切換隊伍 / 下一輪</button>
               </div>
            )}
         </div>
       )}
    </div>
  );
}

function ResultView({roomData, resetGame, isHost}) {
   const winner = roomData.scores.A > roomData.scores.B ? 'A' : roomData.scores.A < roomData.scores.B ? 'B' : '平手';
   return (
     <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4">
        <div className="text-center space-y-8">
           <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-bounce"/>
           <h1 className="text-5xl font-bold">遊戲結束</h1>
           <div className="text-3xl">
              獲勝的是：<span className="text-yellow-400 font-black">{winner} 隊</span>
           </div>
           <div className="flex gap-8 justify-center text-2xl font-mono bg-gray-800 p-6 rounded-xl">
              <div className="text-red-400">A: {roomData.scores.A}</div>
              <div className="text-blue-400">B: {roomData.scores.B}</div>
           </div>
           {isHost && <button onClick={resetGame} className="px-8 py-3 bg-indigo-600 rounded-full font-bold hover:bg-indigo-500">回到大廳</button>}
        </div>
     </div>
   );
}