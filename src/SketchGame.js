import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ReactSketchCanvas } from 'react-sketch-canvas';
import {
    doc, setDoc, getDoc, onSnapshot, updateDoc,
    runTransaction, deleteDoc, collection, addDoc, getDocs,
    query, orderBy, limit, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
    Play, Settings, Plus, Check, X, Shuffle, ClipboardCopy, Trophy,
    ArrowLeft, LogOut, Trash2, Crown, Palette, Eraser, RotateCcw, Edit,
    Cloud, Download, Library, Maximize, Minimize
} from 'lucide-react';

import { db, auth } from './firebase';
import { DEFAULT_WORDS_LARGE } from './words';

// =================================================================
// 預設設定
// =================================================================
const DEFAULT_SETTINGS = {
    phase1Time: 30,
    phase2Time: 30,
    phase3Time: 40,  // 全員搶答時間
    totalRounds: 5,
    pointsPhase1: 3,  // 隊友猜對 (Phase 2)
    pointsPhase2: 1,  // 全員搶答 (Phase 3)
    teams: [
        { id: 'team_a', name: 'A 隊', color: '#ec4899' },
        { id: 'team_b', name: 'B 隊', color: '#8b5cf6' }
    ],
    permissions: { allowPlayerAddWords: false }
};


const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateId = () => Math.random().toString(36).substring(2, 10);

// =================================================================
// 主元件
// =================================================================
export default function SketchGame({ onBack, getNow, currentUser, isAdmin }) {
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

    useEffect(() => { document.title = "靈魂畫手 | Party Game"; }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) setUser(u);
            else signInAnonymously(auth).catch(console.error);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user || !roomId) return;
        console.log('[SketchGame] 訂閱房間:', roomId);
        const unsubscribe = onSnapshot(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRoomData(data);
                const amIInRoom = data.players?.some(p => p.id === user.uid);
                // ★ 觀戰者保護：不要踢出觀戰者
                if (!amIInRoom && view !== 'lobby') {
                    alert("你已被踢出房間"); setView('lobby'); setRoomData(null); return;
                }
                // ★ 斷線重連修復：只要玩家在名單中，就根據遊戲狀態切換畫面
                if (data.status === 'playing' && amIInRoom) setView('game');
                if (data.status === 'finished' && amIInRoom) setView('result');
                if (data.status === 'waiting' && amIInRoom && view !== 'lobby') setView('room');
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
                const oldRoomId = userSnap.data().currentSketchRoomId;
                if (oldRoomId && oldRoomId !== newRoomId) {
                    const oldRoomRef = doc(db, 'sketch_rooms', `sketch_room_${oldRoomId}`);
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
            await setDoc(userRef, { currentSketchRoomId: newRoomId }, { merge: true });
        } catch (e) { console.error("Cleanup old room failed:", e); }
    };

    const createRoom = async () => {
        if (!playerName.trim()) return alert("請輸入名字");
        setLoading(true);
        try {
            const newRoomId = generateRoomId();
            await checkAndLeaveOldRoom(user.uid, newRoomId);
            const me = { id: user.uid, name: playerName, team: null };
            await setDoc(doc(db, 'sketch_rooms', `sketch_room_${newRoomId}`), {
                id: newRoomId, hostId: user.uid, status: 'waiting',
                players: [me], settings: DEFAULT_SETTINGS, scores: {},
                currentRound: 1, currentTeamId: null, currentDrawerId: null,
                currentWord: null, phase: 0, phaseEndTime: null,
                canvasImage: null, canvasVisibility: 'drawer',
                wordQueue: [], useDefaultCategory: true, customCategories: []
            });
            console.log('[SketchGame] 建立房間:', newRoomId);
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
            const roomRef = doc(db, 'sketch_rooms', `sketch_room_${rId}`);


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

                let newPlayersList;
                if (isExistingPlayer) {
                    newPlayersList = [...currentPlayers];
                    newPlayersList[playerIndex] = { ...newPlayersList[playerIndex], name: playerName };
                } else {
                    newPlayersList = [...currentPlayers, { id: user.uid, name: playerName, team: null }];
                }
                transaction.update(roomRef, { players: newPlayersList });
            });

            console.log('[SketchGame] 加入房間:', rId);

            setRoomId(rId); setView('room');
        } catch (e) { console.error(e); alert("加入失敗: " + e.message); }
        setLoading(false);
    };

    const leaveRoom = async () => {
        if (!window.confirm("確定離開房間？")) return;
        try {
            const ref = doc(db, 'sketch_rooms', `sketch_room_${roomId}`);
            const newPlayers = roomData.players.filter(p => p.id !== user.uid);
            await updateDoc(doc(db, 'users', user.uid), { currentSketchRoomId: null });
            if (newPlayers.length === 0) await deleteDoc(ref);
            else {
                if (roomData.hostId === user.uid) await updateDoc(ref, { players: newPlayers, hostId: newPlayers[0].id });
                else await updateDoc(ref, { players: newPlayers });
            }
        } catch (e) { console.error("Leave error", e); }
        setView('lobby'); setRoomId(''); setRoomData(null);
    };

    if (view === 'lobby') return <SketchLobbyView onBack={onBack} playerName={playerName} setPlayerName={setPlayerName} roomId={roomId} setRoomId={setRoomId} createRoom={createRoom} joinRoom={joinRoom} loading={loading} user={user} />;
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
                            <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-slate-400 hover:text-pink-400"><ClipboardCopy size={14} /></button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-400">{user.isAnonymous ? playerName : user.displayName || playerName}</span>
                    {isHost && view === 'room' && <button onClick={() => { setLocalSettings(roomData.settings); setShowSettings(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-full text-sm font-medium transition"><Settings size={16} /> 設定</button>}
                </div>
            </header>
            <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
                {view === 'room' && <SketchRoomView roomData={roomData} isHost={isHost} isAdmin={isAdmin} roomId={roomId} currentUser={user} getCurrentTime={getCurrentTime} />}
                {view === 'game' && <SketchGameInterface roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user} getCurrentTime={getCurrentTime} />}
                {view === 'result' && <SketchResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
            </main>
            {showSettings && <SketchSettingsModal localSettings={localSettings} setLocalSettings={setLocalSettings} setShowSettings={setShowSettings} onSave={async () => { await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { settings: localSettings }); setShowSettings(false); }} />}
        </div>
    );
}

// =================================================================
// Lobby View
// =================================================================
function SketchLobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-pink-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
                <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors"><ArrowLeft /></button>
                <div className="text-center pt-6">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-300 to-fuchsia-400">靈魂畫手</h1>
                    <p className="text-white/60 text-sm mt-1">畫圖猜題！隊友專屬暗號</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-white/70 ml-1">你的名字</label>
                        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none placeholder-white/30 text-white" placeholder="例如：畢卡索" />
                        {user && <div className="text-[10px] text-white/40 mt-1 text-right font-mono">ID: {user.uid.slice(0, 5)}...</div>}
                    </div>
                    <button onClick={createRoom} disabled={loading || !user} className="w-full py-3 bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95">建立新房間</button>
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
function SketchRoomView({ roomData, isHost, isAdmin, roomId, currentUser, getCurrentTime }) {
    const [editingTeamName, setEditingTeamName] = useState(null);
    const [draggedPlayer, setDraggedPlayer] = useState(null);
    const [newCatName, setNewCatName] = useState("");
    const [editingCategory, setEditingCategory] = useState(null);
    const [newWordInput, setNewWordInput] = useState("");
    const [showCloudLibrary, setShowCloudLibrary] = useState(false);

    const players = roomData.players || [];
    const teams = roomData.settings.teams || [];
    const customCategories = roomData.customCategories || [];
    const unassigned = players.filter(p => !p.team);
    const canAddWords = isHost || roomData.settings.permissions?.allowPlayerAddWords;

    const randomize = async () => {
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const teamIds = teams.map(t => t.id);
        const newPlayers = shuffled.map((p, i) => ({ ...p, team: teamIds[i % teamIds.length] }));
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { players: newPlayers });
    };

    const changePlayerTeam = async (playerId, newTeamId) => {
        const newPlayers = players.map(p => p.id === playerId ? { ...p, team: newTeamId } : p);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { players: newPlayers });
    };

    const kickPlayer = async (targetId) => {
        if (!window.confirm("確定要踢出這位玩家嗎？")) return;
        const newPlayers = players.filter(p => p.id !== targetId);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { players: newPlayers });
    };

    const makeHost = async (targetId) => {
        if (!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { hostId: targetId });
    };

    const updateTeamName = async (teamId, newName) => {
        const newTeams = teams.map(t => t.id === teamId ? { ...t, name: newName } : t);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { 'settings.teams': newTeams });
        setEditingTeamName(null);
    };

    const handleDragStart = (e, player) => { setDraggedPlayer(player); e.dataTransfer.effectAllowed = 'move'; };
    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    const handleDrop = (e, teamId) => { e.preventDefault(); if (draggedPlayer) { changePlayerTeam(draggedPlayer.id, teamId); setDraggedPlayer(null); } };

    const toggleDefault = async () => { await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { useDefaultCategory: !roomData.useDefaultCategory }); };

    const addCategory = async () => {
        if (!newCatName.trim()) return;
        const newCat = { id: generateId(), name: newCatName.trim(), words: [], enabled: true };
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: [...customCategories, newCat] });
        setNewCatName("");
    };

    const toggleCategory = async (catId) => {
        if (!isHost) return;
        const updated = customCategories.map(c => c.id === catId ? { ...c, enabled: !c.enabled } : c);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: updated });
    };

    const addWordToCategory = async () => {
        if (!newWordInput.trim() || !editingCategory) return;
        const updated = customCategories.map(c => c.id === editingCategory.id ? { ...c, words: [...c.words, newWordInput.trim()] } : c);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: updated });
        setEditingCategory(updated.find(c => c.id === editingCategory.id));
        setNewWordInput("");
    };

    const removeWordFromCategory = async (word) => {
        if (!editingCategory) return;
        const updated = customCategories.map(c => c.id === editingCategory.id ? { ...c, words: c.words.filter(w => w !== word) } : c);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: updated });
        setEditingCategory(updated.find(c => c.id === editingCategory.id));
    };

    const deleteCategory = async () => {
        if (!isHost) return;
        if (!window.confirm("確定刪除此題庫？")) return;
        const updated = customCategories.filter(c => c.id !== editingCategory.id);
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: updated });
        setEditingCategory(null);
    };

    // ★★★ 雲端題庫上傳 (僅 Admin) ★★★
    const saveDeckToCloud = async () => {
        if (!editingCategory) return;
        if (!isAdmin) return alert("權限不足：您必須是管理員才能上傳題庫到雲端！");
        try {
            const q = query(collection(db, 'public_decks'), orderBy('createdAt', 'desc'), limit(100));
            const snapshot = await getDocs(q);
            const existing = snapshot.docs.find(d => d.data().name === editingCategory.name);

            if (existing) {
                if (!window.confirm(`雲端已存在同名題庫「${editingCategory.name}」，確定要覆蓋嗎？`)) return;
                await updateDoc(doc(db, 'public_decks', existing.id), {
                    words: editingCategory.words,
                    updatedAt: serverTimestamp(),
                    creatorId: currentUser.uid
                });
                alert(`題庫「${editingCategory.name}」已更新！`);
            } else {
                const docRef = await addDoc(collection(db, 'public_decks'), {
                    name: editingCategory.name,
                    words: editingCategory.words,
                    createdAt: serverTimestamp(),
                    creatorId: currentUser.uid,
                    creatorEmail: currentUser.email
                });
                alert(`題庫已上傳！代碼：${docRef.id}`);
            }
        } catch (e) {
            alert("上傳失敗：" + e.message);
        }
    };

    // ★★★ 從雲端下載題庫 ★★★
    const importDeckFromCloud = async (deckId) => {
        try {
            const deckDoc = await getDoc(doc(db, 'public_decks', deckId));
            if (deckDoc.exists()) {
                const deck = deckDoc.data();
                const newCat = { id: generateId(), name: deck.name, words: deck.words || [], enabled: true };
                await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { customCategories: [...customCategories, newCat] });
                alert(`成功匯入：${deck.name} (${deck.words?.length} 題)`);
                setShowCloudLibrary(false);
            } else {
                alert("找不到此代碼的題庫");
            }
        } catch (e) {
            alert("匯入失敗：" + e.message);
        }
    };

    const startGame = async () => {
        let finalWords = [];
        if (roomData.useDefaultCategory !== false) finalWords = [...DEFAULT_WORDS_LARGE];
        customCategories.forEach(c => { if (c.enabled) finalWords.push(...c.words); });
        if (finalWords.length === 0) return alert("請先啟用題庫！");

        const shuffledWords = finalWords.sort(() => 0.5 - Math.random());
        const initialScores = {}; teams.forEach(t => initialScores[t.id] = 0);

        // ★★★ 獨立雙指針 (Independent Two-Pointers) 生成回合表 ★★★
        const turnOrder = [];
        const teamPlayers = {};
        const cursors = {};

        // 1. 準備資料
        teams.forEach(team => {
            // 取得該隊成員並隨機排序
            const members = players.filter(p => p.team === team.id).map(p => p.id).sort(() => 0.5 - Math.random());
            if (members.length > 0) {
                teamPlayers[team.id] = members;
                cursors[team.id] = 0; // 設定獨立指針
            }
        });

        // 2. 生成迴圈
        const totalRounds = roomData.settings.totalRounds || 5;
        // 總共的回合數 = 設定的輪數 * 隊伍數 (例如 5輪 * 2隊 = 10個回合)
        // 但這裡我們用迴圈生成 schedule，每一個 item 代表這回合是誰畫

        for (let i = 0; i < totalRounds; i++) {
            // 依序讓每一隊派人出來
            for (const team of teams) {
                const members = teamPlayers[team.id];
                if (!members || members.length === 0) continue; // 該隊沒人，跳過

                const cursor = cursors[team.id];
                const drawerId = members[cursor % members.length]; // 取餘數，確保無限循環

                turnOrder.push({
                    teamId: team.id,
                    drawerId: drawerId,
                    roundIndex: i + 1 // 這是第幾輪
                });

                // 關鍵動作：將對應的指針遞增
                cursors[team.id]++;
            }
        }

        if (turnOrder.length === 0) return alert("沒有足夠的玩家！");

        const firstTurn = turnOrder[0];
        const now = getCurrentTime();

        console.log('[SketchGame] 開始遊戲, 排程:', turnOrder);

        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
            status: 'playing', wordQueue: shuffledWords.slice(1), scores: initialScores,
            currentRound: 1,
            currentTeamId: firstTurn.teamId,
            currentDrawerId: firstTurn.drawerId,
            currentWord: shuffledWords[0], phase: 1, phaseEndTime: now + roomData.settings.phase1Time * 1000,
            canvasImage: null, canvasVisibility: 'drawer',
            turnOrder: turnOrder, // ★ 儲存完整的排程表
            roundResult: null
        });
    };

    const canStart = players.filter(p => p.team).length >= 2;

    const PlayerItem = ({ p, showKick, showPromote }) => (
        <div draggable={isHost} onDragStart={(e) => handleDragStart(e, p)} className={`flex items-center justify-between p-2 rounded-lg mb-1 border transition-all ${isHost ? 'cursor-grab hover:bg-slate-700' : ''} ${p.id === currentUser.uid ? 'bg-pink-500/20 border-pink-500/50' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex items-center gap-2">
                <span className="text-white font-medium">{p.name}</span>
                {p.id === roomData.hostId && <Crown size={14} className="text-yellow-400 fill-yellow-400" />}
                {p.id === currentUser.uid && <span className="text-xs bg-slate-700 text-slate-400 px-1 rounded">我</span>}
            </div>
            <div className="flex gap-1">
                {showPromote && <button onClick={() => makeHost(p.id)} className="text-slate-400 hover:text-yellow-500 p-1"><Crown size={14} /></button>}
                {showKick && p.id !== roomData.hostId && <button onClick={() => kickPlayer(p.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>}
            </div>
        </div>
    );

    return (
        <>
            <div className="p-4 md:p-8 w-full space-y-6 text-white">
                {/* 題庫編輯 Modal */}
                {editingCategory && (
                    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                        <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col border border-slate-700">
                            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                                <h3 className="font-bold text-lg flex items-center gap-2"><Edit size={18} className="text-pink-400" />{editingCategory.name}<span className="text-xs text-slate-400 font-normal">({editingCategory.words.length}題)</span></h3>
                                <button onClick={() => setEditingCategory(null)}><X className="text-slate-400 hover:text-white" /></button>
                            </div>
                            <div className="flex gap-2">
                                <input value={newWordInput} onChange={e => setNewWordInput(e.target.value)} className="flex-1 bg-slate-700 border border-slate-600 p-2 rounded-lg text-sm text-white" placeholder="輸入新題目..." onKeyDown={e => e.key === 'Enter' && addWordToCategory()} />
                                <button onClick={addWordToCategory} className="bg-pink-500 text-white px-3 rounded-lg"><Plus /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto border border-slate-700 rounded-lg p-2 bg-slate-900/50 space-y-1">
                                {editingCategory.words.map((w, i) => (
                                    <div key={i} className="flex justify-between items-center bg-slate-800 p-2 rounded">
                                        <span>{w}</span>
                                        {isHost && <button onClick={() => removeWordFromCategory(w)} className="text-slate-500 hover:text-red-500"><X size={14} /></button>}
                                    </div>
                                ))}
                                {editingCategory.words.length === 0 && <div className="text-center text-slate-500 py-4">還沒有題目</div>}
                            </div>
                            {/* ★★★ 上傳雲端 (僅 Admin) ★★★ */}
                            {isAdmin && (
                                <button onClick={saveDeckToCloud} className="w-full bg-sky-600 hover:bg-sky-700 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2">
                                    <Cloud size={16} /> 上傳至雲端 (管理員)
                                </button>
                            )}
                            <div className="pt-2 border-t border-slate-700 flex justify-between">
                                {isHost ? <button onClick={deleteCategory} className="text-red-400 text-sm flex items-center gap-1"><Trash2 size={14} /> 刪除</button> : <div></div>}
                                <button onClick={() => setEditingCategory(null)} className="bg-slate-700 text-white px-6 py-2 rounded-lg text-sm font-bold">完成</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ★★★ 雲端題庫圖書館 Modal ★★★ */}
                {showCloudLibrary && (
                    <SketchCloudLibraryModal
                        onClose={() => setShowCloudLibrary(false)}
                        onImport={importDeckFromCloud}
                        db={db}
                        currentUser={currentUser}
                        isAdmin={isAdmin}
                    />
                )}

                <div className="grid md:grid-cols-2 gap-6">
                    {/* 左側：隊伍 */}
                    <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                            <h2 className="text-xl font-bold flex items-center gap-2"><Palette className="text-pink-400" /> 參賽玩家 ({players.length})</h2>
                            {isHost && <button onClick={randomize} className="text-sm bg-pink-500/20 text-pink-400 px-4 py-2 rounded-full hover:bg-pink-500/30 font-bold transition flex items-center gap-1"><Shuffle size={14} /> 隨機分組</button>}
                        </div>

                        {/* 未分組 */}
                        <div onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, null)} className={`p-3 rounded-xl border border-dashed ${unassigned.length > 0 ? 'border-orange-400 bg-orange-500/10' : 'border-slate-600'}`}>
                            <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">等待分組 ({unassigned.length})</h4>
                            {unassigned.map(p => <PlayerItem key={p.id} p={p} showKick={isHost} showPromote={isHost} />)}
                        </div>

                        {/* 隊伍 */}
                        {teams.map(team => (
                            <div key={team.id} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, team.id)} className="p-4 rounded-xl border" style={{ borderColor: team.color, backgroundColor: `${team.color}15` }}>
                                <div className="flex items-center justify-between mb-3">
                                    {editingTeamName?.id === team.id ? (
                                        <input autoFocus className="font-bold text-lg bg-transparent border-b border-pink-400 outline-none text-white w-full" value={editingTeamName.name} onChange={e => setEditingTeamName({ ...editingTeamName, name: e.target.value })} onBlur={() => updateTeamName(team.id, editingTeamName.name)} onKeyDown={e => e.key === 'Enter' && updateTeamName(team.id, editingTeamName.name)} />
                                    ) : (
                                        <h3 className={`font-bold text-lg ${isHost ? 'cursor-pointer hover:opacity-80' : ''}`} style={{ color: team.color }} onClick={() => isHost && setEditingTeamName(team)}>{team.name}</h3>
                                    )}
                                </div>
                                <div className="space-y-1 min-h-[40px]">
                                    {players.filter(p => p.team === team.id).map(p => <PlayerItem key={p.id} p={p} showKick={isHost} showPromote={isHost} />)}
                                    {players.filter(p => p.team === team.id).length === 0 && <span className="text-slate-500 text-sm italic p-1 block border border-dashed border-slate-600 rounded text-center">拖曳玩家至此</span>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 右側：題庫 */}
                    <div className="space-y-6">
                        {/* 遊戲資訊 */}
                        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">🎮 遊戲玩法</h2>
                            <ul className="text-sm text-slate-300 space-y-2">
                                <li>• 輪到你時畫出題目</li>
                                <li>• 前 {roomData.settings.phase1Time} 秒只有隊友看得到</li>
                                <li>• 後 {roomData.settings.phase2Time} 秒全部人都能看到並搶答</li>
                                <li>• Phase 1 答對得 {roomData.settings.pointsPhase1} 分</li>
                                <li>• Phase 2 答對得 {roomData.settings.pointsPhase2} 分</li>
                            </ul>
                        </div>

                        {/* 題庫設定 */}
                        <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl">
                            <h2 className="text-lg font-bold mb-4 flex justify-between items-center">題庫設定{!isHost && <span className="text-xs font-normal text-slate-500 bg-slate-700 px-2 py-1 rounded">僅主持人可選</span>}</h2>

                            <div onClick={isHost ? toggleDefault : undefined} className={`flex items-center justify-between p-3 rounded-xl border transition-all mb-3 ${isHost ? 'cursor-pointer' : 'opacity-70'} ${roomData.useDefaultCategory !== false ? 'border-pink-500 bg-pink-500/20' : 'border-slate-600 bg-slate-800'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${roomData.useDefaultCategory !== false ? 'bg-pink-500 border-pink-500' : 'border-slate-500'}`}>
                                        {roomData.useDefaultCategory !== false && <Check size={14} className="text-white" />}
                                    </div>
                                    <div><div className="font-bold">內建題庫 (1000+)</div><div className="text-xs text-slate-400">食物、地標、動物...</div></div>
                                </div>
                            </div>

                            {customCategories.map(cat => (
                                <div key={cat.id} className="flex items-center gap-2 mb-2">
                                    <div onClick={() => isHost && toggleCategory(cat.id)} className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${isHost ? 'cursor-pointer' : 'opacity-70'} ${cat.enabled ? 'border-pink-500 bg-pink-500/20' : 'border-slate-600 bg-slate-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${cat.enabled ? 'bg-pink-500 border-pink-500' : 'border-slate-500'}`}>
                                                {cat.enabled && <Check size={14} className="text-white" />}
                                            </div>
                                            <div className="font-bold">{cat.name} <span className="text-slate-400 font-normal text-xs">({cat.words.length}題)</span></div>
                                        </div>
                                    </div>
                                    {(isHost || canAddWords) && <button onClick={() => setEditingCategory(cat)} className="p-3 bg-slate-700 hover:bg-slate-600 rounded-xl"><Edit size={18} /></button>}
                                </div>
                            ))}

                            {canAddWords && (
                                <div className="flex gap-2 mt-4">
                                    <input value={newCatName} onChange={e => setNewCatName(e.target.value)} className="flex-1 bg-slate-700 border border-slate-600 px-3 py-2 rounded-lg text-sm text-white" placeholder="新題庫名稱..." onKeyDown={e => e.key === 'Enter' && addCategory()} />
                                    <button onClick={addCategory} className="bg-pink-500 text-white px-4 rounded-lg font-bold"><Plus size={18} /></button>
                                </div>
                            )}

                            {/* ★★★ 雲端圖書館按鈕 ★★★ */}
                            {isHost && (
                                <button onClick={() => setShowCloudLibrary(true)} className="w-full mt-4 bg-gradient-to-r from-sky-500 to-indigo-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition">
                                    <Library size={18} /> ☁️ 瀏覽雲端題庫圖書館
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* 開始遊戲 */}
                {isHost && (
                    <button onClick={startGame} disabled={!canStart} className="w-full py-4 bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:from-pink-600 hover:to-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg transition transform hover:scale-[1.02]">
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
function SketchGameInterface({ roomData, isHost, roomId, currentUser, getCurrentTime }) {
    const canvasRef = useRef(null);
    // eslint-disable-next-line no-unused-vars
    const [isDrawing, setIsDrawing] = useState(false); // keep for backward compatibility if needed, though ReactSketchCanvas handles it
    const [brushColor, setBrushColor] = useState('#000000');
    // eslint-disable-next-line no-unused-vars
    const [strokeWidth, setStrokeWidth] = useState(4);
    const [isEraser, setIsEraser] = useState(false);
    const [guess, setGuess] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [showWrong, setShowWrong] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState(''); // ★ Local feedback
    const [isFullscreen, setIsFullscreen] = useState(false); // ★ Fullscreen state
    const snapshotSentRef = useRef({ phase1: false, phase2: false, phase3: false });

    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};
    // currentTeam removed - unused
    const isDrawer = roomData.currentDrawerId === currentUser.uid;
    const myTeam = roomData.players?.find(p => p.id === currentUser.uid)?.team;
    const isMyTeamDrawing = myTeam === roomData.currentTeamId;


    // 計時器
    useEffect(() => {
        const interval = setInterval(() => {
            if (roomData.phaseEndTime) {
                const remaining = Math.max(0, Math.ceil((roomData.phaseEndTime - getCurrentTime()) / 1000));
                setTimeLeft(remaining);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [roomData.phaseEndTime, getCurrentTime]);

    // Phase 轉換 (繪圖者端) - 三階段流程
    useEffect(() => {
        if (!isDrawer || !roomData.phaseEndTime) return;

        const checkPhase = async () => {
            const now = getCurrentTime();
            const remaining = roomData.phaseEndTime - now;

            // Phase 1 結束 → 發送 Snapshot 1，進入 Phase 2 (僅隊友可見)
            if (roomData.phase === 1 && remaining <= 0 && !snapshotSentRef.current.phase1) {
                snapshotSentRef.current.phase1 = true;
                console.log('[SketchGame] Phase 1 結束, 發送 Snapshot 1 (隊友可見)');
                const canvas = canvasRef.current;
                if (canvas) {
                    try {
                        const imageData = await canvas.exportImage("png");
                        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
                            canvasImage: imageData,
                            canvasVisibility: 'team',
                            phase: 2,
                            phaseEndTime: now + roomData.settings.phase2Time * 1000
                        });
                    } catch (e) {
                        console.error("Export image failed:", e);
                    }
                }
            }

            // Phase 2 結束 → 發送 Snapshot 2，進入 Phase 3 (全員可見搶答)
            if (roomData.phase === 2 && remaining <= 0 && !snapshotSentRef.current.phase2) {
                snapshotSentRef.current.phase2 = true;
                console.log('[SketchGame] Phase 2 結束, 發送 Snapshot 2 (全員可見)');
                const canvas = canvasRef.current;
                if (canvas) {
                    try {
                        const imageData = await canvas.exportImage("png");
                        const phase3Time = roomData.settings.phase3Time || 10;
                        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
                            canvasImage: imageData,
                            canvasVisibility: 'all',
                            phase: 3,
                            phaseEndTime: now + phase3Time * 1000
                        });
                    } catch (e) {
                        console.error("Export image failed:", e);
                    }
                }
            }

            // Phase 3 結束 → 寫入過場畫面 (由主持人 useEffect 負責換題)
            if (roomData.phase === 3 && remaining <= 0 && !snapshotSentRef.current.phase3) {
                // ★ 如果已有人答對，不要覆蓋 roundResult
                if (roomData.roundResult) {
                    console.log('[SketchGame] Phase 3 結束，但已有 roundResult，跳過無人答對寫入');
                    snapshotSentRef.current.phase3 = true;
                    return;
                }
                snapshotSentRef.current.phase3 = true;
                console.log('[SketchGame] Phase 3 結束, 無人答對');
                // 寫入過場資料 (無人答對)
                await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
                    roundResult: {
                        answer: roomData.currentWord,
                        winner: null,
                        winnerTeam: null,
                        points: 0
                    }
                });
                // 由主持人 useEffect 負責換題，這裡不再呼叫 setTimeout
            }
        };

        const interval = setInterval(checkPhase, 500);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDrawer, roomData.phase, roomData.phaseEndTime]);

    // 重置 Snapshot flag + 換題狀態
    useEffect(() => {
        snapshotSentRef.current = { phase1: false, phase2: false, phase3: false };
        console.log('[SketchGame] 新回合，重置換題狀態');
    }, [roomData.currentWord]);

    // ★★★ 主持人專用：監聽 roundResult 並換題 ★★★
    useEffect(() => {
        if (!isHost || !roomData.roundResult) return;
        console.log('[SketchGame] Host 監聽到 roundResult, 3 秒後換題');
        const timer = setTimeout(() => {
            nextRound(false);
        }, 3000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomData.roundResult, isHost]);

    const handleUndo = () => {
        if (canvasRef.current) {
            canvasRef.current.undo();
        }
    };

    // ★ Fullscreen Toggle
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(e => console.error(e));
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(e => console.error(e));
        }
    };

    // Listen to fullscreen change (hardware validation)
    useEffect(() => {
        const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleChange);
        return () => document.removeEventListener('fullscreenchange', handleChange);
    }, []);



    // 換下一題 (已修正為使用預先生成的 turnOrder)
    const nextRound = async (correct, answerTeamId = null) => {
        const newQueue = [...(roomData.wordQueue || [])];
        const nextWord = newQueue.shift();

        // turnOrder 是一個長度為 (TotalRounds * Teams) 的陣列
        // roomData.currentRound 目前是 1，下一局就是 2
        // 因為是 0-based index，所以 index = currentRound (因為 currentRound 代表已經玩了幾回合)
        // 例如：現在第1局結束，currentRound=1，下一局是第2局，在 array 中的 index 為 1

        const nextRoundIndex = roomData.currentRound;
        const nextTurnInfo = roomData.turnOrder && roomData.turnOrder[nextRoundIndex];

        if (!nextWord || !nextTurnInfo) {
            // 沒有題目或沒有下一局排程了 => 結束
            await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { status: 'finished' });
            return;
        }

        const now = getCurrentTime();

        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
            wordQueue: newQueue,
            currentRound: roomData.currentRound + 1,

            // ★ 直接使用預先排好的資訊
            currentTeamId: nextTurnInfo.teamId,
            currentDrawerId: nextTurnInfo.drawerId,

            currentWord: nextWord,
            phase: 1,
            phaseEndTime: now + roomData.settings.phase1Time * 1000,
            canvasImage: null,  // ★ 清除上一局圖片資料
            canvasVisibility: 'drawer',
            roundResult: null,  // 清除過場資料
        });
    };

    // 提交答案 (修正版)
    const submitGuess = async () => {
        if (!guess.trim()) return;
        // 防止重複答題 (已在過場階段)
        if (roomData.roundResult) return;

        const answer = guess.trim().toLowerCase();
        const correct = roomData.currentWord?.toLowerCase();
        const myName = roomData.players?.find(p => p.id === currentUser.uid)?.name || '玄家';

        console.log('[SketchGame] 提交答案:', answer, '正確答案:', correct);

        if (answer === correct) {
            // 修正計分邏輯: Phase 2 = pointsPhase1 (隊友), Phase 3 = pointsPhase2 (全員)
            const points = roomData.phase === 2 ? roomData.settings.pointsPhase1 : roomData.settings.pointsPhase2;
            const newScores = { ...scores };
            newScores[myTeam] = (newScores[myTeam] || 0) + points;

            // 寫入 roundResult 過場資料
            await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
                scores: newScores,
                roundResult: {
                    answer: roomData.currentWord,
                    winner: myName,
                    winnerTeam: myTeam,
                    points: points
                }
            });
            setGuess('');
            // 由主持人 useEffect 負責換題，這裡不再呼叫 setTimeout
        } else {
            setGuess('');
            // 錯誤提示
            setShowWrong(true);
            setFeedbackMessage("❌ 答案錯誤"); // ★ Local feedback
            setTimeout(() => {
                setShowWrong(false);
                setFeedbackMessage("");
            }, 1000);
        }
    };

    // 判斷是否可看圖
    const canSeeImage = () => {
        if (isDrawer) return false; // 繪圖者看自己的 Canvas
        if (roomData.canvasVisibility === 'all') return true;
        if (roomData.canvasVisibility === 'team' && isMyTeamDrawing) return true;
        return false;
    };

    // 主持人提前結算
    const forceEnd = async () => {
        if (!window.confirm("確定要提前結算嗎？將直接進入計分板。")) return;
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), { status: 'finished' });
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white p-2 md:p-4 font-sans">
            {/* ★★★ 過場彈窗 (roundResult) ★★★ */}
            {roomData.roundResult && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center animate-in fade-in duration-300">
                    <div className="text-center space-y-4">
                        <div className="text-6xl mb-4">{roomData.roundResult.winner ? '🎉' : '⏰'}</div>
                        <div className="text-slate-400 text-lg">正確答案</div>
                        <div className="text-5xl font-bold text-pink-400 animate-pulse">
                            {roomData.roundResult.answer}
                        </div>
                        {roomData.roundResult.winner ? (
                            <div className="text-2xl text-green-400 font-bold mt-4">
                                🏆 {roomData.roundResult.winner} 答對！ +{roomData.roundResult.points} 分
                            </div>
                        ) : (
                            <div className="text-xl text-slate-400 mt-4">時間到，無人答對</div>
                        )}
                        <div className="text-slate-500 text-sm mt-6 animate-pulse">下一題即將開始...</div>
                    </div>
                </div>
            )}

            {/* Mobile Rotate Hint */}
            <div className="md:hidden text-center text-xs text-slate-500 mb-2">
                📱 請將手機橫放以獲得最佳作畫體驗
            </div>

            {/* Main Grid Container */}
            <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">

                {/* --- Left Column (Canvas & Tools) - md:col-span-2 --- */}
                <div className="md:col-span-2 flex flex-col gap-4">

                    {/* Header: Phase & Status */}
                    <div className="flex justify-between items-center bg-slate-800 rounded-xl p-3 shadow-md">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold shadow-md text-white ${roomData.phase === 1 ? 'bg-slate-500' : roomData.phase === 2 ? 'bg-blue-500' : 'bg-orange-500'}`}>
                                Phase {roomData.phase}
                            </span>
                            {!isDrawer && (
                                <span className={`text-xs font-bold px-2 py-1 rounded ${isMyTeamDrawing ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {isMyTeamDrawing
                                        ? `隊友 ${roomData.players?.find(p => p.id === roomData.currentDrawerId)?.name || ''} 作畫`
                                        : `對手 ${roomData.players?.find(p => p.id === roomData.currentDrawerId)?.name || ''} 作畫`}
                                </span>
                            )}
                        </div>
                        {/* Mobile Timer & Fullscreen Toggle */}
                        <div className="md:hidden flex items-center gap-3">
                            <div className="font-mono font-bold text-xl">{timeLeft}s</div>
                            <button onClick={toggleFullscreen} className="p-1 bg-slate-700 rounded text-slate-300">
                                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                            </button>
                        </div>
                    </div>

                    {/* Content Wrapper for Landscape Layout */}
                    <div className="flex flex-col landscape:flex-row gap-4">

                        {/* Tools Row (Drawer Only) - Landscape: Right Column */}
                        {isDrawer && (
                            <div className="flex flex-wrap items-center justify-center gap-4 bg-slate-800 rounded-xl p-2 shadow-md landscape:flex-col landscape:w-16 landscape:order-last">
                                <div className="relative group">
                                    <input
                                        type="color"
                                        value={brushColor}
                                        onChange={(e) => { setBrushColor(e.target.value); setIsEraser(false); }}
                                        className="w-8 h-8 rounded-full border-2 border-white cursor-pointer overflow-hidden p-0 shadow-sm hover:scale-110 transition"
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-1 rounded-full landscape:flex-col landscape:p-0 landscape:bg-transparent landscape:rounded-none">
                                    <div className="w-2 h-2 rounded-full bg-slate-400" style={{ transform: `scale(${strokeWidth / 4})`, backgroundColor: isEraser ? '#fff' : brushColor }} />
                                    <input
                                        type="range"
                                        min="2" max="20"
                                        value={strokeWidth}
                                        onChange={(e) => setStrokeWidth(parseInt(e.target.value))}
                                        className="w-20 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer landscape:-rotate-90 landscape:w-20 landscape:my-6"
                                    />
                                </div>
                                <div className="flex gap-2 landscape:flex-col">
                                    <button
                                        onClick={() => setIsEraser(!isEraser)}
                                        className={`p-2 rounded-full transition shadow-sm ${isEraser ? 'bg-pink-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                        title="橡皮擦"
                                    >
                                        <Eraser size={18} />
                                    </button>
                                    <button
                                        onClick={handleUndo}
                                        className="p-2 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white transition shadow-sm active:scale-95"
                                        title="復原"
                                    >
                                        <RotateCcw size={18} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Canvas / Image Container - Landscape: Main Area */}
                        <div className="aspect-video w-full bg-white rounded-xl shadow-lg border-2 border-slate-700 relative overflow-hidden touch-none flex items-center justify-center landscape:flex-1">
                            {isDrawer ? (
                                <ReactSketchCanvas
                                    ref={canvasRef}
                                    strokeWidth={strokeWidth}
                                    strokeColor={isEraser ? "#FFFFFF" : brushColor}
                                    canvasColor="transparent"
                                    className="w-full h-full"
                                />
                            ) : (
                                /* Guesser View */
                                <div className="w-full h-full flex items-center justify-center bg-slate-100/5">
                                    {canSeeImage() && roomData.canvasImage ? (
                                        <img src={roomData.canvasImage} alt="Drawing" className="w-full h-full object-contain bg-white" />
                                    ) : (
                                        <div className="text-center text-slate-500">
                                            <Palette size={48} className="mx-auto mb-2 opacity-30" />
                                            <div className="text-lg font-bold opacity-50">
                                                {isMyTeamDrawing ? '等待隊友作畫...' : '等待對手作畫...'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* --- Right Column (Info & Interaction) - md:col-span-1 --- */}
                <div className="md:col-span-1 flex flex-col gap-4 h-full md:max-h-[calc(100vh-2rem)]">

                    {/* Top Info Panel */}
                    <div className="bg-slate-800 rounded-2xl p-4 shadow-lg text-center">
                        {/* Desktop Timer (Big) */}
                        <div className="hidden md:block font-mono font-bold text-6xl text-white mb-2">
                            {timeLeft}
                        </div>
                        <div className="text-slate-400 text-sm mb-4">Round {roomData.currentRound}</div>


                        {/* Topic / Status */}
                        {isDrawer ? (
                            <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-4">
                                <div className="text-slate-400 text-xs mb-1">本題題目</div>
                                <div className="text-3xl font-bold text-pink-400">{roomData.currentWord}</div>
                            </div>
                        ) : (
                            <div className="bg-slate-700/30 rounded-xl p-4">
                                <div className="text-slate-400 text-xs mb-1">狀態</div>
                                <div className="text-xl font-bold text-slate-200">
                                    {canSeeImage() ? '猜猜看是什麼？' : '準備中...'}
                                </div>
                            </div>
                        )}

                        {/* Force End (Host) */}
                        {isHost && (
                            <button onClick={forceEnd} className="mt-4 text-xs bg-red-500/10 text-red-400 px-3 py-1 rounded hover:bg-red-500/20 w-full transition">
                                強制結束回合
                            </button>
                        )}
                    </div>

                    {/* Chat / Interaction Panel */}
                    {!isDrawer && (
                        <div className="flex-1 bg-slate-800 rounded-2xl p-4 shadow-lg flex flex-col min-h-[150px] md:min-h-0 landscape:min-h-[120px]">
                            <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1 text-sm text-slate-300 relative">
                                {/* Simple Placeholder for Chat Logic */}
                                <div className="text-center opacity-30 py-4">
                                    遊戲聊天室
                                </div>
                                <div className="p-2 bg-slate-700/50 rounded text-xs text-slate-300">
                                    系統: 歡迎來到猜畫遊戲！
                                </div>
                            </div>

                            {/* ★ Feedback Message */}
                            {feedbackMessage && <div className="text-red-400 font-bold text-center mb-2 animate-bounce text-sm">{feedbackMessage}</div>}

                            <div className="flex gap-2 w-full">
                                <input
                                    value={guess}
                                    onChange={e => setGuess(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && submitGuess()}
                                    className={`flex-1 min-w-0 bg-slate-700 border-2 px-3 py-2 rounded-xl text-white outline-none ${showWrong ? 'border-red-500 animate-pulse' : 'border-slate-600 focus:border-blue-400 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                                    placeholder={
                                        roomData.phase === 1 ? "繪圖中... (Phase 1)" :
                                            roomData.phase === 2 ? (isMyTeamDrawing ? "快猜！(僅隊友可見)" : "等待隊友作畫結束...") :
                                                "搶答！"
                                    }
                                    disabled={!!roomData.roundResult || roomData.phase === 1 || (roomData.phase === 2 && !isMyTeamDrawing)}
                                />
                                <button
                                    onClick={submitGuess}
                                    disabled={!!roomData.roundResult || roomData.phase === 1 || (roomData.phase === 2 && !isMyTeamDrawing)}
                                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 rounded-xl font-bold transition shadow-md whitespace-nowrap shrink-0"
                                >
                                    送出
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Scoreboard (Compact) */}
                    <div className="bg-slate-800 rounded-xl p-4 shadow-lg mt-auto">
                        <div className="grid grid-cols-2 gap-2">
                            {teams.map(t => (
                                <div key={t.id} className="flex items-center justify-between bg-slate-700/40 p-2 rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }}></div>
                                        <span className="text-xs text-slate-300 truncate max-w-[60px]">{t.name}</span>
                                    </div>
                                    <span className="font-bold text-white">{scores[t.id] || 0}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}

// =================================================================
// Result View
// =================================================================
function SketchResultView({ roomData, isHost, roomId }) {
    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};
    const sortedTeams = [...teams].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    // winner removed - unused

    const playAgain = async () => {
        await updateDoc(doc(db, 'sketch_rooms', `sketch_room_${roomId}`), {
            status: 'waiting', currentRound: 1, currentTeamId: null,
            currentDrawerId: null, currentWord: null, phase: 0,
            phaseEndTime: null, canvasImage: null, canvasVisibility: 'drawer'
        });
    };

    return (
        <div className="flex-1 flex items-center justify-center p-8">
            <div className="bg-slate-800 rounded-3xl p-8 max-w-lg w-full text-center border border-slate-700">
                <Trophy className="w-20 h-20 mx-auto text-yellow-400 mb-4" />
                <h2 className="text-3xl font-bold text-white mb-6">遊戲結束！</h2>
                <div className="space-y-4 mb-8">
                    {sortedTeams.map((team, idx) => (
                        <div key={team.id} className={`flex items-center justify-between p-4 rounded-xl ${idx === 0 ? 'bg-yellow-500/20 border border-yellow-500' : 'bg-slate-700'}`}>
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                                <span className="font-bold text-lg" style={{ color: team.color }}>{team.name}</span>
                            </div>
                            <span className="text-2xl font-bold text-white">{scores[team.id] || 0}</span>
                        </div>
                    ))}
                </div>
                {isHost && (
                    <button onClick={playAgain} className="w-full py-4 bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white rounded-xl font-bold text-lg">
                        再來一局
                    </button>
                )}
            </div>
        </div>
    );
}

// =================================================================
// Settings Modal
// =================================================================
function SketchSettingsModal({ localSettings, setLocalSettings, setShowSettings, onSave }) {
    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-700 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                    <h3 className="font-bold text-xl text-white">遊戲設定</h3>
                    <button onClick={() => setShowSettings(false)}><X className="text-slate-400 hover:text-white" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">Phase 1 時間 - 繪圖 (秒)</label>
                        <input type="number" value={localSettings.phase1Time} onChange={e => setLocalSettings({ ...localSettings, phase1Time: parseInt(e.target.value) || 10 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">Phase 2 時間 - 隊友猜題 (秒)</label>
                        <input type="number" value={localSettings.phase2Time} onChange={e => setLocalSettings({ ...localSettings, phase2Time: parseInt(e.target.value) || 10 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">Phase 3 時間 - 全員搶答 (秒)</label>
                        <input type="number" value={localSettings.phase3Time || 10} onChange={e => setLocalSettings({ ...localSettings, phase3Time: parseInt(e.target.value) || 10 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">總輪數</label>
                        <input type="number" value={localSettings.totalRounds} onChange={e => setLocalSettings({ ...localSettings, totalRounds: parseInt(e.target.value) || 5 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">隊友猜對得分 (Phase 2)</label>
                        <input type="number" value={localSettings.pointsPhase1} onChange={e => setLocalSettings({ ...localSettings, pointsPhase1: parseInt(e.target.value) || 3 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-400 block mb-1">搶答得分 (Phase 3)</label>
                        <input type="number" value={localSettings.pointsPhase2} onChange={e => setLocalSettings({ ...localSettings, pointsPhase2: parseInt(e.target.value) || 1 })} className="w-full bg-slate-700 border border-slate-600 px-4 py-2 rounded-lg text-white" />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={localSettings.permissions?.allowPlayerAddWords || false} onChange={e => setLocalSettings({ ...localSettings, permissions: { ...localSettings.permissions, allowPlayerAddWords: e.target.checked } })} className="w-5 h-5 rounded" />
                        <span className="text-slate-300">允許玩家新增題目</span>
                    </label>
                </div>
                <div className="flex gap-3 pt-4 border-t border-slate-700">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-slate-700 text-white rounded-lg font-bold">取消</button>
                    <button onClick={onSave} className="flex-1 py-3 bg-pink-500 text-white rounded-lg font-bold">儲存</button>
                </div>
            </div>
        </div>
    );
}

// =================================================================
// Cloud Library Modal
// =================================================================
function SketchCloudLibraryModal({ onClose, onImport, db, currentUser, isAdmin }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDecks = async () => {
            try {
                const q = query(collection(db, 'public_decks'), orderBy('createdAt', 'desc'), limit(20));
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setDecks(list);
                console.log('[SketchGame] 載入雲端題庫:', list.length, '個');
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
            await deleteDoc(doc(db, 'public_decks', deckId));
            setDecks(decks.filter(d => d.id !== deckId));
        } catch (e) {
            alert("刪除失敗");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh] border border-slate-700">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
                    <h3 className="font-bold text-2xl flex items-center gap-2 text-white">
                        <Cloud className="text-sky-400" /> 雲端題庫圖書館
                    </h3>
                    <button onClick={onClose}><X className="text-slate-400 hover:text-white" /></button>
                </div>

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
                                    <div className="text-sm text-slate-400 flex gap-3">
                                        <span>題目數: {deck.words?.length || 0}</span>
                                        <span className="font-mono bg-slate-600 px-1 rounded text-xs">ID: {deck.id.slice(0, 6)}...</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">上傳者: {deck.creatorEmail || "未知"}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onImport(deck.id)}
                                        className="bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1"
                                    >
                                        <Download size={16} /> 下載
                                    </button>

                                    {isAdmin && (
                                        <button
                                            onClick={() => deleteDeck(deck.id)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-500/20 rounded-lg transition"
                                            title="刪除 (管理員專用)"
                                        >
                                            <Trash2 size={18} />
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
