import React, { useState, useEffect, useCallback } from 'react';
import {
    doc, setDoc, getDoc, onSnapshot, updateDoc,
    runTransaction, serverTimestamp,
    addDoc, collection, deleteDoc, getDocs, query, orderBy, limit, where
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
    Users, Play, Plus, Check, X,
    ClipboardCopy,
    ArrowLeft, LogOut, Trash2, Crown,
    Cloud, Download, Library, Edit,
    HeartHandshake, Mic, Headphones, SkipForward, RefreshCw, UserPlus
} from 'lucide-react';

import { db, auth } from './firebase';
import { DEFAULT_SHARE_QUESTIONS } from './shareData';

const DEFAULT_SETTINGS = {
    permissions: {
        allowPlayerAddQuestions: false
    }
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateId = () => Math.random().toString(36).substring(2, 10);

// ★★★ 主元件 ★★★
export default function ShareGame({ onBack, getNow, currentUser, isAdmin }) {
    const [user, setUser] = useState(currentUser || null);
    const [view, setView] = useState('lobby');
    const [roomId, setRoomId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [loading, setLoading] = useState(false);

    const getCurrentTime = useCallback(() => {
        if (typeof getNow === 'function') return getNow();
        return Date.now();
    }, [getNow]);

    useEffect(() => {
        document.title = "心靈共鳴 | Soul Resonance";
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                setUser(u);
                console.log("[ShareGame] User logged in:", u.uid.slice(0, 5));
            } else {
                signInAnonymously(auth).catch(console.error);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user || !roomId) return;
        console.log("[ShareGame] Subscribing to room:", roomId);
        const unsubscribe = onSnapshot(doc(db, 'share_rooms', `room_${roomId}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRoomData(data);
                console.log("[ShareGame] Room data updated:", data.status);

                const amIInRoom = data.players?.some(p => p.id === user.uid);
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

    const checkAndLeaveOldRoom = async (uid, newRoomId) => {
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                const oldRoomId = userSnap.data().currentShareRoomId;
                if (oldRoomId && oldRoomId !== newRoomId) {
                    const oldRoomRef = doc(db, 'share_rooms', `room_${oldRoomId}`);
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
            await setDoc(userRef, { currentShareRoomId: newRoomId }, { merge: true });
        } catch (e) {
            console.error("[ShareGame] Cleanup old room failed:", e);
        }
    };

    const clearUserRoomRecord = async (uid) => {
        try {
            await updateDoc(doc(db, 'users', uid), { currentShareRoomId: null });
        } catch (e) { console.error(e); }
    };

    const createRoom = async () => {
        if (!playerName.trim()) return alert("請輸入名字");
        setLoading(true);
        try {
            const newRoomId = generateRoomId();
            await checkAndLeaveOldRoom(user.uid, newRoomId);
            const me = { id: user.uid, name: playerName, isHost: true };

            await setDoc(doc(db, 'share_rooms', `room_${newRoomId}`), {
                id: newRoomId,
                hostId: user.uid,
                status: 'waiting',
                players: [me],
                settings: DEFAULT_SETTINGS,
                useDefaultQuestions: true,
                customQuestionDecks: [],
                turnOrder: [],
                currentTurnIndex: 0,
                currentQuestion: null,
                gamePhase: 'idle'
            });
            console.log("[ShareGame] Room created:", newRoomId);
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
            const roomRef = doc(db, 'share_rooms', `room_${rId}`);

            await runTransaction(db, async (transaction) => {
                const roomDoc = await transaction.get(roomRef);
                if (!roomDoc.exists()) throw new Error("房間不存在");
                const data = roomDoc.data();
                const currentPlayers = data.players || [];
                const playerIndex = currentPlayers.findIndex(p => p.id === user.uid);
                const newPlayer = { id: user.uid, name: playerName, isHost: false };
                let newPlayersList;
                if (playerIndex >= 0) {
                    newPlayersList = [...currentPlayers];
                    newPlayersList[playerIndex] = { ...newPlayersList[playerIndex], name: playerName };
                } else {
                    newPlayersList = [...currentPlayers, newPlayer];
                }
                transaction.update(roomRef, { players: newPlayersList });
            });

            console.log("[ShareGame] Joined room:", rId);
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
            const ref = doc(db, 'share_rooms', `room_${roomId}`);
            const newPlayers = roomData.players.filter(p => p.id !== user.uid);
            await clearUserRoomRecord(user.uid);
            if (newPlayers.length === 0) {
                await deleteDoc(ref);
            } else {
                if (roomData.hostId === user.uid) {
                    await updateDoc(ref, { players: newPlayers, hostId: newPlayers[0].id });
                } else {
                    await updateDoc(ref, { players: newPlayers });
                }
            }
        } catch (e) { console.error("Leave error", e); }
        setView('lobby');
        setRoomId('');
        setRoomData(null);
    };

    if (view === 'lobby') {
        return <ShareLobbyView onBack={onBack} playerName={playerName} setPlayerName={setPlayerName}
            roomId={roomId} setRoomId={setRoomId} createRoom={createRoom} joinRoom={joinRoom}
            loading={loading} user={user} />;
    }

    if (!roomData) return <div className="min-h-screen bg-stone-900 flex items-center justify-center text-white">載入中...</div>;
    const isHost = roomData.hostId === user?.uid;

    return (
        <div className="min-h-screen bg-[#fdfbf7] flex flex-col">
            <header className="bg-white shadow-sm p-3 flex justify-between items-center z-20 sticky top-0 border-b border-stone-200">
                <div className="flex items-center gap-2">
                    <button onClick={leaveRoom} className="p-2 hover:bg-stone-100 rounded-full text-stone-600 transition-colors"><LogOut size={20} /></button>
                    <div className="flex flex-col">
                        <span className="text-xs text-stone-500">房間代碼</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-stone-700 text-lg">
                            {roomData.id}
                            <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-stone-400 hover:text-stone-600"><ClipboardCopy size={14} /></button>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end mr-2">
                        <span className="text-xs text-stone-500">玩家</span>
                        <span className="font-bold text-stone-700">{user.isAnonymous ? playerName : user.displayName || playerName}</span>
                    </div>
                    {isHost && <span className="text-xs bg-stone-700 text-white px-2 py-1 rounded-full font-bold flex items-center gap-1"><Crown size={12} /> 主持人</span>}
                </div>
            </header>

            <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-4">
                {view === 'room' && <ShareRoomView roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user} isAdmin={isAdmin} />}
                {view === 'game' && <ShareGameInterface roomData={roomData} isHost={isHost} roomId={roomId} currentUser={user} getCurrentTime={getCurrentTime} />}
                {view === 'result' && <ShareResultView roomData={roomData} isHost={isHost} roomId={roomId} />}
            </main>
        </div>
    );
}

// ★★★ 大廳視圖 (Stone Theme) ★★★
function ShareLobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-stone-800 via-stone-700 to-stone-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
                <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors"><ArrowLeft /></button>
                <div className="text-center pt-6">
                    <div className="w-16 h-16 bg-amber-600/80 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <HeartHandshake className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-stone-100">心靈共鳴</h1>
                    <p className="text-stone-400 text-sm mt-1">輕鬆分享，溫暖連結</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-stone-400 ml-1">你的名字</label>
                        <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                            className="w-full px-4 py-3 bg-amber-900/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-amber-500/50 outline-none placeholder-stone-500 text-white"
                            placeholder="怎麼稱呼你？" />
                        {user && <div className="text-[10px] text-stone-500 mt-1 text-right font-mono">ID: {user.uid.slice(0, 5)}...</div>}
                    </div>
                    <button onClick={createRoom} disabled={loading || !user}
                        className="w-full py-3 bg-stone-600 hover:bg-stone-500 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95">
                        建立新房間
                    </button>
                    <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-2 text-stone-500">或是加入房間</span></div>
                    </div>
                    <div className="flex gap-2">
                        <input value={roomId} onChange={e => setRoomId(e.target.value.toUpperCase())}
                            className="flex-1 px-4 py-3 bg-amber-900/30 border border-white/10 rounded-xl uppercase text-center font-mono tracking-widest placeholder-stone-500 text-white"
                            placeholder="房間 ID" />
                        <button onClick={joinRoom} disabled={loading || !user}
                            className="px-6 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl font-bold transition">
                            加入
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ★★★ 房間視圖 (Stone Theme) ★★★
function ShareRoomView({ roomData, isHost, roomId, currentUser, isAdmin }) {
    const [editingDeck, setEditingDeck] = useState(null);
    const [newDeckName, setNewDeckName] = useState("");
    const [showCloudLibrary, setShowCloudLibrary] = useState(false);

    const players = roomData.players || [];
    const customDecks = roomData.customQuestionDecks || [];
    const canAddQuestions = isHost || roomData.settings?.permissions?.allowPlayerAddQuestions;

    const kickPlayer = async (targetId) => {
        if (!window.confirm("確定要踢出這位玩家嗎？")) return;
        const newPlayers = players.filter(p => p.id !== targetId);
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { players: newPlayers });
    };

    const makeHost = async (targetId) => {
        if (!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { hostId: targetId });
    };

    const toggleDefaultQuestions = async () => {
        if (!isHost) return;
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { useDefaultQuestions: !roomData.useDefaultQuestions });
    };

    const addDeck = async () => {
        if (!newDeckName.trim()) return;
        const newDeck = { id: generateId(), name: newDeckName.trim(), questions: [], enabled: true };
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: [...customDecks, newDeck] });
        setNewDeckName("");
    };

    const toggleDeck = async (deckId) => {
        if (!isHost) return;
        const updated = customDecks.map(d => d.id === deckId ? { ...d, enabled: !d.enabled } : d);
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: updated });
    };

    const startGame = async () => {
        let allQuestions = [];
        if (roomData.useDefaultQuestions !== false) allQuestions = [...DEFAULT_SHARE_QUESTIONS];
        customDecks.forEach(d => { if (d.enabled) allQuestions.push(...d.questions); });

        if (allQuestions.length === 0) {
            alert("目前沒有任何題目！請先啟用內建題庫或新增自訂題目。");
            return;
        }

        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
        const turnOrder = shuffledPlayers.map(p => p.id);
        const firstQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];

        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), {
            status: 'playing',
            turnOrder,
            currentTurnIndex: 0,
            currentQuestion: firstQuestion,
            gamePhase: 'sharing',
            questionPool: allQuestions
        });
        console.log("[ShareGame] Game started with", allQuestions.length, "questions");
    };

    const importDeckFromCloud = async (code) => {
        try {
            const deckDoc = await getDoc(doc(db, 'share_cloud_decks', code.trim()));
            if (deckDoc.exists()) {
                const deck = deckDoc.data();
                const newDeck = { id: generateId(), name: deck.name, questions: deck.questions || [], enabled: true };
                await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: [...customDecks, newDeck] });
                alert(`成功匯入：${deck.name} (${deck.questions?.length} 題)`);
                setShowCloudLibrary(false);
            } else {
                alert("找不到此代碼的題庫");
            }
        } catch (e) {
            alert("匯入失敗：" + e.message);
        }
    };

    return (
        <div className="space-y-6">
            {showCloudLibrary && <ShareCloudLibraryModal onClose={() => setShowCloudLibrary(false)} onImport={importDeckFromCloud} isAdmin={isAdmin} currentUser={currentUser} />}
            {editingDeck && <ShareDeckEditorModal deck={editingDeck} setDeck={setEditingDeck} roomId={roomId} customDecks={customDecks} isHost={isHost} isAdmin={isAdmin} currentUser={currentUser} />}

            <div className="grid md:grid-cols-2 gap-6">
                {/* 玩家列表 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <h2 className="text-xl font-bold text-stone-700 flex items-center gap-2 mb-4">
                        <Users className="text-stone-500" /> 參與者 ({players.length})
                    </h2>
                    <div className="space-y-2">
                        {players.map(p => (
                            <div key={p.id} className="flex items-center justify-between bg-stone-50 p-3 rounded-xl border border-stone-100">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-stone-700">{p.name}</span>
                                    {p.id === roomData.hostId && <Crown size={14} className="text-amber-500 fill-amber-500" />}
                                    {p.id === currentUser.uid && <span className="text-xs bg-stone-200 text-stone-600 px-1 rounded">我</span>}
                                </div>
                                {isHost && p.id !== currentUser.uid && (
                                    <div className="flex gap-1">
                                        <button onClick={() => makeHost(p.id)} className="text-stone-400 hover:text-amber-500 p-1"><Crown size={14} /></button>
                                        <button onClick={() => kickPlayer(p.id)} className="text-stone-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 題庫設定 */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <h2 className="text-xl font-bold text-stone-700 flex items-center gap-2 mb-4">
                        <Library className="text-stone-500" /> 題庫設定
                    </h2>

                    {/* 內建題庫 */}
                    <div onClick={toggleDefaultQuestions}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all mb-3 ${isHost ? 'cursor-pointer' : 'opacity-70'} ${roomData.useDefaultQuestions !== false ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center ${roomData.useDefaultQuestions !== false ? 'bg-stone-600 border-stone-600' : 'border-stone-300'}`}>
                                {roomData.useDefaultQuestions !== false && <Check size={14} className="text-white" />}
                            </div>
                            <div>
                                <div className="font-bold text-stone-700">內建題庫 (50題)</div>
                                <div className="text-xs text-stone-500">破冰、情感、價值觀、未來展望</div>
                            </div>
                        </div>
                    </div>

                    {/* 自訂題庫 */}
                    {customDecks.map(deck => (
                        <div key={deck.id} className="flex items-center gap-2 mb-2">
                            <div onClick={() => toggleDeck(deck.id)}
                                className={`flex-1 flex items-center justify-between p-3 rounded-xl border transition-all ${isHost ? 'cursor-pointer' : 'opacity-70'} ${deck.enabled ? 'border-stone-400 bg-stone-50' : 'border-stone-200 bg-white'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${deck.enabled ? 'bg-stone-600 border-stone-600' : 'border-stone-300'}`}>
                                        {deck.enabled && <Check size={14} className="text-white" />}
                                    </div>
                                    <div className={`font-bold text-stone-700 ${!deck.enabled ? 'line-through opacity-50' : ''}`}>
                                        {deck.name} <span className="text-stone-500 font-normal text-xs">({deck.questions.length}題)</span>
                                    </div>
                                </div>
                            </div>
                            {(isHost || (canAddQuestions && deck.enabled)) && (
                                <button onClick={() => setEditingDeck(deck)} className="p-3 bg-stone-100 hover:bg-stone-200 rounded-xl text-stone-600"><Edit size={18} /></button>
                            )}
                        </div>
                    ))}

                    {/* 新增題庫 */}
                    {(isHost || canAddQuestions) && (
                        <div className="flex gap-2 mt-4">
                            <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)}
                                className="flex-1 border border-stone-200 p-2 rounded-lg text-sm bg-white text-stone-700" placeholder="新題庫名稱..." />
                            <button onClick={addDeck} className="bg-stone-600 text-white px-3 rounded-lg hover:bg-stone-500"><Plus size={18} /></button>
                        </div>
                    )}

                    {/* 雲端題庫 (僅主持人可見) */}
                    {isHost && (
                        <button onClick={() => setShowCloudLibrary(true)} className="w-full mt-4 flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-600 py-2 rounded-xl font-medium transition">
                            <Cloud size={18} /> 瀏覽雲端題庫
                        </button>
                    )}
                </div>
            </div>

            {/* 遊戲說明 */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                <h2 className="text-lg font-bold text-stone-700 mb-3">🎮 遊戲玩法</h2>
                <ul className="text-sm text-stone-600 space-y-2">
                    <li>• 系統隨機決定分享順序，每人輪流成為「分享者」</li>
                    <li>• 分享者會看到一個題目，可以選擇換題或直接分享</li>
                    <li>• 其他人是「傾聽者」，專心聆聽分享內容</li>
                    <li>• 分享完畢後，點擊「下一位」或「指定下一位」</li>
                </ul>
            </div>

            {/* 開始按鈕 */}
            {isHost && (
                <button onClick={startGame}
                    className="w-full py-4 bg-stone-700 hover:bg-stone-600 text-white rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition transform active:scale-95">
                    <Play fill="white" /> 開始分享
                </button>
            )}
        </div>
    );
}

// ★★★ 遊戲介面 (Stone Theme + Reservation Logic v2.1) ★★★
function ShareGameInterface({ roomData, isHost, roomId, currentUser, getCurrentTime }) {
    const [showDesignateModal, setShowDesignateModal] = useState(false);
    const [nextSpeakerCandidate, setNextSpeakerCandidate] = useState(null); // 預約的下一位

    const turnOrder = roomData.turnOrder || [];
    const currentIndex = roomData.currentTurnIndex || 0;
    const currentSpeakerId = turnOrder[currentIndex];
    const currentSpeaker = roomData.players?.find(p => p.id === currentSpeakerId);
    const isSpeaker = currentUser.uid === currentSpeakerId;
    const questionPool = roomData.questionPool || [];

    // 計算尚未發言的玩家 (index > currentIndex)
    const remainingPlayerIds = turnOrder.slice(currentIndex + 1);
    const remainingPlayers = remainingPlayerIds.map(id => roomData.players?.find(p => p.id === id)).filter(Boolean);

    // ★ 回合改變時重置預約 (防卡死)
    useEffect(() => {
        setNextSpeakerCandidate(null);
        console.log("[ShareGame] Turn changed, reset candidate");
    }, [roomData.currentTurnIndex]);

    // 預約的玩家資訊
    const candidatePlayer = nextSpeakerCandidate
        ? roomData.players?.find(p => p.id === nextSpeakerCandidate)
        : null;

    const randomQuestion = async () => {
        if (!isSpeaker && !isHost) return;
        const newQ = questionPool[Math.floor(Math.random() * questionPool.length)];
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { currentQuestion: newQ });
        console.log("[ShareGame] Changed question");
    };

    // ★★★ 下一位 (含交換邏輯) ★★★
    const nextSpeaker = async () => {
        if (!isSpeaker && !isHost) return;

        const nextIndex = currentIndex + 1;
        if (nextIndex >= turnOrder.length) {
            await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { status: 'finished' });
            return;
        }

        const newQ = questionPool[Math.floor(Math.random() * questionPool.length)];

        // 若有預約候選人，執行交換
        if (nextSpeakerCandidate) {
            const targetIndex = turnOrder.indexOf(nextSpeakerCandidate);

            // 驗證候選人仍在後續順序中
            if (targetIndex > currentIndex && targetIndex !== nextIndex) {
                const newTurnOrder = [...turnOrder];
                const temp = newTurnOrder[nextIndex];
                newTurnOrder[nextIndex] = newTurnOrder[targetIndex];
                newTurnOrder[targetIndex] = temp;

                // 原子操作：同時更新 turnOrder, currentTurnIndex, currentQuestion
                await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), {
                    turnOrder: newTurnOrder,
                    currentTurnIndex: nextIndex,
                    currentQuestion: newQ
                });
                console.log("[ShareGame] Swapped and advanced to:", nextSpeakerCandidate);
            } else {
                // 候選人已是下一位或已失效，直接前進
                await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), {
                    currentTurnIndex: nextIndex,
                    currentQuestion: newQ
                });
            }
        } else {
            // 無預約，直接下一位
            await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), {
                currentTurnIndex: nextIndex,
                currentQuestion: newQ
            });
            console.log("[ShareGame] Next speaker:", nextIndex);
        }

        // 本地重置 (useEffect 也會觸發，這裡是備援)
        setNextSpeakerCandidate(null);
    };

    // ★★★ 預約下一位 (僅本地設定) ★★★
    const reserveNextSpeaker = (targetId) => {
        setNextSpeakerCandidate(targetId);
        setShowDesignateModal(false);
        console.log("[ShareGame] Reserved next speaker:", targetId);
    };

    const cancelReservation = () => {
        setNextSpeakerCandidate(null);
        console.log("[ShareGame] Reservation cancelled");
    };

    const endGame = async () => {
        if (!isHost) return;
        if (!window.confirm("確定要提前結束遊戲嗎？")) return;
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { status: 'finished' });
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
            {/* 指定下一位 Modal */}
            {showDesignateModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-lg text-stone-700 flex items-center gap-2">
                                <UserPlus size={20} className="text-amber-600" /> 選擇下一位分享者
                            </h3>
                            <button onClick={() => setShowDesignateModal(false)}><X className="text-stone-400 hover:text-stone-600" /></button>
                        </div>
                        <p className="text-xs text-stone-500 mb-3">選擇後將在按下「下一位」時生效</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {remainingPlayers.length === 0 ? (
                                <div className="text-center text-stone-400 py-4">沒有剩餘的玩家</div>
                            ) : (
                                remainingPlayers.map(p => (
                                    <button key={p.id} onClick={() => reserveNextSpeaker(p.id)}
                                        className="w-full flex items-center justify-between p-3 bg-stone-50 hover:bg-amber-50 rounded-xl border border-stone-200 hover:border-amber-300 transition">
                                        <span className="font-medium text-stone-700">{p.name}</span>
                                        <span className="text-xs text-stone-400">點擊選擇</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 進度指示 */}
            <div className="text-stone-500 text-sm font-medium">
                第 {currentIndex + 1} / {turnOrder.length} 位分享者
            </div>

            {isSpeaker ? (
                // 分享者視圖
                <div className="w-full max-w-lg space-y-6 animate-fade-in">
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 bg-stone-700 text-white px-4 py-2 rounded-full font-bold mb-4">
                            <Mic size={18} /> 你是分享者
                        </div>
                    </div>

                    {/* 題目卡片 (紙質風格) */}
                    <div className="bg-[#fffef9] rounded-2xl p-8 shadow-lg border border-stone-200 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 to-amber-500"></div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-stone-700 leading-relaxed">{roomData.currentQuestion}</p>
                        </div>
                    </div>

                    {/* 預約提示 */}
                    {candidatePlayer && (
                        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                            <span className="text-amber-700 font-medium">👆 已預約下一位：{candidatePlayer.name}</span>
                            <button onClick={cancelReservation} className="text-amber-500 hover:text-amber-700 text-sm underline">取消</button>
                        </div>
                    )}

                    {/* 操作按鈕 */}
                    <div className="flex gap-3">
                        <button onClick={randomQuestion}
                            className="flex-1 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-xl font-bold flex items-center justify-center gap-2 transition">
                            <RefreshCw size={18} /> 換一題
                        </button>
                        <button onClick={nextSpeaker}
                            className="flex-1 py-3 bg-stone-700 hover:bg-stone-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition">
                            <SkipForward size={18} /> 下一位
                        </button>
                    </div>

                    {/* 指定下一位按鈕 (只在有剩餘玩家且無預約時顯示) */}
                    {remainingPlayers.length > 0 && !candidatePlayer && (
                        <button onClick={() => setShowDesignateModal(true)}
                            className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition border border-amber-200">
                            <UserPlus size={18} /> 指定下一位
                        </button>
                    )}
                </div>
            ) : (
                // 傾聽者視圖
                <div className="w-full max-w-lg space-y-6 animate-fade-in">
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 bg-stone-100 text-stone-600 px-4 py-2 rounded-full font-medium mb-4">
                            <Headphones size={18} /> 傾聽時間
                        </div>
                        <div className="text-2xl font-bold text-stone-700 mb-2">
                            {currentSpeaker?.name} 正在分享...
                        </div>
                    </div>

                    {/* 題目卡片 (傾聽者也能看到) */}
                    <div className="bg-[#fffef9] rounded-2xl p-8 shadow-md border border-stone-200 relative overflow-hidden">
                        <div className="text-center">
                            <p className="text-xl text-stone-600 leading-relaxed">{roomData.currentQuestion}</p>
                        </div>
                        {/* 呼吸燈動畫 (柔和版) */}
                        <div className="absolute inset-0 bg-gradient-to-r from-stone-100/30 to-amber-50/30 animate-pulse pointer-events-none"></div>
                    </div>

                    <p className="text-center text-stone-500 text-sm">請專心聆聽，給予對方溫暖的回應 🤝</p>
                </div>
            )}

            {/* 主持人強制結束 */}
            {isHost && (
                <button onClick={endGame} className="text-stone-400 hover:text-stone-600 text-sm underline mt-4">
                    提前結束遊戲
                </button>
            )}

            {/* CSS 動畫 */}
            <style>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
            `}</style>
        </div>
    );
}

// ★★★ 結果視圖 (Stone Theme) ★★★
function ShareResultView({ roomData, isHost, roomId }) {
    const backToRoom = async () => {
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), {
            status: 'waiting',
            turnOrder: [],
            currentTurnIndex: 0,
            currentQuestion: null,
            gamePhase: 'idle',
            questionPool: []
        });
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-4 space-y-6">
            <div className="text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-stone-600 to-stone-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <HeartHandshake className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-stone-700 mb-2">分享結束 🎉</h2>
                <p className="text-stone-500">感謝大家的真誠分享！</p>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-lg border border-stone-200 max-w-md w-full">
                <h3 className="font-bold text-stone-700 mb-3">本輪參與者</h3>
                <div className="flex flex-wrap gap-2">
                    {roomData.players?.map(p => (
                        <span key={p.id} className="bg-stone-100 text-stone-600 px-3 py-1 rounded-full text-sm">{p.name}</span>
                    ))}
                </div>
            </div>

            {isHost && (
                <button onClick={backToRoom}
                    className="py-3 px-8 bg-stone-700 hover:bg-stone-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition">
                    <RefreshCw size={18} /> 再來一輪
                </button>
            )}
        </div>
    );
}

// ★★★ 雲端題庫圖書館 (Stone Theme) ★★★
function ShareCloudLibraryModal({ onClose, onImport, isAdmin, currentUser }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDecks = async () => {
            try {
                const q = query(collection(db, 'share_cloud_decks'), orderBy('createdAt', 'desc'), limit(20));
                const snapshot = await getDocs(q);
                setDecks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (e) {
                console.error("[ShareGame] Fetch cloud decks error:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchDecks();
    }, []);

    const deleteDeck = async (deckId) => {
        if (!isAdmin) return alert("權限不足：只有管理員可以刪除雲端題庫！");
        if (!window.confirm("確定要從雲端永久刪除此題庫嗎？")) return;
        try {
            await deleteDoc(doc(db, 'share_cloud_decks', deckId));
            setDecks(decks.filter(d => d.id !== deckId));
        } catch (e) {
            alert("刪除失敗");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center border-b border-stone-200 pb-4 mb-4">
                    <h3 className="font-bold text-2xl flex items-center gap-2 text-stone-700">
                        <Cloud className="text-stone-500" /> 雲端題庫
                    </h3>
                    <button onClick={onClose}><X className="text-stone-400 hover:text-stone-600" /></button>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-stone-400">載入中...</div>
                    ) : decks.length === 0 ? (
                        <div className="text-center py-10 text-stone-400">目前沒有公開題庫</div>
                    ) : (
                        decks.map(deck => (
                            <div key={deck.id} className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold text-lg text-stone-700">{deck.name}</h4>
                                    <div className="text-sm text-stone-500">題目數: {deck.questions?.length || 0}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onImport(deck.id)}
                                        className="bg-stone-600 hover:bg-stone-500 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-1">
                                        <Download size={16} /> 下載
                                    </button>
                                    {isAdmin && (
                                        <button onClick={() => deleteDeck(deck.id)}
                                            className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
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

// ★★★ 題庫編輯器 (Stone Theme) ★★★
function ShareDeckEditorModal({ deck, setDeck, roomId, customDecks, isHost, isAdmin, currentUser }) {
    const [newQuestion, setNewQuestion] = useState("");

    const addQuestion = async () => {
        if (!newQuestion.trim()) return;
        const updated = customDecks.map(d => d.id === deck.id ? { ...d, questions: [...d.questions, newQuestion.trim()] } : d);
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: updated });
        setDeck(updated.find(d => d.id === deck.id));
        setNewQuestion("");
    };

    const removeQuestion = async (q) => {
        if (!isHost) return;
        const updated = customDecks.map(d => d.id === deck.id ? { ...d, questions: d.questions.filter(x => x !== q) } : d);
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: updated });
        setDeck(updated.find(d => d.id === deck.id));
    };

    const deleteDeck = async () => {
        if (!isHost) return alert("只有主持人可以刪除題庫");
        if (!window.confirm("確定刪除此題庫？")) return;
        const updated = customDecks.filter(d => d.id !== deck.id);
        await updateDoc(doc(db, 'share_rooms', `room_${roomId}`), { customQuestionDecks: updated });
        setDeck(null);
    };

    const uploadToCloud = async () => {
        if (!isAdmin) return alert("權限不足：您必須是管理員才能上傳題庫到雲端！");
        try {
            const q = query(collection(db, 'share_cloud_decks'), where("name", "==", deck.name));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                if (!window.confirm(`雲端已存在同名題庫「${deck.name}」，確定要覆蓋嗎？`)) return;
                const existingDoc = snapshot.docs[0];
                await updateDoc(doc(db, 'share_cloud_decks', existingDoc.id), { questions: deck.questions, updatedAt: serverTimestamp() });
                alert(`題庫「${deck.name}」已更新！`);
            } else {
                await addDoc(collection(db, 'share_cloud_decks'), { name: deck.name, questions: deck.questions, createdAt: serverTimestamp(), creatorId: currentUser.uid });
                alert("題庫已上傳到雲端！");
            }
        } catch (e) {
            alert("上傳失敗：" + e.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-stone-700">
                        <Edit size={18} className="text-stone-500" /> {deck.name}
                        <span className="text-xs text-stone-500 font-normal">({deck.questions.length}題)</span>
                    </h3>
                    <button onClick={() => setDeck(null)}><X className="text-stone-400 hover:text-stone-600" /></button>
                </div>

                <div className="flex gap-2">
                    <input value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                        className="flex-1 border border-stone-200 p-2 rounded-lg text-sm text-stone-700" placeholder="輸入新題目..."
                        onKeyDown={e => e.key === 'Enter' && addQuestion()} />
                    <button onClick={addQuestion} className="bg-stone-600 text-white px-3 rounded-lg"><Plus /></button>
                </div>

                {isHost && isAdmin && (
                    <button onClick={uploadToCloud} className="flex items-center gap-1 bg-stone-100 hover:bg-stone-200 text-stone-600 px-3 py-2 rounded-lg text-sm">
                        <Cloud size={14} /> 上傳雲端 (管理員)
                    </button>
                )}

                <div className="flex-1 overflow-y-auto border border-stone-200 rounded-lg p-2 bg-stone-50 space-y-1">
                    {deck.questions.map((q, i) => (
                        <div key={i} className="flex justify-between items-center bg-white p-2 rounded shadow-sm">
                            <span className="text-stone-700 text-sm">{q}</span>
                            {isHost && <button onClick={() => removeQuestion(q)} className="text-stone-300 hover:text-red-500"><X size={14} /></button>}
                        </div>
                    ))}
                    {deck.questions.length === 0 && <div className="text-center text-stone-400 py-4">還沒有題目，快新增吧！</div>}
                </div>

                <div className="pt-2 border-t border-stone-200 flex justify-between">
                    {isHost ? <button onClick={deleteDeck} className="text-red-500 text-sm flex items-center gap-1"><Trash2 size={14} /> 刪除</button> : <div></div>}
                    <button onClick={() => setDeck(null)} className="bg-stone-700 text-white px-6 py-2 rounded-lg text-sm font-bold">完成</button>
                </div>
            </div>
        </div>
    );
}
