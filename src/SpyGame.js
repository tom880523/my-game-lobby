import React, { useState, useEffect, useCallback } from 'react';
import {
    doc, setDoc, getDoc, onSnapshot, updateDoc,
    runTransaction, deleteDoc, collection, addDoc, getDocs,
    query, orderBy, limit, serverTimestamp, arrayUnion
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
    Play, Settings, Plus, Check, X, ClipboardCopy,
    ArrowLeft, LogOut, Trash2, Crown, Eye, EyeOff, Cloud, Download,
    Library, Users, Vote, MessageCircle, SkipForward
} from 'lucide-react';

import { db, auth } from './firebase';

// =================================================================
// 預設題庫 (詞對)
// =================================================================
const DEFAULT_WORD_PAIRS = [
    { a: '蘋果', b: '鳳梨' },
    { a: '貓', b: '狗' },
    { a: '麥當勞', b: '肯德基' },
    { a: '鋼鐵人', b: '蝙蝠俠' },
    { a: '咖啡', b: '奶茶' },
    { a: '籃球', b: '足球' },
    { a: '電影', b: '電視劇' },
    { a: '手機', b: '平板' },
    { a: '夏天', b: '冬天' },
    { a: '海邊', b: '山上' },
    { a: '醫生', b: '護士' },
    { a: '老師', b: '教授' },
    { a: '鋼琴', b: '吉他' },
    { a: '牛肉麵', b: '拉麵' },
    { a: '珍珠奶茶', b: '椰果奶茶' },
    { a: '捷運', b: '公車' },
    { a: '台北', b: '高雄' },
    { a: '日本', b: '韓國' },
    { a: '漢堡', b: '三明治' },
    { a: '巧克力', b: '糖果' },
    { a: '蛋糕', b: '餅乾' },
    { a: '啤酒', b: '紅酒' },
    { a: '眼鏡', b: '墨鏡' },
    { a: '雨傘', b: '陽傘' },
    { a: '書本', b: '雜誌' },
    { a: '大學', b: '高中' },
    { a: '律師', b: '法官' },
    { a: '警察', b: '軍人' },
    { a: '飛機', b: '高鐵' },
    { a: '腳踏車', b: '機車' }
];

// 預設設定
const DEFAULT_SETTINGS = {
    undercoverCount: 1,
    whiteboardCount: 0,
    useDefaultPairs: true,
    descriptionTimeLimit: 30  // 每人描述時間限制(秒)
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// =================================================================
// 主元件
// =================================================================
export default function SpyGame({ onBack, getNow, currentUser, isAdmin }) {
    const [user, setUser] = useState(currentUser || null);
    const [view, setView] = useState('lobby');
    const [roomId, setRoomId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
    const [showSettings, setShowSettings] = useState(false);

    const getCurrentTime = useCallback(() => {
        if (typeof getNow === 'function') return getNow();
        return Date.now();
    }, [getNow]);

    useEffect(() => { document.title = "諜影行動 | Party Game"; }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) setUser(u);
            else signInAnonymously(auth).catch(console.error);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user || !roomId) return;
        console.log('[SpyGame] 訂閱房間:', roomId);
        const unsubscribe = onSnapshot(doc(db, 'spy_rooms', `spy_room_${roomId}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRoomData(data);
                const amIInRoom = data.players?.some(p => p.id === user.uid);
                if (!amIInRoom && view !== 'lobby') {
                    alert("你已被踢出房間"); setView('lobby'); setRoomData(null); return;
                }
                if (data.status === 'waiting' && (view === 'game' || view === 'result')) setView('room');
                if (['description', 'voting', 'pk'].includes(data.status) && view === 'room') setView('game');
                if (data.status === 'finished' && view === 'game') setView('result');
            } else if (view !== 'lobby') {
                alert("房間已關閉"); setView('lobby'); setRoomData(null);
            }
        });
        return () => unsubscribe();
    }, [user, roomId, view]);

    const checkAndLeaveOldRoom = async (uid, newRoomId) => {
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const oldRoomId = userSnap.data().currentSpyRoomId;
                if (oldRoomId && oldRoomId !== newRoomId) {
                    const oldRoomRef = doc(db, 'spy_rooms', `spy_room_${oldRoomId}`);
                    await runTransaction(db, async (transaction) => {
                        const oldRoomDoc = await transaction.get(oldRoomRef);
                        if (!oldRoomDoc.exists()) return;
                        const data = oldRoomDoc.data();
                        const newPlayers = data.players.filter(p => p.id !== uid);
                        if (newPlayers.length === 0) transaction.delete(oldRoomRef);
                        else {
                            const updates = { players: newPlayers };
                            if (data.hostId === uid) updates.hostId = newPlayers[0].id;
                            transaction.update(oldRoomRef, updates);
                        }
                    });
                }
            }
            await setDoc(userRef, { currentSpyRoomId: newRoomId }, { merge: true });
        } catch (e) { console.error("Cleanup old room failed:", e); }
    };

    const createRoom = async () => {
        if (!playerName.trim()) return alert("請輸入名字");
        setLoading(true);
        try {
            const newRoomId = generateRoomId();
            await checkAndLeaveOldRoom(user.uid, newRoomId);
            const me = { id: user.uid, name: playerName, role: null, word: null, status: 'alive', hasDescribed: false };
            await setDoc(doc(db, 'spy_rooms', `spy_room_${newRoomId}`), {
                id: newRoomId, hostId: user.uid, status: 'waiting',
                players: [me], settings: DEFAULT_SETTINGS,
                currentPair: null, currentRound: 1,
                turnOrder: [], currentTurnIndex: 0,
                roundLogs: [], votes: {}, pkPlayers: [],
                winner: null, customPairs: [], useDefaultPairs: true
            });
            console.log('[SpyGame] 建立房間:', newRoomId);
            setRoomId(newRoomId); setView('room');
        } catch (e) { console.error(e); alert("建立失敗: " + e.message); }
        setLoading(false);
    };

    const joinRoom = async () => {
        if (!playerName.trim() || !roomId.trim()) return alert("請輸入資料");
        setLoading(true);
        try {
            const rId = roomId.toUpperCase();
            await checkAndLeaveOldRoom(user.uid, rId);
            const roomRef = doc(db, 'spy_rooms', `spy_room_${rId}`);
            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists()) throw new Error("房間不存在");
                const data = roomDoc.data();
                if (data.status !== 'waiting') throw new Error("遊戲已開始，無法加入");
                const currentPlayers = data.players || [];
                const playerIndex = currentPlayers.findIndex(p => p.id === user.uid);
                let newPlayersList;
                if (playerIndex >= 0) {
                    newPlayersList = [...currentPlayers];
                    newPlayersList[playerIndex] = { ...newPlayersList[playerIndex], name: playerName };
                } else {
                    newPlayersList = [...currentPlayers, { id: user.uid, name: playerName, role: null, word: null, status: 'alive', hasDescribed: false }];
                }
                transaction.update(roomRef, { players: newPlayersList });
            });
            console.log('[SpyGame] 加入房間:', rId);
            setRoomId(rId); setView('room');
        } catch (e) { console.error(e); alert("加入失敗: " + e.message); }
        setLoading(false);
    };

    const leaveRoom = async () => {
        if (!window.confirm("確定離開房間？")) return;
        try {
            const ref = doc(db, 'spy_rooms', `spy_room_${roomId}`);
            const newPlayers = roomData.players.filter(p => p.id !== user.uid);
            await updateDoc(doc(db, 'users', user.uid), { currentSpyRoomId: null });
            if (newPlayers.length === 0) await deleteDoc(ref);
            else {
                if (roomData.hostId === user.uid) await updateDoc(ref, { players: newPlayers, hostId: newPlayers[0].id });
                else await updateDoc(ref, { players: newPlayers });
            }
        } catch (e) { console.error("Leave error", e); }
        setView('lobby'); setRoomId(''); setRoomData(null);
    };

    if (view === 'lobby') return <SpyLobbyView onBack={onBack} playerName={playerName} setPlayerName={setPlayerName} roomId={roomId} setRoomId={setRoomId} createRoom={createRoom} joinRoom={joinRoom} loading={loading} user={user} />;
    if (!roomData) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">載入中...</div>;

    const isHost = roomData.hostId === user?.uid;

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            <header className="bg-slate-800 border-b border-slate-700 p-3 flex justify-between items-center z-20 sticky top-0">
                <div className="flex items-center gap-2">
                    <button onClick={leaveRoom} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors"><LogOut size={20} /></button>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">房間代碼</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-white text-lg">
                            {roomData.id}
                            <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-slate-400 hover:text-violet-400"><ClipboardCopy size={14} /></button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">{user.isAnonymous ? playerName : user.displayName || playerName}</span>
                    {isHost && view === 'room' && <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-sm font-medium transition"><Settings size={16} /> 設定</button>}
                </div>
            </header>
            <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
                {view === 'room' && <SpyRoomView roomData={roomData} isHost={isHost} isAdmin={isAdmin} roomId={roomId} currentUser={user} getCurrentTime={getCurrentTime} />}
                {view === 'game' && <SpyGameInterface roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user} getCurrentTime={getCurrentTime} />}
                {view === 'result' && <SpyResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
            </main>
            {showSettings && <SpySettingsModal localSettings={localSettings} setLocalSettings={setLocalSettings} setShowSettings={setShowSettings} onSave={async () => { await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { settings: localSettings }); setShowSettings(false); }} roomData={roomData} />}
        </div>
    );
}

// =================================================================
// Lobby View
// =================================================================
function SpyLobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
                <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors"><ArrowLeft /></button>
                <div className="text-center pt-6">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-300 to-purple-400">諜影行動</h1>
                    <p className="text-white/60 text-sm mt-1">找出臥底！隱藏身份！</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-white/70 ml-1">你的名字</label>
                        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none placeholder-white/30 text-white" placeholder="例如：特務007" />
                        {user && <div className="text-[10px] text-white/40 mt-1 text-right font-mono">ID: {user.uid.slice(0, 5)}...</div>}
                    </div>
                    <button onClick={createRoom} disabled={loading || !user} className="w-full py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95">建立新房間</button>
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

// =================================================================
// Room View
// =================================================================
function SpyRoomView({ roomData, isHost, isAdmin, roomId, currentUser, getCurrentTime }) {
    const [showCloudLibrary, setShowCloudLibrary] = useState(false);
    const [newPairInput, setNewPairInput] = useState('');

    const players = roomData.players || [];
    const customPairs = roomData.customPairs || [];
    const settings = roomData.settings || DEFAULT_SETTINGS;
    const totalPlayers = players.length;
    const civilianCount = totalPlayers - settings.undercoverCount - settings.whiteboardCount;

    const kickPlayer = async (targetId) => {
        if (!window.confirm("確定要踢出這位玩家嗎？")) return;
        const newPlayers = players.filter(p => p.id !== targetId);
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { players: newPlayers });
    };

    const makeHost = async (targetId) => {
        if (!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { hostId: targetId });
    };

    const addPair = async () => {
        if (!newPairInput.includes('|')) return alert("格式錯誤！請使用 詞A|詞B");
        const parts = newPairInput.split('|').map(s => s.trim());
        if (parts.length !== 2 || !parts[0] || !parts[1]) return alert("格式錯誤！");
        const newPair = { a: parts[0], b: parts[1] };
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { customPairs: [...customPairs, newPair] });
        setNewPairInput('');
    };

    const removePair = async (index) => {
        const updated = customPairs.filter((_, i) => i !== index);
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { customPairs: updated });
    };

    const toggleDefaultPairs = async () => {
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { useDefaultPairs: !roomData.useDefaultPairs });
    };

    const importDeckFromCloud = async (deckId) => {
        try {
            const deckDoc = await getDoc(doc(db, 'spy_cloud_decks', deckId));
            if (deckDoc.exists()) {
                const deck = deckDoc.data();
                const newPairs = [...customPairs, ...(deck.pairs || [])];
                await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { customPairs: newPairs });
                alert(`成功匯入：${deck.name} (${deck.pairs?.length || 0} 組)`);
                setShowCloudLibrary(false);
            } else {
                alert("找不到此代碼的題庫");
            }
        } catch (e) {
            alert("匯入失敗：" + e.message);
        }
    };

    const startGame = async () => {
        // 驗證人數
        if (civilianCount < 1) return alert("平民人數不足！請調整臥底/白板人數");
        if (settings.undercoverCount < 1) return alert("至少需要 1 位臥底！");
        if (totalPlayers < 3) return alert("至少需要 3 位玩家！");

        // 收集題庫
        let allPairs = [];
        if (roomData.useDefaultPairs !== false) allPairs = [...DEFAULT_WORD_PAIRS];
        allPairs = [...allPairs, ...customPairs];
        if (allPairs.length === 0) return alert("請先新增題目！");

        // 隨機選一組詞對
        const selectedPair = allPairs[Math.floor(Math.random() * allPairs.length)];

        // 分配身分
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const assignedPlayers = shuffled.map((p, i) => {
            let role, word;
            if (i < settings.undercoverCount) {
                role = 'undercover';
                word = selectedPair.b;
            } else if (i < settings.undercoverCount + settings.whiteboardCount) {
                role = 'whiteboard';
                word = null;
            } else {
                role = 'civilian';
                word = selectedPair.a;
            }
            return { ...p, role, word, status: 'alive', hasDescribed: false };
        });

        // 建立發言順序
        const turnOrder = assignedPlayers.filter(p => p.status === 'alive').map(p => p.id).sort(() => 0.5 - Math.random());

        console.log('[SpyGame] 開始遊戲, 詞對:', selectedPair);

        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
            status: 'description',
            players: assignedPlayers,
            currentPair: selectedPair,
            currentRound: 1,
            turnOrder: turnOrder,
            currentTurnIndex: 0,
            roundLogs: [],
            votes: {},
            pkPlayers: [],
            winner: null
        });
    };

    const canStart = totalPlayers >= 3 && civilianCount >= 1 && settings.undercoverCount >= 1;

    return (
        <>
            {showCloudLibrary && (
                <SpyCloudLibraryModal
                    onClose={() => setShowCloudLibrary(false)}
                    onImport={importDeckFromCloud}
                    db={db}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                />
            )}

            <div className="p-4 md:p-8 w-full space-y-6 text-white">
                <div className="grid md:grid-cols-2 gap-6">
                    {/* 左側：玩家列表 */}
                    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4">
                        <h2 className="text-xl font-bold flex items-center gap-2"><Users className="text-violet-400" /> 玩家列表 ({players.length})</h2>
                        <div className="space-y-2">
                            {players.map(p => (
                                <div key={p.id} className={`flex items-center justify-between p-3 rounded-xl border ${p.id === currentUser.uid ? 'bg-violet-500/20 border-violet-500/50' : 'bg-slate-800 border-slate-700'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-medium">{p.name}</span>
                                        {p.id === roomData.hostId && <Crown size={14} className="text-yellow-400 fill-yellow-400" />}
                                        {p.id === currentUser.uid && <span className="text-xs bg-slate-700 text-slate-400 px-1 rounded">我</span>}
                                    </div>
                                    {isHost && p.id !== currentUser.uid && (
                                        <div className="flex gap-1">
                                            <button onClick={() => makeHost(p.id)} className="text-slate-400 hover:text-yellow-500 p-1"><Crown size={14} /></button>
                                            <button onClick={() => kickPlayer(p.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* 身分分配預覽 */}
                        <div className="bg-slate-900/50 border border-slate-700 p-4 rounded-xl">
                            <h3 className="text-sm font-bold text-slate-400 mb-2">身分分配</h3>
                            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                <div className="bg-green-500/20 text-green-400 p-2 rounded-lg">🙂 平民 x{civilianCount}</div>
                                <div className="bg-red-500/20 text-red-400 p-2 rounded-lg">😎 臥底 x{settings.undercoverCount}</div>
                                <div className="bg-slate-500/20 text-slate-400 p-2 rounded-lg">👻 白板 x{settings.whiteboardCount}</div>
                            </div>
                            {civilianCount < 1 && <div className="text-red-400 text-xs mt-2">⚠️ 平民人數不足！</div>}
                        </div>
                    </div>

                    {/* 右側：題庫設定 */}
                    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4">
                        <h2 className="text-lg font-bold flex justify-between items-center">題庫設定 {!isHost && <span className="text-xs font-normal text-slate-500">僅主持人可編輯</span>}</h2>

                        {/* 內建題庫 */}
                        <div onClick={isHost ? toggleDefaultPairs : undefined} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${isHost ? 'cursor-pointer' : 'opacity-70'} ${roomData.useDefaultPairs !== false ? 'border-violet-500 bg-violet-500/20' : 'border-slate-600 bg-slate-800'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${roomData.useDefaultPairs !== false ? 'bg-violet-500 border-violet-500' : 'border-slate-500'}`}>
                                    {roomData.useDefaultPairs !== false && <Check size={14} className="text-white" />}
                                </div>
                                <div><div className="font-bold">內建題庫 ({DEFAULT_WORD_PAIRS.length} 組)</div><div className="text-xs text-slate-400">蘋果/鳳梨、貓/狗...</div></div>
                            </div>
                        </div>

                        {/* 自訂題目 */}
                        <div className="space-y-2">
                            <div className="text-sm text-slate-400">自訂題目 ({customPairs.length} 組)</div>
                            <div className="max-h-40 overflow-y-auto space-y-1">
                                {customPairs.map((pair, i) => (
                                    <div key={i} className="flex justify-between items-center bg-slate-700 p-2 rounded-lg text-sm">
                                        <span>{pair.a} / {pair.b}</span>
                                        {isHost && <button onClick={() => removePair(i)} className="text-slate-400 hover:text-red-500"><X size={14} /></button>}
                                    </div>
                                ))}
                            </div>
                            {isHost && (
                                <div className="flex gap-2">
                                    <input value={newPairInput} onChange={e => setNewPairInput(e.target.value)} className="flex-1 bg-slate-700 border border-slate-600 px-3 py-2 rounded-lg text-sm text-white" placeholder="詞A|詞B" onKeyDown={e => e.key === 'Enter' && addPair()} />
                                    <button onClick={addPair} className="bg-violet-500 text-white px-4 rounded-lg font-bold"><Plus size={18} /></button>
                                </div>
                            )}
                        </div>

                        {/* 雲端圖書館 */}
                        {isHost && (
                            <button onClick={() => setShowCloudLibrary(true)} className="w-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                <Library size={18} /> ☁️ 瀏覽雲端題庫
                            </button>
                        )}
                    </div>
                </div>

                {/* 開始遊戲 */}
                {isHost && (
                    <button onClick={startGame} disabled={!canStart} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg transition transform hover:scale-[1.02]">
                        <Play className="inline mr-2" /> 開始遊戲
                    </button>
                )}
            </div>
        </>
    );
}

// =================================================================
// Game Interface
// =================================================================
function SpyGameInterface({ roomData, isHost, roomId, currentUser, getCurrentTime }) {
    const [description, setDescription] = useState('');
    const [showWord, setShowWord] = useState(false);
    const [selectedVote, setSelectedVote] = useState(null);

    const players = roomData.players || [];
    const alivePlayers = players.filter(p => p.status === 'alive');
    const outPlayers = players.filter(p => p.status === 'out');
    const me = players.find(p => p.id === currentUser.uid);
    const isMyTurn = roomData.status === 'description' && roomData.turnOrder[roomData.currentTurnIndex] === currentUser.uid;
    const currentSpeaker = players.find(p => p.id === roomData.turnOrder[roomData.currentTurnIndex]);
    const roundLogs = roomData.roundLogs || [];
    const votes = roomData.votes || {};
    const pkPlayers = roomData.pkPlayers || [];
    // eslint-disable-next-line no-unused-vars
    const isInPK = roomData.status === 'pk' && pkPlayers.includes(currentUser.uid);

    // 計算票數
    const voteCounts = {};
    Object.values(votes).forEach(targetId => {
        voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // 提交描述
    const submitDescription = async () => {
        if (!description.trim()) return;
        const newLog = { playerId: currentUser.uid, name: me.name, content: description.trim() };

        // 更新輪次
        const nextIndex = roomData.currentTurnIndex + 1;
        const allDescribed = nextIndex >= roomData.turnOrder.length;

        if (allDescribed) {
            // 進入投票階段
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                roundLogs: arrayUnion(newLog),
                status: 'voting',
                votes: {}
            });
        } else {
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                roundLogs: arrayUnion(newLog),
                currentTurnIndex: nextIndex
            });
        }
        setDescription('');
    };

    // 投票
    const submitVote = async (targetId) => {
        if (me.status === 'out') return;
        if (targetId === currentUser.uid) return alert("不能投給自己！");
        setSelectedVote(targetId);

        const newVotes = { ...votes, [currentUser.uid]: targetId };
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), { votes: newVotes });
    };

    // 主持人結算投票
    const settleVotes = async () => {
        const counts = {};
        Object.values(votes).forEach(targetId => {
            counts[targetId] = (counts[targetId] || 0) + 1;
        });

        const maxVotes = Math.max(...Object.values(counts), 0);
        const topPlayers = Object.keys(counts).filter(id => counts[id] === maxVotes);

        if (topPlayers.length > 1) {
            // 平手，進入 PK
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                status: 'pk',
                pkPlayers: topPlayers,
                votes: {},
                roundLogs: []
            });
        } else if (topPlayers.length === 1) {
            // 淘汰
            await eliminatePlayer(topPlayers[0]);
        } else {
            // 無人投票
            await nextRound();
        }
    };

    // PK 結算
    const settlePK = async () => {
        const counts = {};
        Object.values(votes).forEach(targetId => {
            counts[targetId] = (counts[targetId] || 0) + 1;
        });

        const maxVotes = Math.max(...Object.values(counts), 0);
        const topPlayers = Object.keys(counts).filter(id => counts[id] === maxVotes);

        if (topPlayers.length > 1 || topPlayers.length === 0) {
            // 再次平手或無人投票，該輪無人出局
            await nextRound();
        } else {
            await eliminatePlayer(topPlayers[0]);
        }
    };

    // 淘汰玩家
    const eliminatePlayer = async (playerId) => {
        const updatedPlayers = players.map(p =>
            p.id === playerId ? { ...p, status: 'out' } : p
        );

        // 檢查勝負
        const aliveAfter = updatedPlayers.filter(p => p.status === 'alive');
        const aliveUndercovers = aliveAfter.filter(p => p.role === 'undercover').length;
        const aliveCivilians = aliveAfter.filter(p => p.role === 'civilian').length;
        const aliveWhiteboards = aliveAfter.filter(p => p.role === 'whiteboard').length;

        let winner = null;
        if (aliveUndercovers === 0 && aliveWhiteboards === 0) {
            winner = 'civilian'; // 平民獲勝
        } else if (aliveUndercovers >= aliveCivilians + aliveWhiteboards) {
            winner = 'undercover'; // 臥底獲勝
        }

        if (winner) {
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                players: updatedPlayers,
                status: 'finished',
                winner: winner
            });
        } else {
            // 繼續下一輪
            const newTurnOrder = aliveAfter.map(p => p.id).sort(() => 0.5 - Math.random());
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                players: updatedPlayers,
                status: 'description',
                currentRound: roomData.currentRound + 1,
                turnOrder: newTurnOrder,
                currentTurnIndex: 0,
                roundLogs: [],
                votes: {},
                pkPlayers: []
            });
        }
    };

    // 下一輪
    const nextRound = async () => {
        const newTurnOrder = alivePlayers.map(p => p.id).sort(() => 0.5 - Math.random());
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
            status: 'description',
            currentRound: roomData.currentRound + 1,
            turnOrder: newTurnOrder,
            currentTurnIndex: 0,
            roundLogs: [],
            votes: {},
            pkPlayers: []
        });
    };

    // 主持人跳過
    const skipPlayer = async () => {
        const nextIndex = roomData.currentTurnIndex + 1;
        if (nextIndex >= roomData.turnOrder.length) {
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                status: 'voting',
                votes: {}
            });
        } else {
            await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
                currentTurnIndex: nextIndex
            });
        }
    };

    const getRoleEmoji = (role) => {
        if (role === 'civilian') return '🙂';
        if (role === 'undercover') return '😎';
        if (role === 'whiteboard') return '👻';
        return '❓';
    };

    const getRoleName = (role) => {
        if (role === 'civilian') return '平民';
        if (role === 'undercover') return '臥底';
        if (role === 'whiteboard') return '白板';
        return '未知';
    };

    return (
        <div className="flex-1 p-4 text-white">
            {/* 身分卡片 */}
            <div className="mb-4">
                <div
                    onClick={() => setShowWord(!showWord)}
                    className={`bg-gradient-to-br ${me?.role === 'undercover' ? 'from-red-500 to-red-700' : me?.role === 'whiteboard' ? 'from-slate-500 to-slate-700' : 'from-green-500 to-green-700'} p-4 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] select-none`}
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{getRoleEmoji(me?.role)}</span>
                            <div>
                                <div className="text-sm opacity-80">你的身分</div>
                                <div className="font-bold text-lg">{getRoleName(me?.role)}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {showWord ? <EyeOff size={20} /> : <Eye size={20} />}
                            <span className="text-sm">{showWord ? '隱藏' : '點擊查看'}</span>
                        </div>
                    </div>
                    {showWord && (
                        <div className="mt-4 pt-4 border-t border-white/30 text-center">
                            <div className="text-sm opacity-80">你的詞彙</div>
                            <div className="text-3xl font-bold">{me?.word || '???'}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* 狀態提示 */}
            <div className="mb-4 text-center">
                <div className="inline-block px-4 py-2 rounded-full bg-violet-500/30 text-violet-300 font-bold">
                    第 {roomData.currentRound} 輪 - {
                        roomData.status === 'description' ? '敘述階段' :
                            roomData.status === 'voting' ? '投票階段' :
                                roomData.status === 'pk' ? 'PK 階段' : '進行中'
                    }
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
                {/* 左側：玩家列表 */}
                <div className="bg-slate-800 rounded-2xl p-4">
                    <h3 className="font-bold mb-3 flex items-center gap-2"><Users size={18} /> 存活玩家</h3>
                    <div className="space-y-2">
                        {alivePlayers.map(p => (
                            <div
                                key={p.id}
                                onClick={() => (roomData.status === 'voting' || roomData.status === 'pk') && submitVote(p.id)}
                                className={`p-3 rounded-xl border transition-all ${p.id === roomData.turnOrder[roomData.currentTurnIndex] ? 'bg-violet-500/30 border-violet-500 ring-2 ring-violet-400' :
                                    selectedVote === p.id ? 'bg-red-500/30 border-red-500' :
                                        votes[currentUser.uid] === p.id ? 'bg-orange-500/30 border-orange-500' :
                                            'bg-slate-700 border-slate-600'
                                    } ${(roomData.status === 'voting' || roomData.status === 'pk') && p.id !== currentUser.uid ? 'cursor-pointer hover:border-violet-400' : ''}`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">{p.name}</span>
                                    {(roomData.status === 'voting' || roomData.status === 'pk') && (
                                        <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                            {voteCounts[p.id] || 0} 票
                                        </span>
                                    )}
                                </div>
                                {p.id === currentUser.uid && <span className="text-xs text-violet-400">（我）</span>}
                            </div>
                        ))}
                    </div>

                    {outPlayers.length > 0 && (
                        <>
                            <h3 className="font-bold mt-4 mb-2 text-slate-400">已出局</h3>
                            <div className="space-y-1">
                                {outPlayers.map(p => (
                                    <div key={p.id} className="p-2 rounded-lg bg-slate-900/50 text-slate-500 flex justify-between">
                                        <span className="line-through">{p.name}</span>
                                        <span>{getRoleEmoji(p.role)} {getRoleName(p.role)}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* 中間：敘述日誌 */}
                <div className="md:col-span-2 bg-slate-800 rounded-2xl p-4 flex flex-col">
                    <h3 className="font-bold mb-3 flex items-center gap-2"><MessageCircle size={18} /> 敘述日誌</h3>

                    <div className="flex-1 overflow-y-auto space-y-2 mb-4 max-h-60">
                        {roundLogs.length === 0 ? (
                            <div className="text-center text-slate-500 py-8">等待發言...</div>
                        ) : (
                            roundLogs.map((log, i) => (
                                <div key={i} className={`p-3 rounded-xl ${log.playerId === currentUser.uid ? 'bg-violet-500/20 border border-violet-500/50' : 'bg-slate-700'}`}>
                                    <span className="font-bold text-violet-400">{log.name}：</span>
                                    <span>{log.content}</span>
                                </div>
                            ))
                        )}
                    </div>

                    {/* 操作區 */}
                    {roomData.status === 'description' && (
                        <div className="space-y-2">
                            {isMyTurn ? (
                                <>
                                    <div className="text-center text-green-400 font-bold animate-pulse">輪到你發言了！</div>
                                    <div className="flex gap-2">
                                        <input
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="flex-1 bg-slate-700 border border-slate-600 px-4 py-3 rounded-xl text-white"
                                            placeholder="用一句話描述你的詞彙..."
                                            onKeyDown={e => e.key === 'Enter' && submitDescription()}
                                        />
                                        <button onClick={submitDescription} className="bg-violet-500 hover:bg-violet-600 px-6 rounded-xl font-bold">送出</button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-slate-400">
                                    等待 <span className="text-violet-400 font-bold">{currentSpeaker?.name}</span> 發言...
                                </div>
                            )}
                            {isHost && !isMyTurn && (
                                <button onClick={skipPlayer} className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm flex items-center justify-center gap-2">
                                    <SkipForward size={16} /> 跳過此玩家
                                </button>
                            )}
                        </div>
                    )}

                    {roomData.status === 'voting' && (
                        <div className="space-y-2">
                            <div className="text-center text-orange-400 font-bold">投票階段！點擊玩家頭像投票</div>
                            {votes[currentUser.uid] && <div className="text-center text-slate-400">你已投票給 {players.find(p => p.id === votes[currentUser.uid])?.name}</div>}
                            {isHost && Object.keys(votes).length >= alivePlayers.length - 1 && (
                                <button onClick={settleVotes} className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold">
                                    <Vote className="inline mr-2" /> 結算投票
                                </button>
                            )}
                        </div>
                    )}

                    {roomData.status === 'pk' && (
                        <div className="space-y-2">
                            <div className="text-center text-red-400 font-bold">PK 階段！{pkPlayers.map(id => players.find(p => p.id === id)?.name).join(' vs ')}</div>
                            {isHost && (
                                <button onClick={settlePK} className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold">
                                    <Vote className="inline mr-2" /> 結算 PK
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Result View
// =================================================================
function SpyResultView({ roomData, isHost, roomId }) {
    const players = roomData.players || [];
    const winner = roomData.winner;

    const playAgain = async () => {
        const resetPlayers = players.map(p => ({ ...p, role: null, word: null, status: 'alive', hasDescribed: false }));
        await updateDoc(doc(db, 'spy_rooms', `spy_room_${roomId}`), {
            status: 'waiting',
            players: resetPlayers,
            currentPair: null,
            currentRound: 1,
            turnOrder: [],
            currentTurnIndex: 0,
            roundLogs: [],
            votes: {},
            pkPlayers: [],
            winner: null
        });
    };

    const getRoleEmoji = (role) => {
        if (role === 'civilian') return '🙂';
        if (role === 'undercover') return '😎';
        if (role === 'whiteboard') return '👻';
        return '❓';
    };

    return (
        <div className="flex-1 p-4 flex flex-col items-center justify-center text-white">
            <div className="text-center space-y-6 max-w-md w-full">
                <div className="text-6xl mb-4">{winner === 'civilian' ? '🎉' : '😈'}</div>
                <h1 className={`text-4xl font-bold ${winner === 'civilian' ? 'text-green-400' : 'text-red-400'}`}>
                    {winner === 'civilian' ? '平民獲勝！' : '臥底獲勝！'}
                </h1>

                <div className="bg-slate-800 rounded-2xl p-6 space-y-4">
                    <h3 className="font-bold text-lg">詞彙揭曉</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-green-500/20 p-4 rounded-xl">
                            <div className="text-sm text-green-400">平民詞彙</div>
                            <div className="text-2xl font-bold">{roomData.currentPair?.a}</div>
                        </div>
                        <div className="bg-red-500/20 p-4 rounded-xl">
                            <div className="text-sm text-red-400">臥底詞彙</div>
                            <div className="text-2xl font-bold">{roomData.currentPair?.b}</div>
                        </div>
                    </div>

                    <h3 className="font-bold text-lg mt-4">玩家身分</h3>
                    <div className="space-y-2">
                        {players.map(p => (
                            <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl ${p.role === 'undercover' ? 'bg-red-500/20' : p.role === 'whiteboard' ? 'bg-slate-500/20' : 'bg-green-500/20'}`}>
                                <span className="font-medium">{p.name}</span>
                                <span>{getRoleEmoji(p.role)} {p.role === 'civilian' ? '平民' : p.role === 'undercover' ? '臥底' : '白板'}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {isHost && (
                    <button onClick={playAgain} className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 rounded-xl font-bold text-lg">
                        <Play className="inline mr-2" /> 再來一局
                    </button>
                )}
            </div>
        </div>
    );
}

// =================================================================
// Settings Modal
// =================================================================
function SpySettingsModal({ localSettings, setLocalSettings, setShowSettings, onSave, roomData }) {
    const totalPlayers = roomData?.players?.length || 0;
    const civilianCount = totalPlayers - localSettings.undercoverCount - localSettings.whiteboardCount;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-700 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                    <h3 className="font-bold text-xl text-white">遊戲設定</h3>
                    <button onClick={() => setShowSettings(false)}><X className="text-slate-400 hover:text-white" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">臥底人數</label>
                        <input type="number" min="1" max={totalPlayers - 1} value={localSettings.undercoverCount} onChange={e => setLocalSettings({ ...localSettings, undercoverCount: parseInt(e.target.value) || 1 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">白板人數</label>
                        <input type="number" min="0" max={totalPlayers - localSettings.undercoverCount - 1} value={localSettings.whiteboardCount} onChange={e => setLocalSettings({ ...localSettings, whiteboardCount: parseInt(e.target.value) || 0 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-lg text-sm">
                        <div className="text-slate-400">目前設定：</div>
                        <div className="text-white">🙂 平民 x{civilianCount} / 😎 臥底 x{localSettings.undercoverCount} / 👻 白板 x{localSettings.whiteboardCount}</div>
                        {civilianCount < 1 && <div className="text-red-400 mt-1">⚠️ 平民人數不足！</div>}
                    </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-slate-700">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-lg font-bold">取消</button>
                    <button onClick={onSave} className="flex-1 py-3 bg-violet-500 text-white rounded-lg font-bold">儲存</button>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Cloud Library Modal
// =================================================================
function SpyCloudLibraryModal({ onClose, onImport, db, currentUser, isAdmin }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadMode, setUploadMode] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [newDeckPairs, setNewDeckPairs] = useState('');

    useEffect(() => {
        const fetchDecks = async () => {
            try {
                const q = query(collection(db, 'spy_cloud_decks'), orderBy('createdAt', 'desc'), limit(20));
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setDecks(list);
                console.log('[SpyGame] 載入雲端題庫:', list.length, '個');
            } catch (e) {
                console.error("Fetch decks error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDecks();
    }, [db]);

    const deleteDeck = async (deckId) => {
        if (!isAdmin) return alert("權限不足：只有管理員可以刪除雲端題庫！");
        if (!window.confirm("確定要從雲端永久刪除此題庫嗎？")) return;
        try {
            await deleteDoc(doc(db, 'spy_cloud_decks', deckId));
            setDecks(decks.filter(d => d.id !== deckId));
        } catch (e) {
            alert("刪除失敗");
        }
    };

    // 上傳題庫到雲端
    const uploadDeck = async () => {
        if (!isAdmin) return alert("權限不足：只有管理員可以上傳題庫！");
        if (!newDeckName.trim()) return alert("請輸入題庫名稱！");
        if (!newDeckPairs.trim()) return alert("請輸入題目！");

        // 解析詞對 (每行一組，格式：詞A|詞B)
        const lines = newDeckPairs.split('\n').filter(l => l.trim());
        const pairs = [];
        for (const line of lines) {
            if (!line.includes('|')) continue;
            const parts = line.split('|').map(s => s.trim());
            if (parts.length === 2 && parts[0] && parts[1]) {
                pairs.push({ a: parts[0], b: parts[1] });
            }
        }

        if (pairs.length === 0) return alert("格式錯誤！每行一組，使用 詞A|詞B 格式");

        try {
            const docRef = await addDoc(collection(db, 'spy_cloud_decks'), {
                name: newDeckName.trim(),
                pairs: pairs,
                createdAt: serverTimestamp(),
                creatorId: currentUser?.uid || 'anonymous',
                creatorEmail: currentUser?.email || '匿名'
            });
            alert(`上傳成功！題庫 ID: ${docRef.id}，共 ${pairs.length} 組詞對`);
            // 刷新列表
            setDecks([{ id: docRef.id, name: newDeckName.trim(), pairs }, ...decks]);
            setUploadMode(false);
            setNewDeckName('');
            setNewDeckPairs('');
        } catch (e) {
            alert("上傳失敗：" + e.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh] border border-slate-700">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
                    <h3 className="font-bold text-2xl flex items-center gap-2 text-white">
                        <Cloud className="text-violet-400" /> 雲端題庫圖書館
                    </h3>
                    <button onClick={onClose}><X className="text-slate-400 hover:text-white" /></button>
                </div>

                {/* 上傳模式切換 (僅 Admin) */}
                {isAdmin && (
                    <div className="mb-4">
                        <button
                            onClick={() => setUploadMode(!uploadMode)}
                            className={`w-full py-2 rounded-lg font-bold transition ${uploadMode ? 'bg-slate-600 text-white' : 'bg-violet-500 hover:bg-violet-600 text-white'}`}
                        >
                            {uploadMode ? '返回列表' : '➕ 新增雲端題庫 (管理員)'}
                        </button>
                    </div>
                )}

                {/* 上傳表單 */}
                {uploadMode && isAdmin ? (
                    <div className="space-y-4 text-white">
                        <div>
                            <label className="text-sm text-slate-400 block mb-1">題庫名稱</label>
                            <input
                                value={newDeckName}
                                onChange={e => setNewDeckName(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white"
                                placeholder="輸入題庫名稱..."
                            />
                        </div>
                        <div>
                            <label className="text-sm text-slate-400 block mb-1">題目列表 (每行一組，格式: 詞A|詞B)</label>
                            <textarea
                                value={newDeckPairs}
                                onChange={e => setNewDeckPairs(e.target.value)}
                                className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white h-40 resize-none font-mono text-sm"
                                placeholder="蘋果|鳳梨&#10;貓|狗&#10;咖啡|奶茶"
                            />
                        </div>
                        <button onClick={uploadDeck} className="w-full py-3 bg-green-500 hover:bg-green-600 rounded-lg font-bold">
                            ☁️ 上傳到雲端
                        </button>
                    </div>
                ) : (
                    /* 題庫列表 */
                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                        {loading ? (
                            <div className="text-center py-10 text-slate-400">載入中...</div>
                        ) : decks.length === 0 ? (
                            <div className="text-center py-10 text-slate-400">目前沒有公開題庫</div>
                        ) : (
                            decks.map(deck => (
                                <div key={deck.id} className="bg-slate-700 border border-slate-600 rounded-xl p-4 flex justify-between items-center hover:border-slate-500 transition">
                                    <div>
                                        <h4 className="font-bold text-lg text-white">{deck.name}</h4>
                                        <div className="text-sm text-slate-400">詞對數: {deck.pairs?.length || 0}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => onImport(deck.id)} className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1">
                                            <Download size={16} /> 匯入
                                        </button>
                                        {isAdmin && (
                                            <button onClick={() => deleteDeck(deck.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/20 rounded-lg transition">
                                                <Trash2 size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
