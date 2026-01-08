import React, { useState, useEffect, useRef } from 'react';
import { 
  doc, setDoc, getDoc, onSnapshot, updateDoc, 
  increment, runTransaction, serverTimestamp, 
  addDoc, collection, deleteDoc, getDocs, query, orderBy, limit, where 
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { 
  Users, Play, Settings, Plus, Check, X, 
  Shuffle, ClipboardCopy, Trophy, 
  ArrowLeft, LogOut, Trash2, Crown,
  Eye, EyeOff, Pause, RotateCcw, Timer, Zap, Edit,
  Cloud, Download, FileText, Library
} from 'lucide-react';

// 引入共用 Firebase
import { db, auth } from './firebase';
// 引入外部題庫
import { DEFAULT_WORDS_LARGE } from './words';

const DEFAULT_SETTINGS = {
  answerTime: 30, stealTime: 10, roundDuration: 600, totalRounds: 2, 
  pointsCorrect: 3, pointsSkip: -1, 
  teams: [
    { id: 'team_a', name: 'A 隊', color: '#ef4444' }, // Red
    { id: 'team_b', name: 'B 隊', color: '#3b82f6' }  // Blue
  ],
  startTeamIndex: 0,
  permissions: {
    allowPlayerTeamSwitch: false, 
    allowPlayerAddWords: false   
  }
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateId = () => Math.random().toString(36).substring(2, 10);

export default function CharadesGame({ onBack, getNow }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [view, setView] = useState('lobby');
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [previewAsPlayer, setPreviewAsPlayer] = useState(false);

  // 遊戲標題設定
  useEffect(() => {
    document.title = "比手畫腳大亂鬥 | Party Game";
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
          setUser(u);
          if (!u.isAnonymous) {
              try {
                  const adminDoc = await getDoc(doc(db, 'admins', u.uid));
                  setIsAdmin(adminDoc.exists());
              } catch (e) { setIsAdmin(false); }
          }
      } else {
          signInAnonymously(auth).catch(console.error);
      }
    });
    return () => unsubscribe();
  }, []);

  // 房間同步
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

  // ★★★ 檢查並離開舊房間 ★★★
  const checkAndLeaveOldRoom = async (uid, newRoomId) => {
    try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const oldRoomId = userSnap.data().currentRoomId;
            if (oldRoomId && oldRoomId !== newRoomId) {
                const oldRoomRef = doc(db, 'rooms', `room_${oldRoomId}`);
                await runTransaction(db, async (transaction) => {
                    const oldRoomDoc = await transaction.get(oldRoomRef);
                    if (!oldRoomDoc.exists()) return;

                    const data = oldRoomDoc.data();
                    const newPlayers = data.players.filter(p => p.id !== uid);

                    if (newPlayers.length === 0) {
                        transaction.delete(oldRoomRef); 
                    } else {
                        const updates = { players: newPlayers };
                        if (data.hostId === uid) {
                            updates.hostId = newPlayers[0].id;
                        }
                        transaction.update(oldRoomRef, updates);
                    }
                });
            }
        }
        await setDoc(userRef, { currentRoomId: newRoomId }, { merge: true });
    } catch (e) {
        console.error("Cleanup old room failed:", e);
    }
  };

  const clearUserRoomRecord = async (uid) => {
      try {
          await updateDoc(doc(db, 'users', uid), { currentRoomId: null });
      } catch (e) { console.error(e); }
  };

  const createRoom = async () => {
    if (!playerName.trim()) return alert("請輸入名字");
    setLoading(true);
    try {
      const newRoomId = generateRoomId();
      await checkAndLeaveOldRoom(user.uid, newRoomId);

      const me = { id: user.uid, name: playerName, team: null, isHost: true };
      
      let savedDecks = [];
      try {
          const saved = localStorage.getItem('charades_custom_decks');
          if (saved) savedDecks = JSON.parse(saved);
      } catch (e) { console.error("Load local decks failed", e); }

      await setDoc(doc(db, 'rooms', `room_${newRoomId}`), {
        id: newRoomId, hostId: user.uid, status: 'waiting',
        players: [me],
        settings: DEFAULT_SETTINGS, 
        scores: {}, 
        currentRound: 1, 
        currentTeamId: DEFAULT_SETTINGS.teams[0].id, 
        wordQueue: [], 
        useDefaultCategory: true,
        customCategories: savedDecks, 
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
      await checkAndLeaveOldRoom(user.uid, rId);

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
      await clearUserRoomRecord(user.uid);

      if (newPlayers.length === 0) {
         await deleteDoc(ref);
      } else {
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
                <span className="font-bold text-slate-700">
                    {user.isAnonymous ? (playerName + " (訪客)") : (user.displayName || playerName)}
                    {isAdmin && <span className="ml-1 text-[10px] bg-yellow-400 text-black px-1 rounded font-bold">Admin</span>}
                </span>
             </div>
             {isHost && view === 'room' && <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-sm font-medium transition"><Settings size={16} /> 設定</button>}
          </div>
       </header>

       <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
          {view === 'room' && <RoomView roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user} isAdmin={isAdmin}
            onStart={async () => {
             let finalWords = [];
             if (roomData.useDefaultCategory !== false) finalWords = [...finalWords, ...DEFAULT_WORDS_LARGE];
             if (roomData.customCategories) roomData.customCategories.forEach(c => { if(c.enabled) finalWords.push(...c.words) });
             if (roomData.customWords) finalWords = [...finalWords, ...roomData.customWords];

             if (finalWords.length === 0) {
                 alert("目前沒有任何題目！請先啟用內建題庫或新增自訂題目。");
                 return;
             }

             const shuffled = finalWords.sort(() => 0.5 - Math.random());
             const initialScores = {};
             roomData.settings.teams.forEach(t => initialScores[t.id] = 0);

             await updateDoc(doc(db, 'rooms', `room_${roomId}`), {
               status: 'playing', wordQueue: shuffled, scores: initialScores,
               currentRound: 1, currentTeamId: roomData.settings.teams[roomData.settings.startTeamIndex || 0].id, 
               gameState: 'idle', currentWord: null, roundEndTime: null, turnEndTime: null
             });
          }} />}
          {view === 'game' && <GameInterface roomData={roomData} isHost={isHost} roomId={roomId} previewAsPlayer={previewAsPlayer} setPreviewAsPlayer={setPreviewAsPlayer} getNow={getNow} />}
          {view === 'result' && <ResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
       </main>

       {showSettings && <SettingsModal localSettings={localSettings} setLocalSettings={setLocalSettings} setShowSettings={setShowSettings} onSave={async () => { await updateDoc(doc(db, 'rooms', `room_${roomId}`), { settings: localSettings }); setShowSettings(false); }} />}
    </div>
  );
}

// --- Internal Components for CharadesGame ---

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

function RoomView({roomData, isHost, roomId, onStart, currentUser, isAdmin}) {
  const [editingCategory, setEditingCategory] = useState(null); 
  const [newCatName, setNewCatName] = useState("");
  const [newWordInput, setNewWordInput] = useState("");
  const [editingTeamName, setEditingTeamName] = useState(null);
  const [importCode, setImportCode] = useState(""); 
  const [showCloudLibrary, setShowCloudLibrary] = useState(false); 
  const [draggedPlayer, setDraggedPlayer] = useState(null);

  const players = roomData.players || [];
  const participants = players.filter(p => p.id !== roomData.hostId);
  const unassigned = participants.filter(p => !p.team); 
  const hostPlayer = players.find(p => p.id === roomData.hostId);
  const teams = roomData.settings.teams || [];
  const customCategories = roomData.customCategories || [];
  
  const canAddWords = isHost || roomData.settings.permissions.allowPlayerAddWords;

  const randomize = async () => {
    const shuffled = [...participants].sort(() => 0.5 - Math.random());
    const teamIds = teams.map(t => t.id);
    const newParticipants = shuffled.map((p, i) => ({ ...p, team: teamIds[i % teamIds.length] }));
    const newPlayersList = hostPlayer ? [...newParticipants, { ...hostPlayer, team: null }] : newParticipants;
    await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: newPlayersList });
  };

  const changePlayerTeam = async (playerId, newTeamId) => {
      const newPlayers = players.map(p => p.id === playerId ? { ...p, team: newTeamId } : p);
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { players: newPlayers });
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

  const updateTeamName = async (teamId, newName) => {
      const newTeams = teams.map(t => t.id === teamId ? { ...t, name: newName } : t);
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { 'settings.teams': newTeams });
      setEditingTeamName(null);
  };

  const handleDragStart = (e, player) => {
      if (!isHost) return;
      setDraggedPlayer(player);
      e.dataTransfer.setData("text/plain", player.id);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
      if (!isHost) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e, teamId) => {
      if (!isHost) return;
      e.preventDefault();
      const playerId = e.dataTransfer.getData("text/plain");
      if (playerId) {
          await changePlayerTeam(playerId, teamId);
      }
      setDraggedPlayer(null);
  };

  const toggleDefault = async () => {
      if (!isHost) return;
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { useDefaultCategory: !roomData.useDefaultCategory });
  };

  const addCategory = async () => {
      if (!newCatName.trim()) return;
      const newCat = { id: generateId(), name: newCatName.trim(), words: [], enabled: true };
      const updatedCats = [...customCategories, newCat];
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
      setNewCatName("");
  };

  const toggleCategory = async (catId) => {
      if (!isHost) return;
      const updatedCats = customCategories.map(c => c.id === catId ? { ...c, enabled: !c.enabled } : c);
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
  };

  const openEditCategory = (cat) => {
      if (!isHost && !canAddWords) return alert("主持人未開放新增題目");
      if (!isHost && !cat.enabled) return alert("只能新增題目到目前已啟用的題庫中");
      setEditingCategory(cat);
  };

  const addWordToCategory = async () => {
      if (!newWordInput.trim() || !editingCategory) return;
      const updatedCats = customCategories.map(c => {
          if (c.id === editingCategory.id) {
              return { ...c, words: [...c.words, newWordInput.trim()] };
          }
          return c;
      });
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
      const newCat = updatedCats.find(c => c.id === editingCategory.id);
      setEditingCategory(newCat);
      setNewWordInput("");
  };

  const removeWordFromCategory = async (word) => {
      if (!editingCategory) return;
      const updatedCats = customCategories.map(c => {
          if (c.id === editingCategory.id) {
              return { ...c, words: c.words.filter(w => w !== word) };
          }
          return c;
      });
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
      const newCat = updatedCats.find(c => c.id === editingCategory.id);
      setEditingCategory(newCat);
  };

  const deleteCategory = async () => {
      if (!isHost) return alert("只有主持人可以刪除題庫");
      if (!window.confirm("確定刪除此題庫？")) return;
      const updatedCats = customCategories.filter(c => c.id !== editingCategory.id);
      await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
      setEditingCategory(null);
  };

  const saveDeckToCloud = async () => {
      if (!editingCategory) return;
      if (!isAdmin) return alert("權限不足：您必須是管理員才能上傳題庫到雲端！");
      
      try {
          const q = query(collection(db, 'public_decks'), where("name", "==", editingCategory.name));
          const snapshot = await getDocs(q);
          
          let docRef;
          if (!snapshot.empty) {
              const confirmOverwrite = window.confirm(`雲端已存在同名題庫「${editingCategory.name}」，確定要覆蓋嗎？`);
              if (!confirmOverwrite) return;
              
              const existingDoc = snapshot.docs[0];
              await updateDoc(doc(db, 'public_decks', existingDoc.id), {
                  words: editingCategory.words,
                  updatedAt: serverTimestamp(),
                  creatorId: currentUser.uid 
              });
              docRef = existingDoc;
              alert(`題庫「${editingCategory.name}」已更新！代碼：\n${docRef.id}`);
          } else {
              docRef = await addDoc(collection(db, 'public_decks'), {
                  name: editingCategory.name,
                  words: editingCategory.words,
                  createdAt: serverTimestamp(),
                  creatorId: currentUser.uid,
                  creatorEmail: currentUser.email 
              });
              alert(`題庫已上傳！代碼：\n${docRef.id}`);
          }
      } catch (e) {
          alert("上傳失敗：" + e.message);
      }
  };

  const importDeckFromCloud = async (code = null) => {
      const targetCode = code || importCode;
      if (!targetCode.trim()) return;
      try {
          const deckDoc = await getDoc(doc(db, 'public_decks', targetCode.trim()));
          if (deckDoc.exists()) {
              const deck = deckDoc.data();
              const newCat = { id: generateId(), name: deck.name, words: deck.words || [], enabled: true };
              await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: [...customCategories, newCat] });
              alert(`成功匯入：${deck.name} (${deck.words?.length} 題)`);
              setImportCode("");
              setShowCloudLibrary(false);
          } else {
              alert("找不到此代碼的題庫");
          }
      } catch (e) {
          alert("匯入失敗：" + e.message);
      }
  };

  const handleCSVUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const text = evt.target.result;
          const words = text.split(/[,\n\r]+/).map(w => w.trim()).filter(w => w.length > 0);
          if (words.length === 0) return alert("檔案內沒有內容");
          
          if (!editingCategory) return;
          const updatedCats = customCategories.map(c => {
              if (c.id === editingCategory.id) {
                  const uniqueWords = [...new Set([...c.words, ...words])];
                  return { ...c, words: uniqueWords };
              }
              return c;
          });
          await updateDoc(doc(db, 'rooms', `room_${roomId}`), { customCategories: updatedCats });
          const newCat = updatedCats.find(c => c.id === editingCategory.id);
          setEditingCategory(newCat);
          alert(`已匯入 ${words.length} 個題目`);
      };
      reader.readAsText(file);
  };

  const PlayerItem = ({ p, showKick, showPromote }) => {
      const [showMoveMenu, setShowMoveMenu] = useState(false);
      return (
        <div 
            className={`relative flex items-center justify-between bg-white/60 p-2 rounded-lg mb-1 border border-slate-200 ${isHost ? 'cursor-grab active:cursor-grabbing hover:bg-white/80' : ''}`}
            draggable={isHost}
            onDragStart={(e) => handleDragStart(e, p)}
            onClick={() => isHost && setShowMoveMenu(!showMoveMenu)}
        >
            <div className="flex items-center gap-2 pointer-events-none">
                <span className="text-slate-700 font-medium">{p.name}</span>
                {p.id === roomData.hostId && <Crown size={14} className="text-yellow-500 fill-yellow-500"/>}
                {p.id === currentUser.uid && <span className="text-xs bg-slate-200 text-slate-600 px-1 rounded">我</span>}
            </div>
            <div className="flex gap-1">
                {showPromote && <button onClick={(e) => {e.stopPropagation(); makeHost(p.id)}} className="text-slate-400 hover:text-yellow-500 p-1"><Crown size={14}/></button>}
                {showKick && <button onClick={(e) => {e.stopPropagation(); kickPlayer(p.id)}} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={14}/></button>}
            </div>
            {showMoveMenu && isHost && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-lg z-50 p-2 min-w-[150px]">
                    <div className="text-xs font-bold text-slate-400 mb-1 px-2">移動至...</div>
                    <button onClick={() => changePlayerTeam(p.id, null)} className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded text-sm text-slate-700">等待區</button>
                    {teams.map(t => (
                        <button key={t.id} onClick={() => changePlayerTeam(p.id, t.id)} className="w-full text-left px-2 py-1.5 hover:bg-slate-100 rounded text-sm text-slate-700">
                            {t.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
      );
  };

  return (
    <div className="p-4 md:p-8 w-full space-y-6">
      {/* 雲端圖書館 Modal */}
      {showCloudLibrary && (
          <CloudLibraryModal 
            onClose={() => setShowCloudLibrary(false)} 
            onImport={importDeckFromCloud} 
            db={db}
            currentUser={currentUser}
            isAdmin={isAdmin}
          />
      )}

      {/* 題庫編輯 Modal */}
      {editingCategory && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in zoom-in duration-200">
                  <div className="flex justify-between items-center border-b pb-2">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                          <Edit size={18} className="text-indigo-500"/>
                          {editingCategory.name} 
                          <span className="text-xs text-slate-400 font-normal">({editingCategory.words.length}題)</span>
                      </h3>
                      <button onClick={() => setEditingCategory(null)}><X className="text-slate-400 hover:text-slate-600"/></button>
                  </div>
                  
                  {/* 新增題目輸入 (所有人可見，若有權限) */}
                  <div className="flex gap-2">
                      <input value={newWordInput} onChange={e=>setNewWordInput(e.target.value)} className="flex-1 border p-2 rounded-lg text-sm" placeholder="輸入新題目..." onKeyDown={e => e.key === 'Enter' && addWordToCategory()}/>
                      <button onClick={addWordToCategory} className="bg-indigo-600 text-white px-3 rounded-lg"><Plus/></button>
                  </div>
                  
                  {/* ★★★ 工具列 (僅主持人可見) ★★★ */}
                  {isHost && (
                    <div className="flex gap-2 text-xs overflow-x-auto pb-2">
                        <label className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg cursor-pointer whitespace-nowrap">
                            <FileText size={14}/> 匯入 CSV
                            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVUpload}/>
                        </label>
                        {/* ★★★ 只有管理員看得到上傳按鈕 ★★★ */}
                        {isAdmin && (
                            <button onClick={saveDeckToCloud} className="flex items-center gap-1 bg-sky-100 hover:bg-sky-200 text-sky-700 px-3 py-2 rounded-lg whitespace-nowrap">
                                <Cloud size={14}/> 上傳雲端 (管理員)
                            </button>
                        )}
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto border rounded-lg p-2 bg-slate-50 space-y-1">
                      {editingCategory.words.map((w, i) => (
                          <div key={i} className="flex justify-between items-center bg-white p-2 rounded shadow-sm group">
                              <span>{w}</span>
                              {/* ★★★ 僅主持人可刪除單字 ★★★ */}
                              {isHost && (
                                <button onClick={() => removeWordFromCategory(w)} className="text-slate-300 hover:text-red-500"><X size={14}/></button>
                              )}
                          </div>
                      ))}
                      {editingCategory.words.length === 0 && <div className="text-center text-slate-400 py-4">還沒有題目，快新增吧！</div>}
                  </div>
                  <div className="pt-2 border-t flex justify-between">
                      {/* ★★★ 僅主持人可刪除分類 ★★★ */}
                      {isHost ? <button onClick={deleteCategory} className="text-red-500 text-sm flex items-center gap-1"><Trash2 size={14}/> 刪除</button> : <div></div>}
                      <button onClick={() => setEditingCategory(null)} className="bg-slate-800 text-white px-6 py-2 rounded-lg text-sm font-bold">完成</button>
                  </div>
              </div>
          </div>
      )}

      {/* Grid 佈局內容 (隊伍、題庫) 與之前相同，略微省略以節省篇幅 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 左側：隊伍管理 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><Users className="text-indigo-500"/> 參賽玩家 ({participants.length})</h2>
                {isHost && <button onClick={randomize} className="text-sm bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full hover:bg-indigo-100 font-bold transition flex items-center gap-1"><Shuffle size={14}/> 隨機分組</button>}
            </div>
            
            <div className="bg-yellow-50 p-3 rounded-xl border border-yellow-200">
                <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wider mb-2">目前主持人</h4>
                {hostPlayer ? <PlayerItem p={hostPlayer} showKick={false} showPromote={false} /> : <div className="text-gray-400 text-sm">無主持人</div>}
            </div>

            {/* 未分組區 */}
            <div 
                className={`bg-slate-50 p-3 rounded-xl border border-dashed transition-all ${unassigned.length>0 ? 'border-orange-300 bg-orange-50' : 'border-slate-200'}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, null)}
            >
                <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">等待分組 ({unassigned.length})</h4>
                    {isHost && <span className="text-[10px] text-slate-400">可拖曳玩家換隊</span>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {unassigned.map(p => <PlayerItem key={p.id} p={p} showKick={isHost && p.id !== currentUser.uid} showPromote={isHost} />)}
                </div>
            </div>

            {/* 隊伍列表 */}
            <div className="grid grid-cols-1 gap-4">
                {teams.map((team) => {
                    const teamPlayers = participants.filter(p => p.team === team.id);
                    
                    return (
                        <div 
                            key={team.id} 
                            className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-colors"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, team.id)}
                        >
                            <div className="flex justify-between items-center mb-3">
                                {isHost && editingTeamName?.id === team.id ? (
                                    <input 
                                        autoFocus
                                        className="font-bold text-lg border-b border-indigo-500 outline-none bg-transparent w-full"
                                        value={editingTeamName.name}
                                        onChange={e => setEditingTeamName({...editingTeamName, name: e.target.value})}
                                        onBlur={() => updateTeamName(team.id, editingTeamName.name)}
                                        onKeyDown={e => e.key === 'Enter' && updateTeamName(team.id, editingTeamName.name)}
                                    />
                                ) : (
                                    <h3 
                                        className={`font-bold text-lg flex items-center gap-2 ${isHost ? 'cursor-pointer hover:text-indigo-600' : ''}`}
                                        onClick={() => isHost && setEditingTeamName(team)}
                                        title={isHost ? "點擊修改隊名" : ""}
                                    >
                                        <div className="w-3 h-3 rounded-full" style={{backgroundColor: team.color || 'gray'}}></div> 
                                        {team.name}
                                    </h3>
                                )}
                            </div>
                            <div className="space-y-1 min-h-[40px]">
                                {teamPlayers.map(p => <PlayerItem key={p.id} p={p} showKick={isHost && p.id !== currentUser.uid} showPromote={isHost} />)}
                                {teamPlayers.length === 0 && <span className="text-slate-300 text-sm italic p-1 block border border-dashed rounded text-center">拖曳玩家至此</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* 右側：題庫與設定 */}
        <div className="space-y-6">
             <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-lg font-bold mb-4 text-slate-800 flex justify-between items-center">
                    題庫設定
                    {!isHost && <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">僅主持人可選</span>}
                </h2>
                
                {/* 1. 內建題庫 Toggle */}
                <div 
                    onClick={toggleDefault}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all mb-3 ${isHost ? 'cursor-pointer' : 'opacity-70'} ${roomData.useDefaultCategory !== false ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${roomData.useDefaultCategory !== false ? 'bg-indigo-500 border-indigo-500' : 'border-slate-400'}`}>
                            {roomData.useDefaultCategory !== false && <Check size={14} className="text-white"/>}
                        </div>
                        <div>
                            <div className="font-bold text-slate-700">內建題庫 (1000+)</div>
                            <div className="text-xs text-slate-500">食物、地標、動物、日常...</div>
                        </div>
                    </div>
                </div>

                {/* 2. 自訂題庫列表 */}
                {customCategories.map(cat => (
                    <div key={cat.id} className="flex items-center gap-2 mb-2">
                        <div 
                            onClick={() => toggleCategory(cat.id)}
                            className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${isHost ? 'cursor-pointer' : 'opacity-70'} ${cat.enabled ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${cat.enabled ? 'bg-indigo-500 border-indigo-500' : 'border-slate-400'}`}>
                                    {cat.enabled && <Check size={14} className="text-white"/>}
                                </div>
                                <div className="font-bold text-slate-700">{cat.name} <span className="text-slate-400 font-normal text-xs">({cat.words.length}題)</span></div>
                            </div>
                        </div>
                        {/* ★★★ 修改：若有權限(僅限主持人勾選的題庫)或為主持人，才顯示編輯按鈕 ★★★ */}
                        {(isHost || (canAddWords && cat.enabled)) && (
                            <button onClick={() => openEditCategory(cat)} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600" title="編輯題目">
                                <Edit size={18}/>
                            </button>
                        )}
                    </div>
                ))}

                {/* 3. 新增與匯入 (僅主持人) */}
                {isHost && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-slate-100">
                        <div className="flex gap-2">
                            <input value={newCatName} onChange={e=>setNewCatName(e.target.value)} className="border border-slate-200 p-2 rounded-xl flex-1 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="新增題庫分類..." />
                            <button onClick={addCategory} className="bg-slate-800 hover:bg-slate-700 text-white px-3 rounded-xl text-sm font-bold flex items-center gap-1"><Plus size={16}/> 新增</button>
                        </div>
                        
                        <div className="flex gap-2">
                            <input value={importCode} onChange={e=>setImportCode(e.target.value)} className="border border-slate-200 p-2 rounded-xl flex-1 focus:ring-2 focus:ring-sky-500 outline-none text-sm" placeholder="輸入雲端題庫代碼..." />
                            <button onClick={() => importDeckFromCloud()} className="bg-sky-600 hover:bg-sky-700 text-white px-3 rounded-xl text-sm font-bold flex items-center gap-1"><Download size={16}/> 下載</button>
                        </div>

                        <button onClick={() => setShowCloudLibrary(true)} className="w-full mt-2 bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition">
                            <Library size={18}/> 瀏覽雲端題庫圖書館
                        </button>
                    </div>
                )}
            </div>

            {isHost ? (
                <button onClick={onStart} className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold rounded-2xl shadow-lg shadow-green-200 transform hover:scale-[1.02] transition-all flex justify-center items-center gap-2"><Play className="fill-white" /> 開始遊戲</button>
            ) : <div className="text-center p-8 bg-slate-50 border border-slate-200 rounded-2xl"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div><h3 className="font-bold text-slate-700 text-lg">等待主持人開始...</h3></div>}
        </div>
      </div>
    </div>
  );
}

// ★★★ 雲端題庫圖書館 (New) ★★★
function CloudLibraryModal({ onClose, onImport, db, currentUser, isAdmin }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDecks = async () => {
            try {
                // 讀取所有公開題庫 (實際應用可能需要分頁)
                const q = query(collection(db, 'public_decks'), orderBy('createdAt', 'desc'), limit(20));
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setDecks(list);
            } catch (e) {
                console.error("Fetch decks error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDecks();
    }, [db]);

    const deleteDeck = async (deckId) => {
        // ★★★ 權限檢查：只有管理員能刪除 ★★★
        if (!isAdmin) return alert("權限不足：只有指定管理員可以刪除雲端題庫！");
        if (!window.confirm("確定要從雲端永久刪除此題庫嗎？")) return;
        try {
            await deleteDoc(doc(db, 'public_decks', deckId));
            setDecks(decks.filter(d => d.id !== deckId));
        } catch (e) {
            alert("刪除失敗");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in duration-200">
                <div className="flex justify-between items-center border-b pb-4 mb-4">
                    <h3 className="font-bold text-2xl flex items-center gap-2 text-slate-800">
                        <Cloud className="text-sky-500"/> 雲端題庫圖書館
                    </h3>
                    <button onClick={onClose}><X className="text-slate-400 hover:text-slate-600"/></button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-400">載入中...</div>
                    ) : decks.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">目前沒有公開題庫</div>
                    ) : (
                        decks.map(deck => (
                            <div key={deck.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex justify-between items-center hover:shadow-md transition">
                                <div>
                                    <h4 className="font-bold text-lg text-slate-800">{deck.name}</h4>
                                    <div className="text-sm text-slate-500 flex gap-3">
                                        <span>題目數: {deck.words?.length || 0}</span>
                                        <span className="font-mono bg-slate-200 px-1 rounded text-xs">ID: {deck.id}</span>
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">上傳者: {deck.creatorEmail || "未知"}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => onImport(deck.id)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1"
                                    >
                                        <Download size={16}/> 下載
                                    </button>
                                    
                                    {/* ★★★ 只有管理員看得到刪除按鈕 ★★★ */}
                                    {isAdmin && (
                                        <button 
                                            onClick={() => deleteDeck(deck.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                            title="刪除 (管理員專用)"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
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
  const lastEventRef = useRef(0);

  // 取得目前隊伍資訊
  const currentTeam = roomData.settings.teams.find(t => t.id === roomData.currentTeamId) || roomData.settings.teams[0];
  const teams = roomData.settings.teams;

  useEffect(() => {
    if (roomData.lastEvent && roomData.lastEvent.timestamp !== lastEventRef.current) {
      const isStale = Date.now() - roomData.lastEvent.timestamp > 3000;
      lastEventRef.current = roomData.lastEvent.timestamp;
      
      if (!isStale) {
        setNotification(roomData.lastEvent);
        const timer = setTimeout(() => setNotification(null), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [roomData.lastEvent]);

  useEffect(() => {
    const t = setInterval(() => {
      const now = getNow();
      
      if (roomData.gameState === 'paused' && roomData.savedState) {
        setTimeLeft(Math.max(0, Math.ceil(roomData.savedState.remainingTurn / 1000)));
      } else if (roomData.turnEndTime) {
        const remaining = Math.max(0, Math.ceil((roomData.turnEndTime - now)/1000));
        setTimeLeft(remaining);
      } else {
        setTimeLeft(roomData.settings.answerTime);
      }

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
  }, [roomData, getNow]);

  const updateGame = (data) => updateDoc(doc(db, 'rooms', `room_${roomId}`), data);
  const triggerEvent = (text, color, extraData = {}) => {
    updateGame({
      ...extraData,
      lastEvent: { text, color, timestamp: Date.now() }
    });
  };

  const nextWord = (isSkip = false) => {
     let q = [...roomData.wordQueue];
     if(q.length === 0) {
         let finalWords = [];
         if (roomData.useDefaultCategory !== false) finalWords = [...finalWords, ...DEFAULT_WORDS_LARGE];
         if (roomData.customCategories) roomData.customCategories.forEach(c => { if(c.enabled) finalWords.push(...c.words) });
         if (roomData.customWords) finalWords = [...finalWords, ...roomData.customWords];
         q = finalWords.sort(()=>0.5-Math.random());
     }
     
     const w = q.pop();
     const now = getNow();
     const newTurnEnd = now + roomData.settings.answerTime*1000;
     
     if (isSkip) {
        triggerEvent("跳過！扣分", "text-red-500", { 
            wordQueue: q, currentWord: w, turnEndTime: newTurnEnd,
            [`scores.${currentTeam.id}`]: increment(roomData.settings.pointsSkip)
        });
     } else {
        updateGame({ wordQueue: q, currentWord: w, turnEndTime: newTurnEnd });
     }
  };

  const handleCorrect = () => {
      let q = [...roomData.wordQueue];
      if(q.length === 0) { /* refill logic */ }
      const w = q.pop();
      const now = getNow();
      const newTurnEnd = now + roomData.settings.answerTime*1000;

      triggerEvent(`${currentTeam.name} 得分！`, "text-green-500", {
          wordQueue: q, currentWord: w, turnEndTime: newTurnEnd,
          [`scores.${currentTeam.id}`]: increment(roomData.settings.pointsCorrect)
      });
  };

  const handleSteal = (stealingTeamId, stealingTeamName) => {
      let q = [...roomData.wordQueue];
      const w = q.pop();
      const now = getNow();
      const newTurnEnd = now + roomData.settings.answerTime*1000;

      triggerEvent(`⚡ ${stealingTeamName} 搶答成功！`, "text-purple-500", {
          wordQueue: q, currentWord: w, turnEndTime: newTurnEnd,
          [`scores.${stealingTeamId}`]: increment(roomData.settings.pointsCorrect) 
      });
  };

  const pauseGame = () => {
      const now = getNow();
      const remainingTurn = roomData.turnEndTime ? roomData.turnEndTime - now : 0;
      const remainingRound = roomData.roundEndTime ? roomData.roundEndTime - now : 0;
      updateGame({ gameState: 'paused', savedState: { remainingTurn, remainingRound } });
  };

  const resumeGame = () => {
      const now = getNow();
      const newTurnEnd = now + (roomData.savedState?.remainingTurn || 0);
      const newRoundEnd = now + (roomData.savedState?.remainingRound || 0);
      updateGame({ gameState: 'active', turnEndTime: newTurnEnd, roundEndTime: newRoundEnd, savedState: null });
  };

  const resetRound = () => {
      if(!window.confirm("確定要重置本回合嗎？")) return;
      updateGame({ gameState: 'idle', roundEndTime: null, turnEndTime: null, currentWord: null });
  };

  const switchTeam = () => {
     const currentIdx = teams.findIndex(t => t.id === currentTeam.id);
     const nextIdx = (currentIdx + 1) % teams.length;
     const nextTeam = teams[nextIdx];
     
     const nextRound = nextIdx === 0 ? roomData.currentRound + 1 : roomData.currentRound;
     
     if(nextRound > roomData.settings.totalRounds) updateGame({ status: 'finished' });
     else updateGame({ currentTeamId: nextTeam.id, currentRound: nextRound, gameState: 'idle', currentWord: null, roundEndTime: null, turnEndTime: null });
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
       {notification && (
           <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
               <div className={`text-4xl md:text-6xl font-black bg-white/90 px-8 py-4 rounded-3xl shadow-2xl backdrop-blur-md animate-bounce ${notification.color}`}>
                   {notification.text}
               </div>
           </div>
       )}

       {roomData.gameState === 'paused' && (
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex flex-col items-center justify-center">
               <Pause size={64} className="text-white mb-4 animate-pulse"/>
               <h2 className="text-3xl font-bold text-white">遊戲暫停中</h2>
               {showControls && <button onClick={resumeGame} className="mt-6 px-8 py-3 bg-green-500 hover:bg-green-600 rounded-full text-xl font-bold">繼續遊戲</button>}
           </div>
       )}

       {/* 頂部記分板 */}
       <div className="bg-slate-800 p-4 shadow-md z-10 overflow-x-auto">
          <div className="flex justify-center items-center gap-4 min-w-max mx-auto">
              {teams.map(team => (
                  <div key={team.id} className={`flex flex-col items-center p-2 rounded-xl border min-w-[80px] transition-all duration-300 ${currentTeam.id===team.id ? 'scale-110 border-yellow-400 bg-slate-700' : 'border-slate-600 opacity-60'}`}>
                      <span className="font-bold text-xs uppercase tracking-wider" style={{color: team.color || 'white'}}>{team.name}</span>
                      <span className="text-3xl font-black text-white">{roomData.scores[team.id] || 0}</span>
                  </div>
              ))}
              
              <div className="flex flex-col items-center ml-4 border-l border-slate-600 pl-4">
                 <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">R {roomData.currentRound}/{roomData.settings.totalRounds}</div>
                 <div className={`text-2xl font-mono font-bold px-2 py-1 rounded bg-black/40 ${roundTimeLeft < 60 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                    {isRoundOver ? "00:00" : `${Math.floor(roundTimeLeft/60)}:${String(roundTimeLeft%60).padStart(2,'0')}`}
                 </div>
              </div>
          </div>
       </div>

       {/* 主遊戲區 */}
       <div className="flex-1 flex flex-col items-center justify-center p-6 z-10 text-center relative">
          <div className={`absolute inset-0 bg-gradient-to-b from-indigo-900/20 to-slate-900 pointer-events-none`}></div>

          {isRoundOver ? (
              <div className="z-10 animate-in zoom-in duration-300 bg-slate-800/80 p-8 rounded-3xl border border-slate-600 backdrop-blur-md">
                  <Timer size={64} className="text-red-400 mx-auto mb-4"/>
                  <h2 className="text-4xl font-bold mb-2 text-white">時間到！</h2>
                  <p className="text-slate-400 mb-6">本回合結束，請準備交換隊伍。</p>
                  {showControls ? (
                      <button onClick={switchTeam} className="px-10 py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-full font-bold text-xl shadow-lg transition-transform hover:scale-105">換下一隊</button>
                  ) : <div className="text-amber-400 font-bold animate-pulse">等待主持人切換...</div>}
              </div>
          ) : roomData.gameState === 'idle' ? (
             <div className="z-10 animate-in zoom-in duration-300">
                <h2 className="text-4xl font-bold mb-6 drop-shadow-lg">輪到 <span className="text-yellow-400 text-5xl block mt-2">{currentTeam.name}</span></h2>
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
                    <div className={`w-32 h-32 rounded-full border-8 flex items-center justify-center bg-slate-800 text-5xl font-mono font-bold shadow-2xl ${isSteal?'border-yellow-500 animate-pulse text-yellow-500':'border-slate-600 text-white'}`}>{timeLeft}</div>
                    {isSteal && <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-3 py-1 text-xs font-bold rounded-full animate-bounce whitespace-nowrap shadow-lg border-2 border-slate-900">搶答時間!</div>}
                </div>
                <div className="bg-white text-slate-900 p-10 rounded-3xl shadow-2xl min-h-[240px] flex flex-col justify-center items-center border-4 border-slate-200 transform transition-all">
                   <h1 className="text-5xl md:text-7xl font-black break-all leading-tight">{wordDisplay}</h1>
                   {!showControls && isSteal && <p className="text-red-500 font-bold mt-6 text-xl animate-bounce">⚠️ 開放搶答！</p>}
                   {showControls && <p className="text-slate-400 mt-4 text-sm font-bold">({roomData.currentWord?.length || 0} 個字)</p>}
                </div>
             </div>
          )}
       </div>

       {showControls && (
         <div className="bg-slate-800 p-4 border-t border-slate-700 z-20 pb-8 md:pb-4">
            {isRoundOver ? (
                <div className="flex justify-center gap-4">
                    <button onClick={resetRound} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-bold">重置本回合</button>
                    <button onClick={switchTeam} className="px-8 py-3 bg-amber-500 hover:bg-amber-600 rounded-xl text-slate-900 font-bold shadow-lg">切換下一隊</button>
                </div>
            ) : roomData.gameState === 'active' || roomData.gameState === 'paused' ? (
               <div className="flex flex-col gap-3 max-w-4xl mx-auto">
                   
                   {/* 搶答區：顯示所有非當前隊伍 */}
                   {isSteal && (
                       <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
                           {teams.filter(t => t.id !== currentTeam.id).map(t => (
                               <button 
                                key={t.id} 
                                onClick={() => handleSteal(t.id, t.name)}
                                className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg animate-pulse whitespace-nowrap"
                               >
                                   ⚡ {t.name} 搶答
                               </button>
                           ))}
                       </div>
                   )}

                   <div className="grid grid-cols-6 gap-2 h-16">
                      <button onClick={() => nextWord(true)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-2xl flex flex-col items-center justify-center transition active:scale-95 group">
                          <X className="group-hover:text-white transition-colors"/><span className="text-[10px] mt-1 font-bold">跳過</span>
                      </button>
                      
                      <button onClick={handleCorrect} className="col-span-2 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg transform transition active:scale-95">
                          <Check size={32} strokeWidth={3} /> <span className="text-sm font-bold mt-1">{currentTeam.name} 答對</span>
                      </button>
                      
                      <button onClick={() => nextWord(false)} className="bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex flex-col items-center justify-center transition active:scale-95">
                          <span className="text-sm font-bold">下一題</span><span className="text-[10px] opacity-70">(無分)</span>
                      </button>

                      <div className="flex flex-col gap-1">
                          {roomData.gameState === 'paused' ? (
                              <button onClick={resumeGame} className="flex-1 bg-green-500 rounded-lg flex items-center justify-center"><Play size={20}/></button>
                          ) : (
                              <button onClick={pauseGame} className="flex-1 bg-yellow-600 rounded-lg flex items-center justify-center"><Pause size={20}/></button>
                          )}
                          <button onClick={resetRound} className="flex-1 bg-slate-600 rounded-lg flex items-center justify-center text-xs" title="重置"><RotateCcw size={16}/></button>
                      </div>

                      <button onClick={forceEndGame} className="bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 rounded-2xl flex flex-col items-center justify-center text-[10px] font-bold" title="提前結束遊戲">
                          <Trophy size={16} className="mb-1"/> 提前<br/>結算
                      </button>
                   </div>
               </div>
            ) : null}
         </div>
       )}
    </div>
  );
}

function ResultView({roomData, isHost, roomId}) {
   const teams = roomData.settings.teams;
   const sortedTeams = [...teams].sort((a, b) => (roomData.scores[b.id] || 0) - (roomData.scores[a.id] || 0));
   const maxScore = sortedTeams[0] ? (roomData.scores[sortedTeams[0].id] || 0) : 0;
   const winners = sortedTeams.filter(t => (roomData.scores[t.id] || 0) === maxScore);

   return (
     <div className="flex-1 bg-slate-900 flex items-center justify-center text-white p-4 text-center">
        <div className="space-y-8 animate-in zoom-in duration-500 w-full max-w-2xl">
           <div className="relative inline-block">
               <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-bounce"/>
               <div className="absolute -top-4 -right-4 text-6xl">🎉</div>
               <div className="absolute -bottom-2 -left-4 text-6xl">✨</div>
           </div>
           
           <div>
               <h2 className="text-slate-400 font-bold uppercase tracking-widest mb-2">
                   {winners.length > 1 ? "WINNERS" : "WINNER"}
               </h2>
               <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300 leading-tight">
                   {winners.map(w => w.name).join(" & ")}
               </h1>
           </div>

           <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {sortedTeams.map((t, idx) => {
                  const isWinner = winners.some(w => w.id === t.id);
                  return (
                      <div key={t.id} className={`p-6 rounded-2xl border transition-all ${isWinner ? 'bg-yellow-900/40 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)] scale-105' : 'bg-slate-800 border-slate-700 opacity-80'}`}>
                          <div className="font-bold mb-2 text-lg" style={{color: t.color || 'white'}}>{t.name}</div>
                          <div className="text-4xl font-mono font-black text-white">{roomData.scores[t.id] || 0}</div>
                      </div>
                  );
              })}
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
    const TEAM_COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    const addTeam = () => {
        const newId = `team_${Date.now()}`;
        const nextColor = TEAM_COLORS[localSettings.teams.length % TEAM_COLORS.length];
        setLocalSettings({
            ...localSettings,
            teams: [...localSettings.teams, { id: newId, name: `新隊伍 ${localSettings.teams.length + 1}`, color: nextColor }]
        });
    };

    const removeTeam = (teamId) => {
        if (localSettings.teams.length <= 2) return alert("至少需要兩個隊伍");
        setLocalSettings({
            ...localSettings,
            teams: localSettings.teams.filter(t => t.id !== teamId)
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-2xl w-full max-w-md space-y-5 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center border-b pb-3">
                  <h3 className="font-bold text-lg text-slate-800">遊戲設定</h3>
                  <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>
              
              <div className="overflow-y-auto flex-1 space-y-6 pr-2">
                  {/* 權限設定 */}
                  <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-500 uppercase">權限管理</h4>
                      <div className="flex items-center justify-between">
                          <label className="text-slate-700">允許參賽者換隊</label>
                          <input type="checkbox" checked={localSettings.permissions.allowPlayerTeamSwitch} onChange={e=>setLocalSettings({...localSettings, permissions: {...localSettings.permissions, allowPlayerTeamSwitch: e.target.checked}})} className="w-5 h-5 accent-indigo-600"/>
                      </div>
                      <div className="flex items-center justify-between">
                          <label className="text-slate-700">允許參賽者新增題目</label>
                          <input type="checkbox" checked={localSettings.permissions.allowPlayerAddWords} onChange={e=>setLocalSettings({...localSettings, permissions: {...localSettings.permissions, allowPlayerAddWords: e.target.checked}})} className="w-5 h-5 accent-indigo-600"/>
                      </div>
                  </div>

                  {/* 隊伍設定 */}
                  <div className="space-y-3">
                      <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-slate-500 uppercase">隊伍設定</h4>
                          <button onClick={addTeam} className="text-xs bg-slate-100 px-2 py-1 rounded hover:bg-slate-200 font-bold">+ 新增隊伍</button>
                      </div>
                      {localSettings.teams.map((t, idx) => (
                          <div key={t.id} className="flex gap-2 items-center">
                              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{backgroundColor: t.color || '#ccc'}}></div>
                              <input 
                                value={t.name}
                                onChange={e => {
                                    const newTeams = [...localSettings.teams];
                                    newTeams[idx].name = e.target.value;
                                    setLocalSettings({...localSettings, teams: newTeams});
                                }}
                                className="border p-2 rounded flex-1 text-sm"
                              />
                              {localSettings.teams.length > 2 && (
                                  <button onClick={() => removeTeam(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                              )}
                          </div>
                      ))}
                  </div>

                  {/* 數值設定 */}
                  <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-500 uppercase">遊戲數值</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="space-y-1"><label className="text-slate-500 font-medium">總輪數</label><input type="number" className="w-full border p-2 rounded" value={localSettings.totalRounds} onChange={e=>setLocalSettings({...localSettings, totalRounds: +e.target.value})} /></div>
                        <div className="space-y-1"><label className="text-slate-500 font-medium">單隊限時</label><input type="number" className="w-full border p-2 rounded" value={localSettings.roundDuration} onChange={e=>setLocalSettings({...localSettings, roundDuration: +e.target.value})} /></div>
                        <div className="space-y-1"><label className="text-slate-500 font-medium">每題秒數</label><input type="number" className="w-full border p-2 rounded" value={localSettings.answerTime} onChange={e=>setLocalSettings({...localSettings, answerTime: +e.target.value})} /></div>
                        <div className="space-y-1"><label className="text-slate-500 font-medium">搶答秒數</label><input type="number" className="w-full border p-2 rounded" value={localSettings.stealTime} onChange={e=>setLocalSettings({...localSettings, stealTime: +e.target.value})} /></div>
                      </div>
                  </div>
              </div>

              <button onClick={onSave} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-lg">儲存設定</button>
            </div>
         </div>
    );
}