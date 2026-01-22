import React, { useState, useEffect, useRef } from 'react';
import {
    doc, setDoc, getDoc, onSnapshot, updateDoc,
    runTransaction, deleteDoc, collection, addDoc, getDocs,
    query, orderBy, limit, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
    Play, Settings, Plus, X,
    Shuffle, ClipboardCopy, Trophy,
    ArrowLeft, LogOut, Trash2, Crown,
    Library, Download, Cloud, LayoutGrid, Edit, Check
} from 'lucide-react';

import { db, auth } from './firebase';

// =================================================================
// 預設 Emoji 配對題庫
// =================================================================
const DEFAULT_EMOJI_PAIRS = [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼',
    '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔',
    '🦄', '🐝', '🦋', '🐢', '🐙', '🦀', '🐳', '🐬',
    '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🥝', '🍑',
    '🌸', '🌺', '🌻', '🌹', '🌴', '🍀', '⭐', '🌙',
    '❤️', '💎', '🔥', '⚡', '🎸', '🎺', '🎲', '🎯',
    '🦓', '🍭', '✈️', '🎄', '🎨', '👄', '✋', '🎈'
];

// =================================================================
// 預設設定
// =================================================================
const DEFAULT_SETTINGS = {
    gridRows: 4,
    gridCols: 4,
    pointsPerMatch: 1,
    freeForAll: false,
    teams: [
        { id: 'team_a', name: 'A 隊', color: '#ef4444' },
        { id: 'team_b', name: 'B 隊', color: '#3b82f6' }
    ],
    permissions: { allowPlayerAddDecks: true }
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateId = () => Math.random().toString(36).substring(2, 10);

// =================================================================
// 主元件
// =================================================================
export default function MemoryGame({ onBack, getNow, currentUser, isAdmin }) {
    const [user, setUser] = useState(currentUser || null);
    const [view, setView] = useState('lobby');
    const [roomId, setRoomId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [loading, setLoading] = useState(false);

    const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
    const [showSettings, setShowSettings] = useState(false);

    const getCurrentTime = () => {
        if (typeof getNow === 'function') return getNow();
        return Date.now();
    };

    useEffect(() => {
        document.title = "極限記憶 | Party Game";
        console.log('[MemoryGame] 元件已載入');
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                console.log('[MemoryGame] 使用者已登入:', u.uid.slice(0, 5));
                setUser(u);
            } else {
                console.log('[MemoryGame] 未登入，嘗試匿名登入...');
                signInAnonymously(auth).catch(console.error);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user || !roomId) return;
        console.log(`[MemoryGame] 監聽房間: memory_room_${roomId}`);

        const unsubscribe = onSnapshot(doc(db, 'memory_rooms', `memory_room_${roomId}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log('[MemoryGame] 房間資料更新:', data.status);
                setRoomData(data);

                const amIInRoom = data.players?.some(p => p.id === user.uid);
                // ★ 觀戰者保護：不要踢出觀戰者
                if (!amIInRoom && view !== 'lobby') {
                    alert("你已被踢出房間或房間已重置");
                    setView('lobby'); setRoomData(null); return;
                }

                // ★ 斷線重連修復：只要玩家在名單中，就根據遊戲狀態切換畫面
                if (data.status === 'playing' && amIInRoom) setView('game');
                if (data.status === 'finished' && amIInRoom) setView('result');
                if (data.status === 'waiting' && amIInRoom && view !== 'lobby') setView('room');
            } else if (view !== 'lobby') {
                alert("房間已關閉");
                setView('lobby');
                setRoomData(null);
            }
        });
        return () => unsubscribe();
    }, [user, roomId, view]);

    const checkAndLeaveOldRoom = async (uid, newRoomId) => {
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const oldRoomId = userSnap.data().currentMemoryRoomId;
                if (oldRoomId && oldRoomId !== newRoomId) {
                    console.log('[MemoryGame] 離開舊房間:', oldRoomId);
                    const oldRoomRef = doc(db, 'memory_rooms', `memory_room_${oldRoomId}`);
                    await runTransaction(db, async (transaction) => {
                        const oldRoomDoc = await transaction.get(oldRoomRef);
                        if (!oldRoomDoc.exists()) return;
                        const data = oldRoomDoc.data();
                        const newPlayers = data.players.filter(p => p.id !== uid);
                        if (newPlayers.length === 0) {
                            transaction.delete(oldRoomRef);
                        } else {
                            const updates = { players: newPlayers };
                            if (data.hostId === uid) updates.hostId = newPlayers[0].id;
                            transaction.update(oldRoomRef, updates);
                        }
                    });
                }
            }
            await setDoc(userRef, { currentMemoryRoomId: newRoomId }, { merge: true });
        } catch (e) {
            console.error("[MemoryGame] 清理舊房間失敗:", e);
        }
    };

    const createRoom = async () => {
        if (!playerName.trim()) return alert("請輸入名字");
        setLoading(true);
        console.log('[MemoryGame] 建立房間...');
        try {
            const newRoomId = generateRoomId();
            await checkAndLeaveOldRoom(user.uid, newRoomId);
            const me = { id: user.uid, name: playerName, team: null, isHost: true };

            await setDoc(doc(db, 'memory_rooms', `memory_room_${newRoomId}`), {
                id: newRoomId,
                hostId: user.uid,
                status: 'waiting',
                players: [me],
                settings: DEFAULT_SETTINGS,
                scores: {},
                cards: [],
                currentTeamIndex: 0,
                flippedCards: [],
                matchedPairs: 0,
                totalPairs: 0,
                useDefaultEmojis: true,
                customDecks: []
            });

            console.log('[MemoryGame] 房間已建立:', newRoomId);
            setRoomId(newRoomId);
            setView('room');
        } catch (e) {
            console.error('[MemoryGame] 建立失敗:', e);
            alert("建立失敗: " + e.message);
        }
        setLoading(false);
    };

    const joinRoom = async () => {
        if (!playerName.trim() || !roomId.trim()) return alert("請輸入資料");
        setLoading(true);
        console.log('[MemoryGame] 加入房間:', roomId);
        try {
            const rId = roomId.toUpperCase();
            await checkAndLeaveOldRoom(user.uid, rId);
            const roomRef = doc(db, 'memory_rooms', `memory_room_${rId}`);


            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists()) throw new Error("房間不存在");
                const data = roomDoc.data();
                const currentPlayers = data.players || [];
                const playerIndex = currentPlayers.findIndex(p => p.id === user.uid);
                const isExistingPlayer = playerIndex >= 0;

                // ★ 阻擋中途加入：遊戲進行中的新玩家無法加入
                if (data.status !== 'waiting' && !isExistingPlayer) {
                    throw new Error("遊戲已經開始，請等待下一局！");
                }

                const newPlayer = { id: user.uid, name: playerName, team: null, isHost: false };
                let newPlayersList;
                if (isExistingPlayer) {
                    newPlayersList = [...currentPlayers];
                    newPlayersList[playerIndex] = { ...newPlayersList[playerIndex], name: playerName };
                } else {
                    newPlayersList = [...currentPlayers, newPlayer];
                }
                transaction.update(roomRef, { players: newPlayersList });
            });

            console.log('[MemoryGame] 成功加入房間');

            setRoomId(rId);
            setView('room');
        } catch (e) {
            console.error('[MemoryGame] 加入失敗:', e);
            alert("加入失敗: " + e.message);
        }
        setLoading(false);
    };

    const leaveRoom = async () => {
        if (!window.confirm("確定離開房間？")) return;
        console.log('[MemoryGame] 離開房間');
        try {
            const ref = doc(db, 'memory_rooms', `memory_room_${roomId}`);
            const newPlayers = roomData.players.filter(p => p.id !== user.uid);
            await updateDoc(doc(db, 'users', user.uid), { currentMemoryRoomId: null });
            if (newPlayers.length === 0) {
                await deleteDoc(ref);
            } else {
                if (roomData.hostId === user.uid) {
                    await updateDoc(ref, { players: newPlayers, hostId: newPlayers[0].id });
                } else {
                    await updateDoc(ref, { players: newPlayers });
                }
            }
        } catch (e) { console.error("[MemoryGame] 離開錯誤", e); }
        setView('lobby');
        setRoomId('');
        setRoomData(null);

    };

    if (view === 'lobby') {
        return (
            <MemoryLobbyView
                onBack={onBack}
                playerName={playerName}
                setPlayerName={setPlayerName}
                roomId={roomId}
                setRoomId={setRoomId}
                createRoom={createRoom}
                joinRoom={joinRoom}
                loading={loading}
                user={user}
            />
        );
    }

    if (!roomData) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full"></div>
                <span className="ml-3">載入中...</span>
            </div>
        );
    }

    const isHost = roomData.hostId === user?.uid;

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            <header className="bg-slate-800 border-b border-slate-700 p-3 flex justify-between items-center z-20 sticky top-0">
                <div className="flex items-center gap-2">
                    <button onClick={leaveRoom} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <LogOut size={20} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">房間代碼</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-emerald-400 text-lg">
                            {roomData.id}
                            <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-slate-500 hover:text-emerald-400">
                                <ClipboardCopy size={14} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end mr-2">
                        <span className="text-xs text-slate-500">玩家</span>
                        <span className="font-bold text-white">{user.isAnonymous ? playerName : user.displayName || playerName}</span>
                    </div>
                    {isHost && view === 'room' && (
                        <button
                            onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-sm font-medium transition"
                        >
                            <Settings size={16} /> 設定
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
                {view === 'room' && (
                    <MemoryRoomView
                        roomData={roomData}
                        isHost={isHost}
                        isAdmin={isAdmin}
                        roomId={roomId}
                        currentUser={user}
                        getCurrentTime={getCurrentTime}
                    />
                )}
                {view === 'game' && (
                    <MemoryGameInterface
                        roomData={roomData}
                        roomId={roomId}
                        currentUser={user}
                        getNow={getCurrentTime}
                    />
                )}
                {view === 'result' && (
                    <MemoryResultView
                        roomData={roomData}
                        isHost={isHost}
                        roomId={roomId}
                    />
                )}
            </main>

            {showSettings && (
                <MemorySettingsModal
                    localSettings={localSettings}
                    setLocalSettings={setLocalSettings}
                    setShowSettings={setShowSettings}
                    roomData={roomData}
                    onSave={async () => {
                        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { settings: localSettings });
                        setShowSettings(false);
                    }}
                />
            )}
        </div>
    );
}

// =================================================================
// Lobby View
// =================================================================
function MemoryLobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
                <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors">
                    <ArrowLeft />
                </button>
                <div className="text-center pt-6">
                    <div className="text-6xl mb-4">🃏🎴</div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-cyan-500">
                        極限記憶
                    </h1>
                    <p className="text-white/60 text-sm mt-1">翻牌配對，考驗你的記憶力！</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-white/70 ml-1">你的名字</label>
                        <input
                            value={playerName}
                            onChange={e => setPlayerName(e.target.value)}
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none placeholder-white/30 text-white"
                            placeholder="例如：翻牌大師"
                        />
                        {user && <div className="text-[10px] text-white/40 mt-1 text-right font-mono">ID: {user.uid.slice(0, 5)}...</div>}
                    </div>
                    <button
                        onClick={createRoom}
                        disabled={loading || !user}
                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95 disabled:opacity-50"
                    >
                        建立新房間
                    </button>
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-2 text-white/40">或是加入房間</span></div>
                    </div>
                    <div className="flex gap-2">
                        <input
                            value={roomId}
                            onChange={e => setRoomId(e.target.value.toUpperCase())}
                            className="flex-1 px-4 py-3 bg-black/30 border border-white/10 rounded-xl uppercase text-center font-mono tracking-widest placeholder-white/30 text-white"
                            placeholder="房間 ID"
                        />
                        <button
                            onClick={joinRoom}
                            disabled={loading || !user}
                            className="px-6 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-bold transition disabled:opacity-50"
                        >
                            加入
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Room View
// =================================================================
function MemoryRoomView({ roomData, isHost, isAdmin, roomId, currentUser, getCurrentTime }) {
    const [editingTeamName, setEditingTeamName] = useState(null);
    const [draggedPlayer, setDraggedPlayer] = useState(null);
    const [showCloudLibrary, setShowCloudLibrary] = useState(false);
    const [showAddDeck, setShowAddDeck] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [newDeckPairs, setNewDeckPairs] = useState('');
    const [editingDeck, setEditingDeck] = useState(null);
    const csvInputRef = useRef(null);

    const players = roomData.players || [];
    const teams = roomData.settings.teams || [];
    const unassigned = players.filter(p => !p.team);
    const customDecks = roomData.customDecks || [];

    // 使用 gridRows 和 gridCols
    const gridRows = roomData.settings.gridRows || 4;
    const gridCols = roomData.settings.gridCols || 4;
    const totalCards = gridRows * gridCols;
    const totalPairs = totalCards / 2;

    // 計算可用題庫數量
    const getAvailablePairs = () => {
        let count = 0;
        if (roomData.useDefaultEmojis !== false) count += DEFAULT_EMOJI_PAIRS.length;
        customDecks.forEach(d => { if (d.enabled !== false) count += (d.pairs?.length || 0); });
        return count;
    };

    const availablePairs = getAvailablePairs();
    const isEvenGrid = totalCards % 2 === 0;
    const canStart = isEvenGrid && availablePairs >= totalPairs && (roomData.settings.freeForAll || players.filter(p => p.team).length >= 1);

    const allTeamPlayers = (teamId) => players.filter(p => p.team === teamId);

    // 開始遊戲
    const startGame = async () => {
        console.log('[MemoryRoomView] 開始遊戲');

        // 個人賽模式：自動建立隊伍
        let finalTeams = [...teams];
        let updatedPlayers = [...players];

        if (roomData.settings.freeForAll) {
            const colors = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899', '#84cc16'];
            finalTeams = players.map((p, i) => ({
                id: `player_${p.id}`,
                name: p.name,
                color: colors[i % colors.length]
            }));
            updatedPlayers = players.map(p => ({ ...p, team: `player_${p.id}` }));
        }

        // 收集所有可用的 Emoji
        let allEmojis = [];
        if (roomData.useDefaultEmojis !== false) {
            allEmojis = [...DEFAULT_EMOJI_PAIRS];
        }
        customDecks.forEach(d => {
            if (d.enabled && d.pairs) allEmojis.push(...d.pairs);
        });

        // 隨機選取足夠數量的配對
        const shuffledEmojis = allEmojis.sort(() => Math.random() - 0.5);
        const selectedEmojis = shuffledEmojis.slice(0, totalPairs);

        // 建立卡片陣列 (每個 Emoji 兩張)
        const cards = [];
        selectedEmojis.forEach((emoji, idx) => {
            cards.push({ id: `card_${idx}_a`, content: emoji, pairId: idx, isFlipped: false, isMatched: false });
            cards.push({ id: `card_${idx}_b`, content: emoji, pairId: idx, isFlipped: false, isMatched: false });
        });

        // 洗牌
        const shuffledCards = cards.sort(() => Math.random() - 0.5);

        // 初始化分數
        const initialScores = {};
        finalTeams.forEach(t => initialScores[t.id] = 0);

        // ★★★ 新增：建立 turnOrder 與 currentMemberIndices ★★★
        const turnOrder = {};
        const currentMemberIndices = {};

        finalTeams.forEach(team => {
            // 取得該隊所有成員 (使用更新後的 players)
            const teamMembers = updatedPlayers.filter(p => p.team === team.id).map(p => p.id);
            // 隨機打亂順序
            const shuffledMembers = teamMembers.sort(() => Math.random() - 0.5);
            turnOrder[team.id] = shuffledMembers;
            currentMemberIndices[team.id] = 0;
        });

        console.log('[MemoryRoomView] turnOrder:', turnOrder);
        console.log('[MemoryRoomView] currentMemberIndices:', currentMemberIndices);

        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            status: 'playing',
            cards: shuffledCards,
            currentTeamIndex: 0,
            flippedCards: [],
            matchedPairs: 0,
            totalPairs: totalPairs,
            scores: initialScores,
            'settings.teams': finalTeams,
            players: updatedPlayers,
            lastAction: null,
            // ★ 新增欄位
            turnOrder: turnOrder,
            currentMemberIndices: currentMemberIndices
        });
    };

    // 隨機分組
    const randomize = async () => {
        console.log('[MemoryRoomView] 隨機分組');
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const teamIds = teams.map(t => t.id);
        const newPlayers = shuffled.map((p, i) => ({ ...p, team: teamIds[i % teamIds.length] }));
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { players: newPlayers });
    };

    const changePlayerTeam = async (playerId, newTeamId) => {
        const newPlayers = players.map(p => p.id === playerId ? { ...p, team: newTeamId } : p);
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { players: newPlayers });
    };

    const kickPlayer = async (targetId) => {
        if (!window.confirm("確定要踢出這位玩家嗎？")) return;
        const newPlayers = players.filter(p => p.id !== targetId);
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { players: newPlayers });
    };

    const makeHost = async (targetId) => {
        if (!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { hostId: targetId });
    };

    const updateTeamName = async (teamId, newName) => {
        const newTeams = teams.map(t => t.id === teamId ? { ...t, name: newName } : t);
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { 'settings.teams': newTeams });
        setEditingTeamName(null);
    };

    const addTeam = async () => {
        const colors = ['#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
        const newTeam = {
            id: generateId(),
            name: `${String.fromCharCode(65 + teams.length)} 隊`,
            color: colors[teams.length % colors.length]
        };
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            'settings.teams': [...teams, newTeam]
        });
    };

    const removeTeam = async (teamId) => {
        if (teams.length <= 2) return alert("至少需要 2 個隊伍！");
        const newTeams = teams.filter(t => t.id !== teamId);
        const newPlayers = players.map(p => p.team === teamId ? { ...p, team: null } : p);
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            'settings.teams': newTeams,
            players: newPlayers
        });
    };

    const handleDragStart = (e, player) => {
        setDraggedPlayer(player);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, teamId) => {
        e.preventDefault();
        if (draggedPlayer) {
            changePlayerTeam(draggedPlayer.id, teamId);
            setDraggedPlayer(null);
        }
    };

    const toggleDefaultEmojis = async () => {
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            useDefaultEmojis: !(roomData.useDefaultEmojis !== false)
        });
    };

    const importCloudDeck = async (deck) => {
        const newDeck = {
            id: deck.id,
            name: deck.name,
            enabled: true,
            pairs: deck.pairs || []
        };
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            customDecks: [...customDecks, newDeck]
        });
        setShowCloudLibrary(false);
    };

    // ★ 題庫啟用/停用切換 (僅主持人可操作)
    const toggleDeck = async (deckId) => {
        if (!isHost) return;
        console.log('[MemoryRoomView] toggleDeck:', deckId);
        const newDecks = customDecks.map(d => {
            if (d.id === deckId) {
                return { ...d, enabled: d.enabled === false ? true : false };
            }
            return d;
        });
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            customDecks: newDecks
        });
    };

    const PlayerItem = ({ p, showKick, showPromote }) => (
        <div
            draggable={isHost}
            onDragStart={(e) => handleDragStart(e, p)}
            className={`flex items-center gap-2 p-2 rounded-lg transition-all ${isHost ? 'cursor-grab hover:bg-slate-600/50' : ''} ${p.id === currentUser.uid ? 'bg-emerald-500/20 border border-emerald-500/30' : 'bg-slate-700/50'}`}
        >
            <span className="flex-1 truncate text-white">{p.name}</span>
            {p.id === roomData.hostId && <Crown size={14} className="text-yellow-400" />}
            {isHost && showKick && p.id !== roomData.hostId && (
                <button onClick={() => kickPlayer(p.id)} className="p-1 hover:bg-red-500/30 rounded text-red-400"><X size={14} /></button>
            )}
            {isHost && showPromote && p.id !== roomData.hostId && (
                <button onClick={() => makeHost(p.id)} className="p-1 hover:bg-yellow-500/30 rounded text-yellow-400"><Crown size={14} /></button>
            )}
        </div>
    );

    return (
        <>
            <div className="flex-1 p-4 md:p-8 text-white">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 左側：隊伍與遊戲設定 */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* 遊戲資訊 */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <div className="flex flex-wrap gap-4 items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <LayoutGrid className="text-emerald-400" />
                                        <span>網格：{gridRows}x{gridCols} ({totalPairs} 對)</span>
                                    </div>
                                    <div className="text-slate-400">|</div>
                                    <div>可用題庫：{availablePairs} 對</div>
                                </div>
                                {roomData.settings.freeForAll && (
                                    <span className="px-3 py-1 bg-purple-500/30 text-purple-300 rounded-full text-sm">個人賽模式</span>
                                )}
                            </div>
                            {!isEvenGrid && (
                                <div className="mt-3 p-3 bg-red-500/20 text-red-300 rounded-lg text-sm">
                                    ⚠️ 網格總數 ({totalCards}) 必須是偶數才能成對！
                                </div>
                            )}
                        </div>

                        {/* 隊伍區域 (非個人賽模式) */}
                        {!roomData.settings.freeForAll && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* 未分配區 */}
                                <div
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, null)}
                                    className="bg-slate-800/50 border border-dashed border-slate-600 rounded-xl p-4 min-h-[150px]"
                                >
                                    <h3 className="font-bold text-slate-400 mb-3">未分配</h3>
                                    <div className="space-y-2">
                                        {unassigned.map(p => <PlayerItem key={p.id} p={p} showKick showPromote />)}
                                    </div>
                                </div>

                                {/* 各隊伍 */}
                                {teams.map(team => (
                                    <div
                                        key={team.id}
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, team.id)}
                                        className="border rounded-xl p-4 min-h-[150px]"
                                        style={{ borderColor: team.color, backgroundColor: `${team.color}15` }}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            {editingTeamName === team.id ? (
                                                <input
                                                    autoFocus
                                                    defaultValue={team.name}
                                                    onBlur={(e) => updateTeamName(team.id, e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && updateTeamName(team.id, e.target.value)}
                                                    className="bg-transparent border-b border-white/30 outline-none text-white font-bold"
                                                />
                                            ) : (
                                                <h3 className="font-bold cursor-pointer hover:opacity-80" style={{ color: team.color }} onClick={() => isHost && setEditingTeamName(team.id)}>
                                                    {team.name}
                                                </h3>
                                            )}
                                            {isHost && teams.length > 2 && (
                                                <button onClick={() => removeTeam(team.id)} className="text-red-400 hover:bg-red-500/20 p-1 rounded"><X size={14} /></button>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            {allTeamPlayers(team.id).map(p => <PlayerItem key={p.id} p={p} showKick />)}
                                        </div>
                                    </div>
                                ))}

                                {/* 新增隊伍按鈕 */}
                                {isHost && teams.length < 6 && (
                                    <button onClick={addTeam} className="border-2 border-dashed border-slate-600 rounded-xl p-4 min-h-[150px] flex items-center justify-center text-slate-500 hover:border-emerald-500 hover:text-emerald-400 transition-colors">
                                        <Plus size={24} className="mr-2" /> 新增隊伍
                                    </button>
                                )}
                            </div>
                        )}

                        {/* 個人賽模式：玩家列表 */}
                        {roomData.settings.freeForAll && (
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                <h3 className="font-bold text-emerald-400 mb-3">參賽玩家 ({players.length} 人)</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    {players.map(p => <PlayerItem key={p.id} p={p} showKick={isHost} />)}
                                </div>
                            </div>
                        )}

                        {/* 操作按鈕 */}
                        {isHost && !roomData.settings.freeForAll && (
                            <div className="flex gap-3 flex-wrap">
                                <button onClick={randomize} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition">
                                    <Shuffle size={16} /> 隨機分組
                                </button>
                            </div>
                        )}

                        {/* 題庫設定 */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <h3 className="font-bold text-emerald-400 mb-3 flex items-center gap-2">
                                <Library size={18} /> 題庫設定
                            </h3>
                            <div className="space-y-3">
                                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/50">
                                    <input
                                        type="checkbox"
                                        checked={roomData.useDefaultEmojis !== false}
                                        onChange={toggleDefaultEmojis}
                                        disabled={!isHost}
                                        className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500"
                                    />
                                    <span>內建 Emoji 題庫 ({DEFAULT_EMOJI_PAIRS.length} 對)</span>
                                </label>

                                {customDecks.map(deck => (
                                    <div key={deck.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-700/30">
                                        <div className="flex items-center gap-3">
                                            {/* ★ 題庫啟用/停用切換按鈕 */}
                                            <button
                                                onClick={() => toggleDeck(deck.id)}
                                                disabled={!isHost}
                                                className={`w-5 h-5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${deck.enabled !== false
                                                    ? 'bg-emerald-500 border-emerald-500'
                                                    : 'border-slate-500 bg-transparent'
                                                    } ${!isHost ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                                                title={deck.enabled !== false ? '已啟用 (點擊停用)' : '已停用 (點擊啟用)'}
                                            >
                                                {deck.enabled !== false && <Check size={14} className="text-white" />}
                                            </button>
                                            <Cloud className="text-cyan-400" size={16} />
                                            <span className={deck.enabled === false ? 'text-slate-500 line-through' : ''}>
                                                {deck.name} ({deck.pairs?.length || 0} 對)
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {/* 編輯按鈕：主持人或有權限者可見 */}
                                            {(isHost || roomData.settings.permissions?.allowPlayerAddDecks) && (
                                                <button
                                                    onClick={() => setEditingDeck(deck)}
                                                    className="text-cyan-400 hover:bg-cyan-500/20 p-1 rounded"
                                                    title="編輯題庫"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            {/* 刪除按鈕：僅主持人 */}
                                            {isHost && (
                                                <button
                                                    onClick={async () => {
                                                        const newDecks = customDecks.filter(d => d.id !== deck.id);
                                                        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { customDecks: newDecks });
                                                    }}
                                                    className="text-red-400 hover:bg-red-500/20 p-1 rounded"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {isHost && (
                                    <button
                                        onClick={() => setShowCloudLibrary(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition"
                                    >
                                        <Download size={16} /> 從雲端匯入題庫
                                    </button>
                                )}
                            </div>

                            {availablePairs < totalPairs && (
                                <div className="mt-3 p-3 bg-red-500/20 text-red-300 rounded-lg text-sm">
                                    ⚠️ 題庫不足！需要至少 {totalPairs} 對，目前只有 {availablePairs} 對。請減小網格或新增題庫。
                                </div>
                            )}
                        </div>

                        {/* 開始遊戲 */}
                        {isHost && (
                            <button
                                onClick={startGame}
                                disabled={!canStart}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white rounded-xl font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-[1.02]"
                            >
                                <Play className="inline mr-2" /> 開始遊戲
                            </button>
                        )}

                        {/* 雲端題庫 Modal */}
                        {showCloudLibrary && (
                            <MemoryCloudLibraryModal
                                onClose={() => setShowCloudLibrary(false)}
                                onImport={importCloudDeck}
                                currentUser={currentUser}
                                isAdmin={isAdmin}
                            />
                        )}
                    </div>

                    {/* 右側：遊戲資訊與玩法面板 */}
                    <div className="space-y-6">
                        {/* 📊 遊戲資訊 */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <h3 className="font-bold text-emerald-400 mb-3">📊 遊戲資訊</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-slate-400">網格大小</span><span className="font-bold">{gridRows} x {gridCols}</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">總卡片數</span><span className="font-bold">{totalCards} 張</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">需配對數</span><span className="font-bold">{totalPairs} 對</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">可用題庫</span><span className={`font-bold ${availablePairs >= totalPairs ? 'text-emerald-400' : 'text-red-400'}`}>{availablePairs} 對</span></div>
                                <div className="flex justify-between"><span className="text-slate-400">配對得分</span><span className="font-bold">{roomData.settings.pointsPerMatch || 1} 分</span></div>
                            </div>
                        </div>

                        {/* 📖 遊戲玩法 */}
                        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                            <h3 className="font-bold text-emerald-400 mb-3">📖 遊戲玩法</h3>
                            <div className="text-slate-300 text-sm space-y-2">
                                <p>1️⃣ 輪到你時，翻開兩張牌</p>
                                <p>2️⃣ 若圖案相同，得分並繼續翻牌</p>
                                <p>3️⃣ 若圖案不同，換下一隊</p>
                                <p>4️⃣ 翻完後分數最高者獲勝！</p>
                            </div>
                        </div>

                        {/* 新增自訂題庫 (主持人限定) */}
                        {isHost && (
                            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                                <h3 className="font-bold text-cyan-400 mb-3"><Plus size={16} className="inline mr-1" />新增自訂題庫</h3>
                                {!showAddDeck ? (
                                    <button onClick={() => setShowAddDeck(true)} className="w-full py-2 border-2 border-dashed border-slate-600 rounded-lg text-slate-400 hover:border-cyan-500 hover:text-cyan-400 transition">
                                        + 新增 / CSV 匯入
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm" placeholder="題庫名稱" />
                                        <textarea value={newDeckPairs} onChange={(e) => setNewDeckPairs(e.target.value)} className="w-full h-20 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono" placeholder="每行一組 (A|B 或 A)" />
                                        <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={async (e) => {
                                            const file = e.target.files?.[0]; if (!file) return;
                                            setNewDeckPairs(await file.text()); setNewDeckName(file.name.replace('.csv', ''));
                                        }} />
                                        <div className="flex gap-2">
                                            <button onClick={() => csvInputRef.current?.click()} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">匯入 CSV</button>
                                            <button onClick={async () => {
                                                if (!newDeckName.trim() || !newDeckPairs.trim()) return;
                                                const pairs = newDeckPairs.split('\n').filter(l => l.trim()).map(l => l.split('|')[0].trim());
                                                const newDeck = { id: generateId(), name: newDeckName, enabled: true, pairs };
                                                await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { customDecks: [...customDecks, newDeck] });
                                                setNewDeckName(''); setNewDeckPairs(''); setShowAddDeck(false);
                                            }} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg text-sm font-bold">新增</button>
                                        </div>
                                        {/* Admin 限定：同步上傳至雲端 */}
                                        {isAdmin && (
                                            <button
                                                onClick={async () => {
                                                    if (!newDeckName.trim() || !newDeckPairs.trim()) return alert("請填寫題庫名稱和內容");
                                                    const pairs = newDeckPairs.split('\n').filter(l => l.trim()).map(l => l.split('|')[0].trim());
                                                    const newDeck = { id: generateId(), name: newDeckName, enabled: true, pairs };
                                                    // 同時更新本地房間
                                                    await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { customDecks: [...customDecks, newDeck] });
                                                    // 上傳至雲端
                                                    await addDoc(collection(db, 'memory_cloud_decks'), {
                                                        name: newDeckName,
                                                        pairs: pairs,
                                                        pairCount: pairs.length,
                                                        authorId: currentUser?.uid || 'anon',
                                                        authorName: currentUser?.displayName || '匿名',
                                                        createdAt: serverTimestamp()
                                                    });
                                                    alert("已同步至雲端！");
                                                    setNewDeckName(''); setNewDeckPairs(''); setShowAddDeck(false);
                                                }}
                                                className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg text-sm font-bold"
                                            >
                                                ☁️ 新增並上傳至雲端
                                            </button>
                                        )}
                                        <button onClick={() => { setShowAddDeck(false); setNewDeckName(''); setNewDeckPairs(''); }} className="w-full py-1 text-slate-400 text-sm">取消</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 題庫編輯 Modal */}
            {editingDeck && (
                <MemoryDeckEditorModal
                    deck={editingDeck}
                    customDecks={customDecks}
                    roomId={roomId}
                    isHost={isHost}
                    isAdmin={isAdmin}
                    currentUser={currentUser}
                    onClose={() => setEditingDeck(null)}
                    onUpdate={(updatedDeck) => setEditingDeck(updatedDeck)}
                />
            )}
        </>
    );
}

// =================================================================
// Cloud Library Modal
// =================================================================
function MemoryCloudLibraryModal({ onClose, onImport, currentUser, isAdmin }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadMode, setUploadMode] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [newDeckPairs, setNewDeckPairs] = useState('');

    useEffect(() => { fetchDecks(); }, []);

    const fetchDecks = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'memory_cloud_decks'), orderBy('createdAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            setDecks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('[MemoryCloudLibrary] 載入失敗:', e); }
        setLoading(false);
    };

    const uploadDeck = async () => {
        if (!newDeckName.trim() || !newDeckPairs.trim()) return alert("請填寫題庫名稱和 Emoji");
        try {
            const pairs = newDeckPairs.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
            if (pairs.length < 2) return alert("至少需要 2 個 Emoji！");
            await addDoc(collection(db, 'memory_cloud_decks'), {
                name: newDeckName, pairs, pairCount: pairs.length,
                authorId: currentUser?.uid || 'anon',
                authorName: currentUser?.displayName || '匿名',
                createdAt: serverTimestamp()
            });
            alert(`上傳成功！${pairs.length} 對`);
            setNewDeckName(''); setNewDeckPairs(''); setUploadMode(false); fetchDecks();
        } catch (e) { alert("上傳失敗: " + e.message); }
    };

    const deleteDeck = async (id) => {
        if (!window.confirm("確定刪除？")) return;
        await deleteDoc(doc(db, 'memory_cloud_decks', id)); fetchDecks();
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-2xl max-h-[80vh] rounded-2xl p-6 border border-slate-700 flex flex-col">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2"><Cloud className="text-cyan-400" /> 極限記憶雲端題庫</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
                </div>
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setUploadMode(false)} className={`flex-1 py-2 rounded-lg font-medium ${!uploadMode ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>瀏覽題庫</button>
                    {isAdmin && <button onClick={() => setUploadMode(true)} className={`flex-1 py-2 rounded-lg font-medium ${uploadMode ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>上傳新題庫</button>}
                </div>
                {uploadMode && isAdmin ? (
                    <div className="space-y-4 flex-1 overflow-y-auto">
                        <div><label className="text-sm text-slate-300 mb-1 block">題庫名稱</label>
                            <input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" placeholder="例如：動物配對" /></div>
                        <div><label className="text-sm text-slate-300 mb-1 block">Emoji 列表 (每行一個或用逗號分隔)</label>
                            <textarea value={newDeckPairs} onChange={(e) => setNewDeckPairs(e.target.value)} className="w-full h-40 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-2xl" placeholder="🐶&#10;🐱&#10;🐭&#10;🐹" /></div>
                        <button onClick={uploadDeck} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-bold">上傳題庫</button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-3">
                        {loading ? <div className="text-center py-8 text-slate-400">載入中...</div> :
                            decks.length === 0 ? <div className="text-center py-8 text-slate-400">尚無雲端題庫</div> :
                                decks.map(deck => (
                                    <div key={deck.id} className="p-4 bg-slate-700/50 rounded-xl border border-slate-600 flex items-center justify-between">
                                        <div><div className="text-white font-bold">{deck.name}</div><div className="text-slate-400 text-sm">{deck.pairCount || deck.pairs?.length || 0} 對 · {deck.authorName}</div></div>
                                        <div className="flex gap-2">
                                            <button onClick={() => onImport(deck)} className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium hover:bg-green-500/30 flex items-center gap-1"><Download size={16} /> 匯入</button>
                                            {isAdmin && <button onClick={() => deleteDeck(deck.id)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg"><Trash2 size={16} /></button>}
                                        </div>
                                    </div>
                                ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// =================================================================
// Deck Editor Modal
// =================================================================
function MemoryDeckEditorModal({ deck, customDecks, roomId, isHost, isAdmin, currentUser, onClose, onUpdate }) {
    const [pairs, setPairs] = useState(deck.pairs || []);
    const [newPairA, setNewPairA] = useState('');
    const [newPairB, setNewPairB] = useState('');
    const [csvText, setCsvText] = useState('');
    const [showCsvImport, setShowCsvImport] = useState(false);

    console.log('[MemoryDeckEditorModal] 開啟編輯:', deck.name, pairs.length, '對');

    // 儲存到 Firestore
    const saveDeck = async (updatedPairs) => {
        console.log('[MemoryDeckEditorModal] 儲存題庫:', updatedPairs.length, '對');
        const updatedDeck = { ...deck, pairs: updatedPairs };
        const newCustomDecks = customDecks.map(d => d.id === deck.id ? updatedDeck : d);
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), { customDecks: newCustomDecks });
        setPairs(updatedPairs);
        onUpdate(updatedDeck);
    };

    // 新增配對
    const addPair = () => {
        const a = newPairA.trim();
        const b = newPairB.trim() || a;
        if (!a) return;
        console.log('[MemoryDeckEditorModal] 新增配對:', a, '|', b);
        const newPairs = [...pairs, { id: generateId(), a, b }];
        saveDeck(newPairs);
        setNewPairA('');
        setNewPairB('');
    };

    // 刪除配對
    const deletePair = (pairId) => {
        console.log('[MemoryDeckEditorModal] 刪除配對:', pairId);
        const newPairs = pairs.filter(p => p.id !== pairId);
        saveDeck(newPairs);
    };

    // CSV 匯入
    const importCSV = () => {
        const lines = csvText.split('\n').filter(l => l.trim());
        const imported = lines.map(line => {
            const parts = line.split(/[,|]/).map(s => s.trim());
            return { id: generateId(), a: parts[0] || '', b: parts[1] || parts[0] || '' };
        }).filter(p => p.a);
        console.log('[MemoryDeckEditorModal] CSV 匯入:', imported.length, '對');
        if (imported.length > 0) {
            saveDeck([...pairs, ...imported]);
            setCsvText('');
            setShowCsvImport(false);
        }
    };

    // Admin 上傳到雲端
    const uploadToCloud = async () => {
        console.log('[MemoryDeckEditorModal] 上傳至雲端:', deck.name);
        await addDoc(collection(db, 'memory_cloud_decks'), {
            name: deck.name,
            pairs: pairs,
            pairCount: pairs.length,
            authorId: currentUser?.uid || 'anon',
            authorName: currentUser?.displayName || '匿名',
            createdAt: serverTimestamp()
        });
        alert('已上傳至雲端！');
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Edit className="text-cyan-400" size={20} />
                            編輯題庫：{deck.name}
                        </h2>
                        <p className="text-slate-400 text-sm">目前 {pairs.length} 對</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* 新增配對 */}
                <div className="p-4 border-b border-slate-700">
                    <div className="flex gap-2">
                        <input
                            value={newPairA}
                            onChange={(e) => setNewPairA(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addPair()}
                            placeholder="配對 A (例如: 🍎)"
                            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-2xl text-center"
                        />
                        <input
                            value={newPairB}
                            onChange={(e) => setNewPairB(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addPair()}
                            placeholder="配對 B (選填)"
                            className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-2xl text-center"
                        />
                        <button onClick={addPair} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-bold">
                            <Plus size={20} />
                        </button>
                    </div>
                </div>

                {/* 配對列表 */}
                <div className="flex-1 overflow-y-auto p-4">
                    {pairs.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">尚無配對，請新增題目</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {pairs.map(pair => (
                                <div key={pair.id} className="relative group p-3 bg-slate-700/50 rounded-lg border border-slate-600 text-center">
                                    <div className="text-2xl">{pair.a}</div>
                                    {pair.b && pair.b !== pair.a && <div className="text-sm text-slate-400">↔ {pair.b}</div>}
                                    {(isHost || isAdmin) && (
                                        <button
                                            onClick={() => deletePair(pair.id)}
                                            className="absolute -top-1 -right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 工具列 */}
                <div className="p-4 border-t border-slate-700 space-y-3">
                    {showCsvImport ? (
                        <div className="space-y-2">
                            <textarea
                                value={csvText}
                                onChange={(e) => setCsvText(e.target.value)}
                                placeholder="每行一組配對，用逗號或 | 分隔"
                                className="w-full h-32 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono"
                            />
                            <div className="flex gap-2">
                                <button onClick={importCSV} className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-bold">匯入</button>
                                <button onClick={() => setShowCsvImport(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg">取消</button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={() => setShowCsvImport(true)} className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium">
                                📄 CSV 匯入
                            </button>
                            {isAdmin && (
                                <button onClick={uploadToCloud} className="flex-1 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg font-medium">
                                    ☁️ 上傳至雲端
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
// Game Interface
// =================================================================
function MemoryGameInterface({ roomData, roomId, currentUser, getNow }) {
    const [flippedIds, setFlippedIds] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    // ★ 移除 showMatch/showMismatch state (簡化 UI)

    const cards = roomData.cards || [];
    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};
    const currentTeamIndex = roomData.currentTeamIndex || 0;
    const currentTeam = teams[currentTeamIndex];
    const gridCols = roomData.settings.gridCols || 4;
    const matchedPairs = roomData.matchedPairs || 0;
    const totalPairs = roomData.totalPairs || 8;

    // ★ 根據網格大小動態調整卡片字體（保持手機可讀）
    const cardSizeClass = gridCols >= 10
        ? 'text-2xl md:text-3xl'  // 10x10: 稍微縮小但仍可讀
        : gridCols >= 8
            ? 'text-3xl md:text-4xl'  // 8x8: 中等大小
            : 'text-4xl md:text-5xl lg:text-6xl';  // 預設：大字體

    // ★★★ 嚴格輪替檢查 ★★★
    const turnOrder = roomData.turnOrder || {};
    const currentMemberIndices = roomData.currentMemberIndices || {};
    const currentTeamId = currentTeam?.id;
    const teamTurnOrder = turnOrder[currentTeamId] || [];
    const currentMemberIdx = currentMemberIndices[currentTeamId] || 0;
    const currentPlayerId = teamTurnOrder[currentMemberIdx] || null;

    // 雙重檢查：隊伍 + 個人
    const myTeam = roomData.players?.find(p => p.id === currentUser.uid)?.team;
    const isMyTeamTurn = currentTeam && myTeam === currentTeamId;
    const isMyPersonalTurn = currentPlayerId === currentUser.uid;
    const isMyTurn = isMyTeamTurn && isMyPersonalTurn;

    // 取得當前操作者的名稱
    const currentPlayerName = roomData.players?.find(p => p.id === currentPlayerId)?.name || '---';

    // 監聽 flippedCards 變化
    useEffect(() => {
        setFlippedIds(roomData.flippedCards || []);
    }, [roomData.flippedCards]);

    // ★ 移除 lastAction useEffect (不再需要動畫)

    const handleCardClick = async (card) => {
        // ★ v8.2 優化：嚴格鎖定，多重防護
        if (isProcessing) {
            console.log('[MemoryGameInterface] 鎖定中，忽略點擊');
            return;
        }
        if (card.isMatched) return;
        if (flippedIds.includes(card.id)) return;
        if (!isMyTurn) return;
        if (flippedIds.length >= 2) return;

        console.log('[MemoryGameInterface] 翻牌:', card.id);

        const newFlippedIds = [...flippedIds, card.id];
        setFlippedIds(newFlippedIds);

        // 如果翻了兩張牌
        if (newFlippedIds.length === 2) {
            // ★ 立即鎖定，防止快速點擊
            setIsProcessing(true);
            const [firstId, secondId] = newFlippedIds;
            const first = cards.find(c => c.id === firstId);
            const second = cards.find(c => c.id === secondId);

            if (first && second && first.pairId === second.pairId) {
                // ★★★ 配對成功：合併 Write 2 & Write 3 ★★★
                console.log('[MemoryGameInterface] 配對成功！合併寫入優化');

                // 立即計算結算資料
                const matchedCards = cards.map(c =>
                    newFlippedIds.includes(c.id)
                        ? { ...c, isFlipped: true, isMatched: true }
                        : c
                );
                const newScores = { ...scores };
                newScores[currentTeam.id] = (newScores[currentTeam.id] || 0) + (roomData.settings.pointsPerMatch || 1);
                const newMatchedPairs = matchedPairs + 1;

                // ★ 一次寫入：翻牌 + 結算（從 2 次寫入合併為 1 次）
                await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
                    cards: matchedCards,
                    flippedCards: newFlippedIds, // 保留讓動畫顯示
                    scores: newScores,
                    matchedPairs: newMatchedPairs,
                    lastAction: { type: 'match', teamId: currentTeam.id, timestamp: getNow() },
                    status: newMatchedPairs >= totalPairs ? 'finished' : 'playing'
                });

                // 延遲清除 flippedCards（僅用於 UI 動畫）
                setTimeout(async () => {
                    try {
                        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
                            flippedCards: []
                        });
                    } catch (e) { console.error('[MemoryGameInterface] 清除 flippedCards 失敗:', e); }
                    setIsProcessing(false);
                }, 800);
            } else {
                // 配對失敗
                console.log('[MemoryGameInterface] 配對失敗');

                // 先寫入翻第二張牌的狀態
                const newCards = cards.map(c => c.id === card.id ? { ...c, isFlipped: true } : c);
                await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
                    cards: newCards,
                    flippedCards: newFlippedIds
                });

                // 延遲後重置並換隊
                setTimeout(async () => {
                    const resetCards = cards.map(c =>
                        newFlippedIds.includes(c.id) ? { ...c, isFlipped: false } : c
                    );
                    const nextTeamIndex = (currentTeamIndex + 1) % teams.length;

                    // ★★★ 更新當前隊伍的 memberIndex (下次該隊輪到下一位) ★★★
                    const updatedMemberIndices = { ...(roomData.currentMemberIndices || {}) };
                    const currentTeamOrder = (roomData.turnOrder || {})[currentTeamId] || [];
                    if (currentTeamOrder.length > 0) {
                        updatedMemberIndices[currentTeamId] = ((updatedMemberIndices[currentTeamId] || 0) + 1) % currentTeamOrder.length;
                    }

                    await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
                        cards: resetCards,
                        flippedCards: [],
                        currentTeamIndex: nextTeamIndex,
                        currentMemberIndices: updatedMemberIndices,
                        lastAction: { type: 'mismatch', timestamp: getNow() }
                    });
                    setIsProcessing(false);
                }, 1500);
            }
        } else {
            // 翻第一張牌
            const newCards = cards.map(c => c.id === card.id ? { ...c, isFlipped: true } : c);
            await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
                cards: newCards,
                flippedCards: newFlippedIds
            });
        }
    };

    const sortedTeams = [...teams].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

    return (
        <div className="flex-1 p-4 flex flex-col items-center text-white pb-8">
            {/* 狀態列 */}
            <div className="w-full max-w-4xl flex flex-wrap justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: currentTeam?.color + '30', borderColor: currentTeam?.color, borderWidth: 2 }}>
                        <span className="font-bold" style={{ color: currentTeam?.color }}>{currentTeam?.name}</span>
                        <span className="text-white/60 ml-1">-</span>
                        <span className="font-bold text-white ml-1">{currentPlayerName}</span>
                    </div>
                    {isMyTurn && <span className="px-3 py-1 bg-emerald-500/30 text-emerald-300 rounded-full text-sm animate-pulse">輪到你了！</span>}
                </div>
                <div className="text-slate-400">進度：{matchedPairs} / {totalPairs}</div>
            </div>

            {/* 卡片網格 */}
            <div
                className="grid gap-2 md:gap-3 w-full max-w-4xl"
                style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
            >
                {cards.map(card => (
                    <button
                        key={card.id}
                        onClick={() => handleCardClick(card)}
                        disabled={card.isMatched || !isMyTurn || isProcessing}
                        className={`aspect-square rounded-xl flex items-center justify-center ${cardSizeClass} transition-all duration-300 transform
                            ${card.isMatched ? 'opacity-0 invisible scale-75 cursor-default' :
                                (card.isFlipped || flippedIds.includes(card.id)) ? 'bg-white/10 rotate-y-0' :
                                    'bg-gradient-to-br from-emerald-600 to-cyan-700 hover:from-emerald-500 hover:to-cyan-600 cursor-pointer hover:scale-105'}
                            ${!isMyTurn && !card.isFlipped && !card.isMatched ? 'opacity-70 cursor-not-allowed' : ''}
                        `}
                        style={{
                            perspective: '1000px',
                            boxShadow: (card.isFlipped || flippedIds.includes(card.id)) && !card.isMatched ? '0 0 20px rgba(52,211,153,0.4)' : 'none'
                        }}
                    >
                        {(card.isFlipped || flippedIds.includes(card.id) || card.isMatched) ? (
                            <span className="animate-flip-in">{card.content}</span>
                        ) : (
                            <span className="text-emerald-300/50">🃏</span>
                        )}
                    </button>
                ))}
            </div>

            {/* 計分板 */}
            <div className="w-full max-w-4xl mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                {sortedTeams.map(team => (
                    <div
                        key={team.id}
                        className={`p-3 rounded-xl border transition-all ${team.id === currentTeam?.id ? 'ring-2 ring-white/50' : ''}`}
                        style={{ borderColor: team.color, backgroundColor: team.color + '20' }}
                    >
                        <div className="text-sm font-medium" style={{ color: team.color }}>{team.name}</div>
                        <div className="text-2xl font-bold text-white">{scores[team.id] || 0}</div>
                    </div>
                ))}
            </div>

            {/* ★ 已移除配對動畫 (Clean UI) */}
        </div>
    );
}

// =================================================================
// Result View
// =================================================================
function MemoryResultView({ roomData, isHost, roomId }) {
    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};

    const sortedTeams = [...teams].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    const maxScore = sortedTeams[0] ? (scores[sortedTeams[0].id] || 0) : 0;
    const winners = sortedTeams.filter(t => (scores[t.id] || 0) === maxScore);

    const restartGame = async () => {
        await updateDoc(doc(db, 'memory_rooms', `memory_room_${roomId}`), {
            status: 'waiting',
            cards: [],
            currentTeamIndex: 0,
            flippedCards: [],
            matchedPairs: 0,
            scores: {},
            lastAction: null
        });
    };

    return (
        <div className="flex-1 p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-2xl w-full text-center space-y-8">
                <div className="relative inline-block">
                    <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-bounce" />
                    <div className="absolute -top-4 -right-4 text-6xl">🎉</div>
                    <div className="absolute -bottom-2 -left-4 text-6xl">✨</div>
                </div>

                <div>
                    <h2 className="text-slate-400 font-bold uppercase tracking-widest mb-2">
                        {winners.length > 1 ? "🤝 平手 (WINNERS)" : "🏆 冠軍 (WINNER)"}
                    </h2>
                    <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300 leading-tight">
                        {winners.map(w => w.name).join(" & ")}
                    </h1>
                    <div className="text-2xl text-yellow-400 font-bold mt-2">{maxScore} 分</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {sortedTeams.map((team) => {
                        const isWinner = winners.some(w => w.id === team.id);
                        return (
                            <div
                                key={team.id}
                                className={`p-4 rounded-xl border transition-all ${isWinner
                                    ? 'bg-yellow-900/40 border-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)] scale-105'
                                    : 'border-slate-600 bg-slate-800 opacity-80'}`}
                            >
                                <div className="flex items-center justify-center gap-2 mb-2">
                                    {isWinner && <Trophy size={16} className="text-yellow-400" />}
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }}></div>
                                    <span className="text-white font-medium">{team.name}</span>
                                </div>
                                <div className="text-3xl font-bold" style={{ color: team.color }}>{scores[team.id] || 0}</div>
                            </div>
                        );
                    })}
                </div>

                {isHost && (
                    <button
                        onClick={restartGame}
                        className="px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-2xl font-bold text-lg transition transform hover:scale-105"
                    >
                        再玩一次
                    </button>
                )}
            </div>
        </div>
    );
}

// =================================================================
// Settings Modal
// =================================================================
function MemorySettingsModal({ localSettings, setLocalSettings, setShowSettings, roomData, onSave }) {
    const updateSetting = (key, value) => setLocalSettings(prev => ({ ...prev, [key]: value }));

    // ★ 修正：正確計算啟用中的題庫數量
    const availablePairs = (() => {
        let count = 0;
        // 檢查內建題庫是否啟用
        if (roomData.useDefaultEmojis !== false) {
            count += DEFAULT_EMOJI_PAIRS.length;
        }
        // 只計算啟用的自訂題庫
        (roomData.customDecks || []).forEach(d => {
            if (d.enabled !== false) count += (d.pairs?.length || 0);
        });
        console.log('[MemorySettingsModal] 可用題庫數:', count, '(內建:', DEFAULT_EMOJI_PAIRS.length, ')');
        return count;
    })();

    const gridRows = localSettings.gridRows || 4;
    const gridCols = localSettings.gridCols || 4;
    const totalCards = gridRows * gridCols;
    const requiredPairs = totalCards / 2;
    const isEven = totalCards % 2 === 0;
    const hasEnoughPairs = availablePairs >= requiredPairs;
    const isValid = isEven && hasEnoughPairs;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-700 space-y-6">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2"><Settings className="text-emerald-400" /> 遊戲設定</h3>
                    <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white"><X /></button>
                </div>

                <div className="space-y-4">
                    {/* 網格大小：自訂 Rows x Cols */}
                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">網格大小 (Rows × Cols)</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number" min="2" max="10"
                                value={gridRows}
                                onChange={(e) => updateSetting('gridRows', Math.max(2, Math.min(10, parseInt(e.target.value) || 4)))}
                                className="w-20 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white text-center font-bold text-lg"
                            />
                            <span className="text-slate-400 text-xl">×</span>
                            <input
                                type="number" min="2" max="10"
                                value={gridCols}
                                onChange={(e) => updateSetting('gridCols', Math.max(2, Math.min(10, parseInt(e.target.value) || 4)))}
                                className="w-20 px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white text-center font-bold text-lg"
                            />
                            <span className="text-slate-400 text-sm">= {totalCards} 張 ({requiredPairs} 對)</span>
                        </div>

                        {/* 驗證錯誤提示 */}
                        {!isEven && (
                            <div className="mt-2 p-2 bg-red-500/20 text-red-300 rounded-lg text-sm">
                                ⚠️ 總數 ({totalCards}) 必須是偶數才能成對！
                            </div>
                        )}
                        {isEven && !hasEnoughPairs && (
                            <div className="mt-2 p-2 bg-yellow-500/20 text-yellow-300 rounded-lg text-sm">
                                ⚠️ 題庫不足！需要 {requiredPairs} 對，目前只有 {availablePairs} 對。
                            </div>
                        )}
                        {isValid && (
                            <div className="mt-2 text-emerald-400 text-sm">✓ 配置有效</div>
                        )}
                    </div>

                    {/* 快速選擇 */}
                    <div className="grid grid-cols-4 gap-2">
                        {[[4, 4], [4, 6], [6, 6], [5, 6]].map(([r, c]) => (
                            <button
                                key={`${r}x${c}`}
                                onClick={() => { updateSetting('gridRows', r); updateSetting('gridCols', c); }}
                                className={`py-2 rounded-lg text-sm ${gridRows === r && gridCols === c ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                            >
                                {r}×{c}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">配對得分</label>
                        <input
                            type="number" min="1" max="10"
                            value={localSettings.pointsPerMatch || 1}
                            onChange={(e) => updateSetting('pointsPerMatch', parseInt(e.target.value) || 1)}
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white"
                        />
                    </div>

                    <div className="border-t border-slate-700 pt-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.freeForAll || false}
                                onChange={(e) => updateSetting('freeForAll', e.target.checked)}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-emerald-500"
                            />
                            <div>
                                <span className="text-white font-medium">個人賽模式</span>
                                <div className="text-xs text-slate-400">每位玩家各自為陣</div>
                            </div>
                        </label>
                    </div>

                    {/* 權限設定 */}
                    <div className="border-t border-slate-700 pt-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.permissions?.allowPlayerAddDecks || false}
                                onChange={(e) => setLocalSettings(prev => ({
                                    ...prev,
                                    permissions: { ...prev.permissions, allowPlayerAddDecks: e.target.checked }
                                }))}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-cyan-500"
                            />
                            <div>
                                <span className="text-white font-medium">允許參賽者編輯題庫</span>
                                <div className="text-xs text-slate-400">非主持人可新增/編輯題目</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-700">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition">取消</button>
                    <button
                        onClick={onSave}
                        disabled={!isValid}
                        className={`flex-1 py-3 rounded-xl font-bold transition ${isValid ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                    >
                        儲存
                    </button>
                </div>
            </div>
        </div>
    );
}

