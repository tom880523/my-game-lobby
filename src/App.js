import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, 
  arrayUnion, increment 
} from 'firebase/firestore';
import { 
  Users, Play, Settings, Plus, Check, X, 
  Shuffle, AlertCircle, ClipboardCopy, Trophy, 
  Gamepad2, ArrowLeft, Construction
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
          <pre className="text-left bg-white p-4 rounded border border-red-200 overflow-auto max-w-lg">
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
  if (currentApp === 'charades') return <CharadesGame onBack={() => setCurrentApp('home')} />;
  return null;
}

// --- 1. 大廳 ---
function GameLobby({ onSelectGame }) {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-12">
         <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gamepad2 className="text-indigo-400" />
            線上派對遊戲中心
         </h1>
      </header>
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
        <button 
          onClick={() => onSelectGame('charades')}
          className="group relative bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-1 overflow-hidden hover:scale-105 transition-all duration-300 text-left"
        >
          <div className="bg-gray-900/20 backdrop-blur-sm h-full rounded-xl p-6 flex flex-col justify-between min-h-[200px]">
             <div>
               <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4"><Users className="text-white w-6 h-6" /></div>
               <h2 className="text-2xl font-bold mb-2">比手畫腳大亂鬥</h2>
               <p className="text-gray-300 text-sm">支援搶答、自訂題目與即時計分。</p>
             </div>
             <div className="flex items-center gap-2 text-indigo-300 font-bold mt-4">進入遊戲 <ArrowLeft className="rotate-180" size={16}/></div>
          </div>
        </button>
        <div className="bg-gray-800 rounded-2xl p-6 flex flex-col justify-between min-h-[200px] opacity-60 border border-gray-700">
           <div>
             <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center mb-4"><Construction className="text-gray-500 w-6 h-6" /></div>
             <h2 className="text-xl font-bold text-gray-500 mb-2">間諜家家酒</h2>
             <p className="text-gray-600 text-sm">開發中...</p>
           </div>
        </div>
      </main>
      <footer className="mt-auto pt-12 text-gray-600 text-sm">v1.2</footer>
    </div>
  );
}

// --- 2. 遊戲主邏輯 ---
const DEFAULT_SETTINGS = {
  answerTime: 30, stealTime: 10, roundDuration: 600, totalRounds: 2, 
  pointsCorrect: 3, pointsSkip: -1, startTeam: 'A'
};
const DEFAULT_WORDS = ["比手畫腳", "大象", "電腦", "珍珠奶茶", "鋼鐵人", "騎腳踏車", "打棒球", "游泳", "睡覺", "化妝", "自拍", "放風箏", "蜘蛛人", "打蚊子", "吃麵", "洗澡", "麥當勞", "求婚"];
const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

function CharadesGame({ onBack }) {
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
        if (data.status === 'playing' && view === 'room') setView('game');
        if (data.status === 'finished' && view === 'game') setView('result');
        if (data.status === 'waiting' && (view === 'game' || view === 'result')) setView('room');
      } else if (view !== 'lobby') {
        alert("房間不存在");
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
      await setDoc(doc(db, 'rooms', `room_${newRoomId}`), {
        id: newRoomId, hostId: user.uid, status: 'waiting',
        players: [{ id: user.uid, name: playerName, team: null }],
        settings: DEFAULT_SETTINGS, scores: { A: 0, B: 0 },
        currentRound: 1, currentTeam: 'A', wordQueue: [], customWords: [],
        currentWord: null, roundEndTime: null, turnEndTime: null, gameState: 'idle'
      });
      setRoomId(newRoomId);
      setView('room');
    } catch (e) {
      console.error(e);
      alert("建立失敗");
    }
    setLoading(false);
  };

  const joinRoom = async () => {
    if (!playerName.trim() || !roomId.trim()) return alert("請輸入資料");
    setLoading(true);
    try {
      const rId = roomId.toUpperCase();
      const ref = doc(db, 'rooms', `room_${rId}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (!data.players.find(p => p.id === user.uid)) {
          await updateDoc(ref, { players: arrayUnion({ id: user.uid, name: playerName, team: null }) });
        }
        setRoomId(rId);
        setView('room');
      } else alert("房間不存在");
    } catch (e) {
      console.error(e);
      alert("加入失敗");
    }
    setLoading(false);
  };

  const leaveRoom = () => {
    if (window.confirm("確定離開房間？")) {
      setView('lobby');
      setRoomId('');
      setRoomData(null);
    }
  };

  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full space-y-6 relative">
          <button onClick={onBack} className="absolute top-4 left-4 text-gray-400 hover:text-gray-600"><ArrowLeft /></button>
          <div className="text-center pt-6"><h1 className="text-3xl font-bold text-gray-800">比手畫腳</h1></div>
          <div className="space-y-4">
            <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full px-4 py-2 border rounded-lg" placeholder="你的名字" />
            <button onClick={createRoom} disabled={loading || !user} className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold">建立房間</button>
            <div className="flex gap-2">
              <input value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())} className="flex-1 px-4 py-2 border rounded-lg uppercase" placeholder="輸入 ID" />
              <button onClick={joinRoom} disabled={loading || !user} className="px-6 bg-purple-100 text-purple-700 rounded-lg font-bold">加入</button>
            </div>
            {!user && <p className="text-center text-xs text-gray-400">連線中...</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!roomData) return <div className="p-10 text-center">載入中...</div>;
  const isHost = roomData.hostId === user?.uid;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
       <header className="bg-white shadow p-3 flex justify-between items-center z-20">
          <div className="flex items-center gap-2">
            <button onClick={leaveRoom}><ArrowLeft size={20} className="text-gray-500"/></button>
            <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-mono font-bold">ID: {roomData.id}</span>
            <button onClick={() => navigator.clipboard.writeText(roomData.id)}><ClipboardCopy size={16}/></button>
          </div>
          {isHost && view === 'room' && <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }}><Settings className="text-gray-600" /></button>}
       </header>

       <main className="flex-1 flex flex-col">
          {view === 'room' && <RoomView roomData={roomData} isHost={isHost} roomId={roomId} onStart={async () => {
             const allWords = [...DEFAULT_WORDS, ...roomData.customWords].sort(() => 0.5 - Math.random());
             await updateDoc(doc(db, 'rooms', `room_${roomId}`), {
               status: 'playing', wordQueue: allWords, scores: { A: 0, B: 0 },
               currentRound: 1, currentTeam: roomData.settings.startTeam, gameState: 'idle', currentWord: null, roundEndTime: null
             });
          }} />}
          {view === 'game' && <GameInterface roomData={roomData} isHost={isHost} roomId={roomId} previewAsPlayer={previewAsPlayer} setPreviewAsPlayer={setPreviewAsPlayer} />}
          {view === 'result' && <ResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
       </main>

       {showSettings && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="font-bold">遊戲設定</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <label>總輪數</label><input type="number" className="border p-1 rounded" value={localSettings.totalRounds} onChange={e=>setLocalSettings({...localSettings, totalRounds: +e.target.value})} />
                <label>每題秒數</label><input type="number" className="border p-1 rounded" value={localSettings.answerTime} onChange={e=>setLocalSettings({...localSettings, answerTime: +e.target.value})} />
                <label>搶答秒數</label><input type="number" className="border p-1 rounded" value={localSettings.stealTime} onChange={e=>setLocalSettings({...localSettings, stealTime: +e.target.value})} />
                <label>單隊限時</label><input type="number" className="border p-1 rounded" value={localSettings.roundDuration} onChange={e=>setLocalSettings({...localSettings, roundDuration: +e.target.value})} />
                
                {/* 新增：得分/扣分設定 */}
                <div className="col-span-2 border-t pt-2 mt-2 font-bold text-gray-500">分數規則</div>
                <label>答對得分</label><input type="number" className="border p-1 rounded" value={localSettings.pointsCorrect} onChange={e=>setLocalSettings({...localSettings, pointsCorrect: +e.target.value})} />
                <label>跳過扣分</label><input type="number" className="border p-1 rounded" value={localSettings.pointsSkip} onChange={e=>setLocalSettings({...localSettings, pointsSkip: +e.target.value})} />
              </div>
              <button onClick={async () => { await updateDoc(doc(db, 'rooms', `room_${roomId}`), { settings: localSettings }); setShowSettings(false); }} className="w-full py-2 bg-indigo-600 text-white rounded">儲存</button>
            </div>
         </div>
       )}
    </div>
  );
}

// --- Sub Components ---
function RoomView({roomData, isHost, roomId, onStart}) {
  const [newWord, setNewWord] = useState('');
  const teamA = roomData.players?.filter(p => p.team === 'A') || [];
  const teamB = roomData.players?.filter(p => p.team === 'B') || [];
  
  const randomize = async () => {
    const shuffled = [...roomData.players].sort(() => 0.5 - Math.random());
    const mid = Math.ceil(shuffled.length / 2);
    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: shuffled.map((p, i) => ({ ...p, team: i < mid ? 'A' : 'B' })) });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto w-full space-y-4">
      <div className="bg-white p-6 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-4">
           <h2 className="text-xl font-bold">隊伍 (Host 可拖拉或按隨機)</h2>
           {isHost && <button onClick={randomize} className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1 rounded flex items-center gap-1"><Shuffle size={14}/> 隨機</button>}
        </div>
        <div className="grid grid-cols-2 gap-4">
           <div className="bg-red-50 p-3 rounded min-h-[100px]"><h3 className="font-bold text-red-600 mb-2">A 隊</h3>{teamA.map(p=><div key={p.id}>{p.name}</div>)}</div>
           <div className="bg-blue-50 p-3 rounded min-h-[100px]"><h3 className="font-bold text-blue-600 mb-2">B 隊</h3>{teamB.map(p=><div key={p.id}>{p.name}</div>)}</div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm">
         <h2 className="text-lg font-bold mb-2">加題目</h2>
         <div className="flex gap-2">
            <input value={newWord} onChange={e=>setNewWord(e.target.value)} className="border p-2 rounded flex-1" placeholder="輸入..." />
            <button onClick={() => { if(newWord.trim()){ updateDoc(doc(db, 'rooms', `room_${roomId}`), { customWords: arrayUnion(newWord.trim()) }); setNewWord(''); }}} className="bg-indigo-600 text-white px-4 rounded"><Plus/></button>
         </div>
         <div className="mt-2 flex flex-wrap gap-2">{roomData.customWords?.map((w,i)=><span key={i} className="bg-yellow-50 px-2 text-xs border border-yellow-200">{w}</span>)}</div>
      </div>
      {isHost ? <button onClick={onStart} className="w-full py-4 bg-green-500 text-white text-xl font-bold rounded-xl shadow-lg flex justify-center items-center gap-2"><Play /> 開始遊戲</button> : <div className="text-center p-8 bg-indigo-50 rounded-xl font-bold animate-pulse text-indigo-600">等待主持人...</div>}
    </div>
  );
}

function GameInterface({roomData, isHost, roomId, previewAsPlayer, setPreviewAsPlayer}) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [roundTimeLeft, setRoundTimeLeft] = useState(0);
  
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setTimeLeft(roomData.turnEndTime ? Math.max(0, Math.ceil((roomData.turnEndTime - now)/1000)) : roomData.settings.answerTime);
      setRoundTimeLeft(roomData.roundEndTime ? Math.max(0, Math.ceil((roomData.roundEndTime - now)/1000)) : roomData.settings.roundDuration);
    }, 100);
    return () => clearInterval(t);
  }, [roomData]);

  const updateGame = (data) => updateDoc(doc(db, 'rooms', `room_${roomId}`), data);
  const nextWord = () => {
     let q = [...roomData.wordQueue];
     if(q.length === 0) q = [...DEFAULT_WORDS, ...roomData.customWords].sort(()=>0.5-Math.random());
     const w = q.pop();
     updateGame({ wordQueue: q, currentWord: w, turnEndTime: Date.now() + roomData.settings.answerTime*1000 });
  };
  const switchTeam = () => {
     let nextTeam = roomData.currentTeam === 'A' ? 'B' : 'A';
     let nextRound = roomData.currentRound + (roomData.currentTeam === 'B' ? 1 : 0); 
     if(nextRound > roomData.settings.totalRounds) updateGame({ status: 'finished' });
     else updateGame({ currentTeam: nextTeam, currentRound: nextRound, gameState: 'idle', currentWord: null, roundEndTime: null, turnEndTime: null });
  };

  const isSteal = timeLeft > 0 && timeLeft <= roomData.settings.stealTime;
  const showControls = isHost && !previewAsPlayer;
  const wordDisplay = showControls ? roomData.currentWord : (roomData.currentWord ? roomData.currentWord.replace(/[^\s]/g, '❓') : "準備中");

  return (
    <div className="flex-1 bg-gray-900 text-white flex flex-col relative overflow-hidden">
       <div className="bg-gray-800 p-4 flex justify-between items-center z-10">
          <div className={`text-center ${roomData.currentTeam==='A'?'scale-110 text-red-400':'text-gray-500'}`}>A: {roomData.scores.A}</div>
          <div className="text-center">
             <div className="text-xs text-gray-400">R{roomData.currentRound}/{roomData.settings.totalRounds}</div>
             <div className="text-2xl font-mono">{Math.floor(roundTimeLeft/60)}:{String(roundTimeLeft%60).padStart(2,'0')}</div>
             {isHost && <button onClick={()=>setPreviewAsPlayer(!previewAsPlayer)} className="text-[10px] bg-gray-700 px-2 rounded mt-1">{previewAsPlayer?"退出":"預覽"}</button>}
          </div>
          <div className={`text-center ${roomData.currentTeam==='B'?'scale-110 text-blue-400':'text-gray-500'}`}>B: {roomData.scores.B}</div>
       </div>

       <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 text-center">
          {roomData.gameState === 'idle' ? (
             <>
                <h2 className="text-3xl font-bold mb-4">輪到 {roomData.currentTeam} 隊</h2>
                {showControls ? <button onClick={() => {
                   const now = Date.now();
                   const roundEnd = (roomData.roundEndTime && roomData.roundEndTime > now) ? roomData.roundEndTime : now + roomData.settings.roundDuration * 1000;
                   updateGame({ gameState: 'active', roundEndTime: roundEnd });
                   nextWord();
                }} className="px-8 py-3 bg-white text-black rounded-full font-bold shadow-lg">開始計時</button> : <div className="animate-pulse">等待開始...</div>}
             </>
          ) : (
             <>
                <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center bg-gray-800 text-5xl font-mono font-bold mb-8 ${isSteal?'border-yellow-500 animate-pulse':'border-indigo-500'}`}>{timeLeft}</div>
                <h1 className="text-5xl font-black bg-white text-black p-8 rounded-xl w-full max-w-xl">{wordDisplay}</h1>
                {!showControls && isSteal && <p className="text-red-500 font-bold mt-4 animate-bounce">搶答時間！</p>}
             </>
          )}
       </div>

       {showControls && (
         <div className="bg-gray-800 p-4 border-t border-gray-700 z-20">
            {roomData.gameState === 'active' ? (
               <div className="grid grid-cols-4 gap-3 max-w-2xl mx-auto h-20">
                  <button onClick={() => { updateGame({[`scores.${roomData.currentTeam}`]: increment(roomData.settings.pointsSkip)}); nextWord(); }} className="bg-gray-600 rounded-xl flex flex-col items-center justify-center"><X/><span className="text-xs">跳過</span></button>
                  <button onClick={() => { updateGame({[`scores.${roomData.currentTeam}`]: increment(roomData.settings.pointsCorrect)}); nextWord(); }} className="col-span-2 bg-green-500 rounded-xl flex flex-col items-center justify-center"><Check size={32}/></button>
                  <button onClick={nextWord} className="bg-blue-600 rounded-xl flex flex-col items-center justify-center"><span className="text-sm font-bold">下一題</span></button>
               </div>
            ) : <button onClick={switchTeam} className="w-full bg-yellow-600 py-3 rounded text-white font-bold max-w-2xl mx-auto block">切換隊伍 / 下一輪</button>}
         </div>
       )}
    </div>
  );
}

function ResultView({roomData, isHost, roomId}) {
   const winner = roomData.scores.A > roomData.scores.B ? 'A' : roomData.scores.A < roomData.scores.B ? 'B' : '平手';
   return (
     <div className="flex-1 bg-gray-900 flex items-center justify-center text-white p-4 text-center">
        <div className="space-y-6">
           <Trophy className="w-24 h-24 text-yellow-400 mx-auto animate-bounce"/>
           <h1 className="text-4xl font-bold">遊戲結束</h1>
           <div className="text-3xl">
              獲勝的是：<span className="text-yellow-400 font-black">{winner} 隊</span>
           </div>
           <div className="flex gap-8 justify-center text-2xl font-mono bg-gray-800 p-6 rounded-xl">
              <div className="text-red-400">A: {roomData.scores.A}</div>
              <div className="text-blue-400">B: {roomData.scores.B}</div>
           </div>
           {isHost && <button onClick={() => updateDoc(doc(db, 'rooms', `room_${roomId}`), { status: 'waiting', gameState: 'idle' })} className="px-8 py-3 bg-indigo-600 rounded-full font-bold hover:bg-indigo-500">回到大廳</button>}
        </div>
     </div>
   );
}