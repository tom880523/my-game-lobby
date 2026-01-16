import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    doc, setDoc, getDoc, onSnapshot, updateDoc,
    runTransaction, deleteDoc, collection, addDoc, getDocs,
    query, orderBy, limit, where, serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
    Users, Play, Settings, Plus, Check, X,
    Shuffle, ClipboardCopy, Trophy,
    ArrowLeft, LogOut, Trash2, Crown,
    Send, Sparkles, PartyPopper, Library, Download, Cloud, StopCircle, Edit
} from 'lucide-react';

// 引入共用 Firebase
import { db, auth } from './firebase';
// 引入 Emoji 題庫
import { EMOJI_QUESTIONS, shuffleQuestions } from './emojiData';

// =================================================================
// 預設設定
// =================================================================
const DEFAULT_SETTINGS = {
    pointsCorrect: 3,
    totalQuestions: 10,
    timePerQuestion: 40, // 每題答題時間(秒)
    teams: [
        { id: 'team_a', name: 'A 隊', color: '#ef4444' },
        { id: 'team_b', name: 'B 隊', color: '#3b82f6' }
    ],
    permissions: {
        allowPlayerAddWords: false // 允許參賽者新增題目
    }
};

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const generateId = () => Math.random().toString(36).substring(2, 10);

// =================================================================
// 主元件
// =================================================================
export default function EmojiGame({ onBack, getNow, currentUser, isAdmin }) {
    const [user, setUser] = useState(currentUser || null);

    const [view, setView] = useState('lobby');
    const [roomId, setRoomId] = useState('');
    const [playerName, setPlayerName] = useState('');
    const [roomData, setRoomData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [localSettings, setLocalSettings] = useState(DEFAULT_SETTINGS);
    const [showSettings, setShowSettings] = useState(false);

    // 安全的時間獲取函式
    const getCurrentTime = () => {
        if (typeof getNow === 'function') return getNow();
        return Date.now();
    };

    // 遊戲標題設定
    useEffect(() => {
        document.title = "Emoji 猜詞語 | Party Game";
        console.log('[EmojiGame] 元件已載入');
    }, []);

    // 監聽登入狀態
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                console.log('[EmojiGame] 使用者已登入:', u.uid.slice(0, 5));
                setUser(u);
            } else {
                console.log('[EmojiGame] 未登入，嘗試匿名登入...');
                signInAnonymously(auth).catch(console.error);
            }
        });
        return () => unsubscribe();
    }, []);

    // 房間同步
    useEffect(() => {
        if (!user || !roomId) return;
        console.log(`[EmojiGame] 監聽房間: emoji_room_${roomId}`);

        const unsubscribe = onSnapshot(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                console.log('[EmojiGame] 房間資料更新:', data.status);
                setRoomData(data);

                // 檢查是否被踢出
                const amIInRoom = data.players && data.players.some(p => p.id === user.uid);
                if (!amIInRoom && view !== 'lobby') {
                    alert("你已被踢出房間或房間已重置");
                    setView('lobby');
                    setRoomData(null);
                    return;
                }

                // 自動切換畫面
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

    // 檢查並離開舊房間
    const checkAndLeaveOldRoom = async (uid, newRoomId) => {
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                const oldRoomId = userSnap.data().currentEmojiRoomId;
                if (oldRoomId && oldRoomId !== newRoomId) {
                    console.log('[EmojiGame] 離開舊房間:', oldRoomId);
                    const oldRoomRef = doc(db, 'emoji_rooms', `emoji_room_${oldRoomId}`);
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
            await setDoc(userRef, { currentEmojiRoomId: newRoomId }, { merge: true });
        } catch (e) {
            console.error("[EmojiGame] 清理舊房間失敗:", e);
        }
    };

    const clearUserRoomRecord = async (uid) => {
        try {
            await updateDoc(doc(db, 'users', uid), { currentEmojiRoomId: null });
        } catch (e) { console.error(e); }
    };

    // 建立房間
    const createRoom = async () => {
        if (!playerName.trim()) return alert("請輸入名字");
        setLoading(true);
        console.log('[EmojiGame] 建立房間...');
        try {
            const newRoomId = generateRoomId();
            await checkAndLeaveOldRoom(user.uid, newRoomId);

            const me = { id: user.uid, name: playerName, team: null, isHost: true };

            await setDoc(doc(db, 'emoji_rooms', `emoji_room_${newRoomId}`), {
                id: newRoomId,
                hostId: user.uid,
                status: 'waiting',
                players: [me],
                settings: DEFAULT_SETTINGS,
                scores: {},
                currentQuestionIndex: 0,
                questions: [],
                currentQuestion: null,
                lastCorrectTeam: null,
                lastCorrectPlayer: null,
                lastEvent: null,
                // 全域同步結果顯示
                roundResult: null,
                // 自訂題庫
                useDefaultQuestions: true,
                customCategories: []
            });

            console.log('[EmojiGame] 房間已建立:', newRoomId);
            setRoomId(newRoomId);
            setView('room');
        } catch (e) {
            console.error('[EmojiGame] 建立失敗:', e);
            alert("建立失敗: " + e.message);
        }
        setLoading(false);
    };

    // 加入房間
    const joinRoom = async () => {
        if (!playerName.trim() || !roomId.trim()) return alert("請輸入資料");
        setLoading(true);
        console.log('[EmojiGame] 加入房間:', roomId);
        try {
            const rId = roomId.toUpperCase();
            await checkAndLeaveOldRoom(user.uid, rId);

            const roomRef = doc(db, 'emoji_rooms', `emoji_room_${rId}`);

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

            console.log('[EmojiGame] 成功加入房間');
            setRoomId(rId);
            setView('room');
        } catch (e) {
            console.error('[EmojiGame] 加入失敗:', e);
            alert("加入失敗: " + e.message);
        }
        setLoading(false);
    };

    // 離開房間
    const leaveRoom = async () => {
        if (!window.confirm("確定離開房間？")) return;
        console.log('[EmojiGame] 離開房間');
        try {
            const ref = doc(db, 'emoji_rooms', `emoji_room_${roomId}`);
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
        } catch (e) { console.error("[EmojiGame] 離開錯誤", e); }
        setView('lobby');
        setRoomId('');
        setRoomData(null);
    };

    // 開始遊戲
    const startGame = async () => {
        console.log('[EmojiGame] 開始遊戲');

        // 收集所有要使用的題目
        let allQuestions = [];
        if (roomData.useDefaultQuestions !== false) {
            allQuestions = [...EMOJI_QUESTIONS];
        }
        if (roomData.customCategories) {
            roomData.customCategories.forEach(cat => {
                if (cat.enabled && cat.questions) {
                    allQuestions.push(...cat.questions);
                }
            });
        }

        if (allQuestions.length === 0) {
            alert("目前沒有任何題目！請先啟用內建題庫或匯入雲端題庫。");
            return;
        }

        const shuffled = shuffleQuestions(allQuestions);
        const selectedQuestions = shuffled.slice(0, roomData.settings.totalQuestions);

        const initialScores = {};
        roomData.settings.teams.forEach(t => initialScores[t.id] = 0);

        const timePerQ = roomData.settings.timePerQuestion || 40;
        const questionEndTime = getCurrentTime() + (timePerQ * 1000);

        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            status: 'playing',
            questions: selectedQuestions,
            currentQuestionIndex: 0,
            currentQuestion: selectedQuestions[0],
            scores: initialScores,
            lastCorrectTeam: null,
            lastCorrectPlayer: null,
            lastCorrectQuestion: null,
            lastEvent: null,
            questionEndTime: questionEndTime,
            roundResult: null // 全域同步結果
        });
    };


    // Lobby 畫面
    if (view === 'lobby') {
        return (
            <EmojiLobbyView
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
                <div className="animate-spin w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full"></div>
                <span className="ml-3">載入中...</span>
            </div>
        );
    }

    const isHost = roomData.hostId === user?.uid;

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col">
            {/* Header */}
            <header className="bg-slate-800 border-b border-slate-700 p-3 flex justify-between items-center z-20 sticky top-0">
                <div className="flex items-center gap-2">
                    <button onClick={leaveRoom} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors">
                        <LogOut size={20} />
                    </button>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">房間代碼</span>
                        <div className="flex items-center gap-1 font-mono font-bold text-yellow-400 text-lg">
                            {roomData.id}
                            <button onClick={() => navigator.clipboard.writeText(roomData.id)} className="text-slate-500 hover:text-yellow-400">
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

            {/* Main Content */}
            <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
                {view === 'room' && (
                    <EmojiRoomView
                        roomData={roomData}
                        isHost={isHost}
                        isAdmin={isAdmin}
                        roomId={roomId}
                        currentUser={user}
                        onStart={startGame}
                    />
                )}
                {view === 'game' && (
                    <EmojiGameInterface
                        roomData={roomData}
                        roomId={roomId}
                        currentUser={user}
                        getNow={getCurrentTime}
                    />
                )}
                {view === 'result' && (
                    <EmojiResultView
                        roomData={roomData}
                        isHost={isHost}
                        roomId={roomId}
                    />
                )}
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <SettingsModal
                    localSettings={localSettings}
                    setLocalSettings={setLocalSettings}
                    setShowSettings={setShowSettings}
                    onSave={async () => {
                        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { settings: localSettings });
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
function EmojiLobbyView({ onBack, playerName, setPlayerName, roomId, setRoomId, createRoom, joinRoom, loading, user }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-6 relative text-white">
                <button onClick={onBack} className="absolute top-4 left-4 text-white/50 hover:text-white transition-colors">
                    <ArrowLeft />
                </button>
                <div className="text-center pt-6">
                    <div className="text-6xl mb-4">🎯📝</div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-orange-500">
                        Emoji 猜詞語
                    </h1>
                    <p className="text-white/60 text-sm mt-1">看 Emoji 猜答案，搶答得分！</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-white/70 ml-1">你的名字</label>
                        <input
                            value={playerName}
                            onChange={e => setPlayerName(e.target.value)}
                            className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:ring-2 focus:ring-yellow-500 outline-none placeholder-white/30 text-white"
                            placeholder="例如：Emoji 大師"
                        />
                        {user && <div className="text-[10px] text-white/40 mt-1 text-right font-mono">ID: {user.uid.slice(0, 5)}...</div>}
                    </div>
                    <button
                        onClick={createRoom}
                        disabled={loading || !user}
                        className="w-full py-3 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg transform transition active:scale-95 disabled:opacity-50"
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
// Emoji 雲端題庫 Library Modal
// =================================================================
function EmojiCloudLibraryModal({ onClose, onImport, currentUser, isAdmin }) {
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploadMode, setUploadMode] = useState(false);
    const [newDeckName, setNewDeckName] = useState('');
    const [newDeckQuestions, setNewDeckQuestions] = useState('');

    useEffect(() => {
        fetchDecks();
    }, []);

    const fetchDecks = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'emoji_cloud_decks'), orderBy('createdAt', 'desc'), limit(50));
            const snapshot = await getDocs(q);
            setDecks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('[EmojiCloudLibrary] 載入失敗:', e);
        }
        setLoading(false);
    };

    const uploadDeck = async () => {
        if (!newDeckName.trim() || !newDeckQuestions.trim()) return alert("請填寫題庫名稱和題目");
        try {
            const lines = newDeckQuestions.split('\n').filter(l => l.trim());
            const questions = lines.map((line, idx) => {
                const parts = line.split('|');
                return parts.length >= 2 ? { id: `q_${idx}`, emojis: parts[0].trim(), answer: parts[1].trim(), category: newDeckName } : null;
            }).filter(Boolean);
            if (questions.length === 0) return alert("格式錯誤！請用「Emoji|答案」格式");

            await addDoc(collection(db, 'emoji_cloud_decks'), {
                name: newDeckName, questions, authorId: currentUser?.uid || 'anon',
                authorName: currentUser?.displayName || '匿名', createdAt: serverTimestamp(), questionCount: questions.length
            });
            alert(`上傳成功！${questions.length} 題`);
            setNewDeckName(''); setNewDeckQuestions(''); setUploadMode(false); fetchDecks();
        } catch (e) { alert("上傳失敗: " + e.message); }
    };

    const deleteDeck = async (id) => {
        if (!window.confirm("確定刪除？")) return;
        await deleteDoc(doc(db, 'emoji_cloud_decks', id)); fetchDecks();
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-2xl max-h-[80vh] rounded-2xl p-6 border border-slate-700 flex flex-col">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2"><Cloud className="text-cyan-400" /> Emoji 雲端題庫</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X /></button>
                </div>
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setUploadMode(false)} className={`flex-1 py-2 rounded-lg font-medium ${!uploadMode ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>瀏覽題庫</button>
                    {/* 僅管理員可上傳 */}
                    {isAdmin && (
                        <button onClick={() => setUploadMode(true)} className={`flex-1 py-2 rounded-lg font-medium ${uploadMode ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-300'}`}>上傳新題庫</button>
                    )}
                </div>
                {uploadMode && isAdmin ? (
                    <div className="space-y-4 flex-1 overflow-y-auto">
                        <div><label className="text-sm text-slate-300 mb-1 block">題庫名稱</label>
                            <input value={newDeckName} onChange={(e) => setNewDeckName(e.target.value)} className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white" placeholder="例如：電影詞語" /></div>
                        <div><label className="text-sm text-slate-300 mb-1 block">題目 (Emoji|答案，每行一題)</label>
                            <textarea value={newDeckQuestions} onChange={(e) => setNewDeckQuestions(e.target.value)} className="w-full h-40 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white font-mono text-sm" placeholder="🦁👑|獅子王" /></div>
                        <button onClick={uploadDeck} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl font-bold">上傳題庫</button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-3">
                        {loading ? <div className="text-center py-8 text-slate-400">載入中...</div> :
                            decks.length === 0 ? <div className="text-center py-8 text-slate-400">尚無雲端題庫</div> :
                                decks.map(deck => (
                                    <div key={deck.id} className="p-4 bg-slate-700/50 rounded-xl border border-slate-600 flex items-center justify-between">
                                        <div><div className="text-white font-bold">{deck.name}</div><div className="text-slate-400 text-sm">{deck.questionCount || 0} 題 · {deck.authorName}</div></div>
                                        <div className="flex gap-2">
                                            <button onClick={() => onImport(deck)} className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium hover:bg-green-500/30 flex items-center gap-1"><Download size={16} /> 匯入</button>
                                            {/* 僅管理員可刪除 */}
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
// Room View (等待房間)
// =================================================================
function EmojiRoomView({ roomData, isHost, isAdmin, roomId, onStart, currentUser }) {
    const [editingTeamName, setEditingTeamName] = useState(null);
    // eslint-disable-next-line no-unused-vars -- draggedPlayer is set but used in drag handlers via closure
    const [draggedPlayer, setDraggedPlayer] = useState(null);
    const [showCloudLibrary, setShowCloudLibrary] = useState(false);
    const [newCatName, setNewCatName] = useState('');
    const [importCode, setImportCode] = useState('');
    const [editingCategory, setEditingCategory] = useState(null); // 編輯中的題庫
    const [emojiInput, setEmojiInput] = useState(''); // 新題目 - Emoji 欄
    const [answerInput, setAnswerInput] = useState(''); // 新題目 - 答案欄

    const players = roomData.players || [];
    const teams = roomData.settings.teams || [];
    const unassigned = players.filter(p => !p.team);
    const customCategories = roomData.customCategories || [];

    // 權限判定：是否允許新增題目
    const canAddWords = isHost || roomData.settings?.permissions?.allowPlayerAddWords;

    // 主持人可以加入隊伍，所以不需要分開顯示
    const allTeamPlayers = (teamId) => players.filter(p => p.team === teamId);

    // 新增題目到題庫 (雙輸入框版本)
    const addWordToCategory = async () => {
        if (!emojiInput.trim() || !answerInput.trim() || !editingCategory) {
            if (!emojiInput.trim()) alert("請輸入 Emoji 題目！");
            else if (!answerInput.trim()) alert("請輸入答案！");
            return;
        }
        const newQuestion = {
            id: `q_${Date.now()}`,
            emojis: emojiInput.trim(),
            answer: answerInput.trim(),
            category: editingCategory.name
        };
        const updatedQuestions = [...(editingCategory.questions || []), newQuestion];
        const updatedCat = { ...editingCategory, questions: updatedQuestions };
        const updatedCategories = customCategories.map(c => c.id === editingCategory.id ? updatedCat : c);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { customCategories: updatedCategories });
        setEditingCategory(updatedCat);
        setEmojiInput('');
        setAnswerInput('');
    };

    // CSV 匯入題目 (格式: Emoji|答案)
    const handleCSVImport = async (e) => {
        if (!editingCategory) return;
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const text = ev.target?.result;
            if (typeof text !== 'string') return;

            const lines = text.split(/\r?\n/).filter(l => l.trim());
            const newQuestions = [];
            let skipped = 0;

            lines.forEach((line, idx) => {
                const parts = line.split('|');
                if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
                    newQuestions.push({
                        id: `q_${Date.now()}_${idx}`,
                        emojis: parts[0].trim(),
                        answer: parts[1].trim(),
                        category: editingCategory.name
                    });
                } else {
                    skipped++;
                }
            });

            if (newQuestions.length === 0) {
                alert("沒有找到有效的題目！請確認格式為「Emoji|答案」");
                return;
            }

            const updatedQuestions = [...(editingCategory.questions || []), ...newQuestions];
            const updatedCat = { ...editingCategory, questions: updatedQuestions };
            const updatedCategories = customCategories.map(c => c.id === editingCategory.id ? updatedCat : c);
            await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { customCategories: updatedCategories });
            setEditingCategory(updatedCat);

            alert(`成功匯入 ${newQuestions.length} 題！${skipped > 0 ? `\n跳過 ${skipped} 行格式錯誤` : ''}`);
        };
        reader.readAsText(file);
        e.target.value = ''; // 重設 input
    };

    // 刪除題目
    const removeWordFromCategory = async (questionId) => {
        if (!editingCategory) return;
        const updatedQuestions = editingCategory.questions.filter(q => q.id !== questionId);
        const updatedCat = { ...editingCategory, questions: updatedQuestions };
        const updatedCategories = customCategories.map(c => c.id === editingCategory.id ? updatedCat : c);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { customCategories: updatedCategories });
        setEditingCategory(updatedCat);
    };

    // 新增本地題庫分類
    const addLocalCategory = async () => {
        if (!newCatName.trim()) return;
        const newCat = {
            id: `cat_${Date.now()}`,
            name: newCatName.trim(),
            enabled: true,
            questions: []
        };
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            customCategories: [...customCategories, newCat]
        });
        setNewCatName('');
    };

    // 用代碼下載題庫
    const importDeckByCode = async () => {
        if (!importCode.trim()) return;
        try {
            const deckDoc = await getDoc(doc(db, 'emoji_cloud_decks', importCode.trim()));
            if (deckDoc.exists()) {
                const deck = deckDoc.data();
                const newCat = {
                    id: deckDoc.id,
                    name: deck.name,
                    enabled: true,
                    questions: deck.questions || []
                };
                await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                    customCategories: [...customCategories, newCat]
                });
                alert(`成功匯入：${deck.name} (${deck.questions?.length || 0} 題)`);
                setImportCode('');
            } else {
                alert("找不到此代碼的題庫");
            }
        } catch (e) {
            console.error('[EmojiRoomView] 匯入失敗:', e);
            alert("匯入失敗：" + e.message);
        }
    };

    // 上傳題庫到雲端 (僅管理員)
    const uploadCategoryToCloud = async (category) => {
        if (!isAdmin) return alert("權限不足：您必須是管理員才能上傳題庫到雲端！");
        if (!category || !category.questions || category.questions.length === 0) {
            return alert("此題庫沒有題目，無法上傳！");
        }

        try {
            // 檢查是否有同名題庫
            const q = query(collection(db, 'emoji_cloud_decks'), where("name", "==", category.name));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const confirmOverwrite = window.confirm(`雲端已存在同名題庫「${category.name}」，確定要覆蓋嗎？`);
                if (!confirmOverwrite) return;

                const existingDoc = snapshot.docs[0];
                await updateDoc(doc(db, 'emoji_cloud_decks', existingDoc.id), {
                    questions: category.questions,
                    questionCount: category.questions.length,
                    updatedAt: serverTimestamp(),
                    authorId: currentUser?.uid || 'anon'
                });
                alert(`題庫「${category.name}」已更新！代碼：\n${existingDoc.id}`);
            } else {
                const docRef = await addDoc(collection(db, 'emoji_cloud_decks'), {
                    name: category.name,
                    questions: category.questions,
                    questionCount: category.questions.length,
                    createdAt: serverTimestamp(),
                    authorId: currentUser?.uid || 'anon',
                    authorName: currentUser?.displayName || '匿名'
                });
                alert(`題庫已上傳！代碼：\n${docRef.id}`);
            }
        } catch (e) {
            console.error('[EmojiRoomView] 上傳失敗:', e);
            alert("上傳失敗：" + e.message);
        }
    };

    // 隨機分組
    const randomize = async () => {
        console.log('[EmojiRoomView] 隨機分組');
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const teamIds = teams.map(t => t.id);
        const newPlayers = shuffled.map((p, i) => ({ ...p, team: teamIds[i % teamIds.length] }));
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { players: newPlayers });
    };

    // 換隊
    const changePlayerTeam = async (playerId, newTeamId) => {
        console.log(`[EmojiRoomView] 換隊: ${playerId} -> ${newTeamId}`);
        const newPlayers = players.map(p => p.id === playerId ? { ...p, team: newTeamId } : p);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { players: newPlayers });
    };

    // 踢人
    const kickPlayer = async (targetId) => {
        if (!window.confirm("確定要踢出這位玩家嗎？")) return;
        const newPlayers = players.filter(p => p.id !== targetId);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { players: newPlayers });
    };

    // 轉讓主持人
    const makeHost = async (targetId) => {
        if (!window.confirm("確定要將主持人權限移交給這位玩家嗎？")) return;
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { hostId: targetId });
    };

    // 修改隊名
    const updateTeamName = async (teamId, newName) => {
        const newTeams = teams.map(t => t.id === teamId ? { ...t, name: newName } : t);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { 'settings.teams': newTeams });
        setEditingTeamName(null);
    };

    // 新增隊伍
    const addTeam = async () => {
        const colors = ['#22c55e', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
        const newTeam = {
            id: generateId(),
            name: `${String.fromCharCode(65 + teams.length)} 隊`,
            color: colors[teams.length % colors.length]
        };
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            'settings.teams': [...teams, newTeam]
        });
    };

    // 刪除隊伍
    const removeTeam = async (teamId) => {
        if (teams.length <= 2) return alert("至少需要兩個隊伍");
        if (!window.confirm("確定刪除此隊伍？隊員將移至未分組")) return;

        const newTeams = teams.filter(t => t.id !== teamId);
        const newPlayers = players.map(p => p.team === teamId ? { ...p, team: null } : p);
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            'settings.teams': newTeams,
            players: newPlayers
        });
    };

    // 拖曳功能
    const handleDragStart = (e, player) => {
        setDraggedPlayer(player);
        e.dataTransfer.setData("text/plain", player.id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = async (e, teamId) => {
        e.preventDefault();
        const playerId = e.dataTransfer.getData("text/plain");
        if (playerId) {
            await changePlayerTeam(playerId, teamId);
        }
        setDraggedPlayer(null);
    };

    // 玩家項目元件
    const PlayerItem = ({ p, showKick, showPromote }) => {
        const [showMoveMenu, setShowMoveMenu] = useState(false);
        const isMe = p.id === currentUser.uid;
        const isPlayerHost = p.id === roomData.hostId;

        return (
            <div
                className={`relative flex items-center justify-between bg-slate-700/50 p-2 rounded-lg mb-1 border border-slate-600 ${isHost || isMe ? 'cursor-grab active:cursor-grabbing hover:bg-slate-700' : ''}`}
                draggable={isHost || isMe}
                onDragStart={(e) => handleDragStart(e, p)}
                onClick={() => (isHost || isMe) && setShowMoveMenu(!showMoveMenu)}
            >
                <div className="flex items-center gap-2 pointer-events-none">
                    <span className="text-white font-medium">{p.name}</span>
                    {isPlayerHost && <Crown size={14} className="text-yellow-400 fill-yellow-400" />}
                    {isMe && <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1 rounded">我</span>}
                </div>
                <div className="flex gap-1">
                    {showPromote && !isMe && <button onClick={(e) => { e.stopPropagation(); makeHost(p.id) }} className="text-slate-400 hover:text-yellow-400 p-1"><Crown size={14} /></button>}
                    {showKick && !isMe && <button onClick={(e) => { e.stopPropagation(); kickPlayer(p.id) }} className="text-slate-400 hover:text-red-400 p-1"><Trash2 size={14} /></button>}
                </div>
                {showMoveMenu && (isHost || isMe) && (
                    <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-50 p-2 min-w-[150px]">
                        <div className="text-xs font-bold text-slate-400 mb-1 px-2">移動至...</div>
                        <button onClick={() => changePlayerTeam(p.id, null)} className="w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded text-sm text-white">等待區</button>
                        {teams.map(t => (
                            <button key={t.id} onClick={() => changePlayerTeam(p.id, t.id)} className="w-full text-left px-2 py-1.5 hover:bg-slate-700 rounded text-sm text-white">
                                {t.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // 檢查是否所有人都有分組
    const allAssigned = players.every(p => p.team);
    const canStart = allAssigned && players.length >= 2;

    return (
        <div className="p-4 md:p-8 w-full space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
                {/* 左側：隊伍管理 */}
                <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-700 pb-3">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Users className="text-yellow-400" /> 玩家 ({players.length})
                        </h2>
                        <div className="flex gap-2">
                            {isHost && (
                                <>
                                    <button onClick={randomize} className="text-sm bg-yellow-500/20 text-yellow-400 px-4 py-2 rounded-full hover:bg-yellow-500/30 font-bold transition flex items-center gap-1">
                                        <Shuffle size={14} /> 隨機分組
                                    </button>
                                    <button onClick={addTeam} className="text-sm bg-green-500/20 text-green-400 px-3 py-2 rounded-full hover:bg-green-500/30 font-bold transition">
                                        <Plus size={14} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 主持人區塊 */}
                    <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/30 mb-4">
                        <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Crown size={12} /> 主持人
                        </h4>
                        {players.filter(p => p.id === roomData.hostId).map(p => (
                            <PlayerItem key={p.id} p={p} showKick={false} showPromote={false} />
                        ))}
                    </div>

                    {/* 未分組區 */}
                    <div
                        className={`p-3 rounded-xl border border-dashed transition-all ${unassigned.length > 0 ? 'border-orange-400 bg-orange-500/10' : 'border-slate-600 bg-slate-800/50'}`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, null)}
                    >
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">等待分組 ({unassigned.length})</h4>
                            {isHost && <span className="text-[10px] text-slate-500">可拖曳玩家換隊</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {unassigned.map(p => <PlayerItem key={p.id} p={p} showKick={isHost} showPromote={isHost} />)}
                        </div>
                        {unassigned.length === 0 && <div className="text-slate-500 text-sm text-center py-2">無</div>}
                    </div>

                    {/* 隊伍列表 */}
                    <div className="grid grid-cols-1 gap-4">
                        {teams.map((team) => {
                            const teamPlayers = allTeamPlayers(team.id);

                            return (
                                <div
                                    key={team.id}
                                    className="p-4 rounded-xl border border-slate-600 bg-slate-800/50 hover:border-yellow-400/50 transition-colors"
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, team.id)}
                                >
                                    <div className="flex justify-between items-center mb-3">
                                        {isHost && editingTeamName?.id === team.id ? (
                                            <input
                                                autoFocus
                                                className="font-bold text-lg border-b border-yellow-400 outline-none bg-transparent w-full text-white"
                                                value={editingTeamName.name}
                                                onChange={e => setEditingTeamName({ ...editingTeamName, name: e.target.value })}
                                                onBlur={() => updateTeamName(team.id, editingTeamName.name)}
                                                onKeyDown={e => e.key === 'Enter' && updateTeamName(team.id, editingTeamName.name)}
                                            />
                                        ) : (
                                            <h3
                                                className={`font-bold text-lg flex items-center gap-2 ${isHost ? 'cursor-pointer hover:text-yellow-400' : ''} text-white`}
                                                onClick={() => isHost && setEditingTeamName(team)}
                                                title={isHost ? "點擊修改隊名" : ""}
                                            >
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color || 'gray' }}></div>
                                                {team.name}
                                                <span className="text-slate-400 text-sm font-normal">({teamPlayers.length}人)</span>
                                            </h3>
                                        )}
                                        {isHost && teams.length > 2 && (
                                            <button onClick={() => removeTeam(team.id)} className="text-slate-500 hover:text-red-400 p-1">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-1 min-h-[40px]">
                                        {teamPlayers.map(p => <PlayerItem key={p.id} p={p} showKick={isHost} showPromote={isHost} />)}
                                        {teamPlayers.length === 0 && <span className="text-slate-500 text-sm italic p-1 block border border-dashed border-slate-600 rounded text-center">拖曳玩家至此</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 右側：遊戲資訊 */}
                <div className="space-y-6">
                    <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                        <h2 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                            <Sparkles className="text-yellow-400" /> 遊戲資訊
                        </h2>
                        <div className="space-y-3 text-slate-300">
                            <div className="flex justify-between">
                                <span>題目數量</span>
                                <span className="font-bold text-yellow-400">{roomData.settings.totalQuestions} 題</span>
                            </div>
                            <div className="flex justify-between">
                                <span>答對得分</span>
                                <span className="font-bold text-green-400">+{roomData.settings.pointsCorrect} 分</span>
                            </div>
                            <div className="flex justify-between">
                                <span>答題時間</span>
                                <span className="font-bold text-orange-400">{roomData.settings.timePerQuestion || 40} 秒</span>
                            </div>
                            <div className="flex justify-between">
                                <span>隊伍數量</span>
                                <span className="font-bold text-blue-400">{teams.length} 隊</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 p-6 rounded-2xl border border-yellow-500/30">
                        <h3 className="font-bold text-yellow-400 mb-2">🎮 遊戲玩法</h3>
                        <ul className="text-sm text-slate-300 space-y-1">
                            <li>• 螢幕會顯示一串 Emoji</li>
                            <li>• 所有玩家同時搶答輸入答案</li>
                            <li>• 第一個答對的玩家所屬隊伍得分</li>
                            <li>• 答完所有題目後結算分數</li>
                        </ul>
                    </div>

                    {/* 題庫設定 (主持人可見，或有權限的玩家可見題庫列表) */}
                    {(isHost || canAddWords) && (
                        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <Library className="text-cyan-400" size={18} />
                                {isHost ? '題庫設定' : '協作題庫'}
                            </h3>

                            {/* 以下功能僅主持人可見 */}
                            {isHost && (
                                <>
                                    {/* 內建題庫開關 */}
                                    <div className="flex items-center justify-between mb-4 p-3 bg-slate-700/50 rounded-xl">
                                        <span className="text-white">使用內建題庫</span>
                                        <button
                                            onClick={async () => {
                                                await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                                                    useDefaultQuestions: !roomData.useDefaultQuestions
                                                });
                                            }}
                                            className={`w-12 h-6 rounded-full transition-colors ${roomData.useDefaultQuestions !== false ? 'bg-green-500' : 'bg-slate-600'}`}
                                        >
                                            <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${roomData.useDefaultQuestions !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>

                                    {/* 新增本地題庫 */}
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            value={newCatName}
                                            onChange={(e) => setNewCatName(e.target.value)}
                                            placeholder="新題庫名稱"
                                            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400"
                                            onKeyDown={(e) => e.key === 'Enter' && addLocalCategory()}
                                        />
                                        <button
                                            onClick={addLocalCategory}
                                            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg font-medium flex items-center gap-1 transition"
                                        >
                                            <Plus size={16} /> 新增
                                        </button>
                                    </div>

                                    {/* 代碼下載題庫 */}
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            value={importCode}
                                            onChange={(e) => setImportCode(e.target.value)}
                                            placeholder="輸入題庫代碼 (Document ID)"
                                            className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-400 font-mono"
                                            onKeyDown={(e) => e.key === 'Enter' && importDeckByCode()}
                                        />
                                        <button
                                            onClick={importDeckByCode}
                                            className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg font-medium flex items-center gap-1 transition"
                                        >
                                            <Download size={16} /> 下載
                                        </button>
                                    </div>

                                    {/* 雲端題庫圖書館按鈕 */}
                                    <button
                                        onClick={() => setShowCloudLibrary(true)}
                                        className="w-full py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-xl font-medium flex items-center justify-center gap-2 transition"
                                    >
                                        <Cloud size={18} /> 瀏覽雲端題庫圖書館
                                    </button>
                                </>
                            )}

                            {/* 已匯入的自訂題庫 (所有有權限者可見) */}
                            {roomData.customCategories && roomData.customCategories.length > 0 && (
                                <div className={`${isHost ? 'mt-4' : ''} space-y-2`}>
                                    <div className="text-sm text-slate-400">
                                        {isHost ? '已匯入題庫：' : '點擊編輯按鈕新增題目：'}
                                    </div>
                                    {roomData.customCategories.map((cat, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-700/50 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                {/* 啟用/停用勾選框 (僅主持人) */}
                                                {isHost && (
                                                    <button
                                                        onClick={async () => {
                                                            const updated = [...roomData.customCategories];
                                                            updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                                                            await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { customCategories: updated });
                                                        }}
                                                        className={`w-4 h-4 rounded border ${cat.enabled ? 'bg-green-500 border-green-500' : 'border-slate-500'}`}
                                                    >
                                                        {cat.enabled && <Check size={12} className="text-white" />}
                                                    </button>
                                                )}
                                                <span className="text-white text-sm">{cat.name}</span>
                                                <span className="text-slate-400 text-xs">({cat.questions?.length || 0}題)</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {/* 編輯題庫按鈕 (所有有權限者可見) */}
                                                <button
                                                    onClick={() => setEditingCategory(cat)}
                                                    className="text-yellow-400 hover:text-yellow-300 p-1"
                                                    title="編輯題庫"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                                {/* 管理員上傳雲端按鈕 */}
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => uploadCategoryToCloud(cat)}
                                                        className="text-cyan-400 hover:text-cyan-300 p-1"
                                                        title="上傳至雲端"
                                                    >
                                                        <Cloud size={14} />
                                                    </button>
                                                )}
                                                {/* 刪除題庫 (僅主持人) */}
                                                {isHost && (
                                                    <button
                                                        onClick={async () => {
                                                            const updated = roomData.customCategories.filter((_, i) => i !== idx);
                                                            await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), { customCategories: updated });
                                                        }}
                                                        className="text-red-400 hover:text-red-300 p-1"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 玩家提示 (非主持人) */}
                            {!isHost && (!roomData.customCategories || roomData.customCategories.length === 0) && (
                                <div className="text-center text-slate-400 py-4">
                                    主持人尚未建立可協作的題庫
                                </div>
                            )}
                        </div>
                    )}


                    {isHost ? (
                        <button
                            onClick={onStart}
                            disabled={!canStart}
                            className={`w-full py-5 text-xl font-bold rounded-2xl shadow-lg transform transition-all flex justify-center items-center gap-2 ${canStart
                                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white hover:scale-[1.02]'
                                : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                }`}
                        >
                            <Play className="fill-white" />
                            {canStart ? '開始遊戲' : '請確保所有玩家都已分組'}
                        </button>
                    ) : (
                        <div className="text-center p-8 bg-slate-800 border border-slate-700 rounded-2xl">
                            <div className="animate-spin w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <h3 className="font-bold text-white text-lg">等待主持人開始...</h3>
                        </div>
                    )}
                </div>
            </div>

            {/* Emoji 雲端題庫 Modal */}
            {showCloudLibrary && (
                <EmojiCloudLibraryModal
                    onClose={() => setShowCloudLibrary(false)}
                    onImport={async (deck) => {
                        const existing = roomData.customCategories || [];
                        const newCat = {
                            id: deck.id,
                            name: deck.name,
                            enabled: true,
                            questions: deck.questions
                        };
                        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                            customCategories: [...existing, newCat]
                        });
                        setShowCloudLibrary(false);
                    }}
                    currentUser={currentUser}
                    isAdmin={isAdmin}
                />
            )}

            {/* 編輯題庫 Modal */}
            {editingCategory && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 w-full max-w-xl max-h-[85vh] rounded-2xl p-6 border border-slate-700 flex flex-col">
                        <div className="flex justify-between items-center border-b border-slate-700 pb-4 mb-4">
                            <h3 className="font-bold text-xl text-white flex items-center gap-2">
                                <Edit className="text-yellow-400" /> 編輯題庫：{editingCategory.name}
                            </h3>
                            <button onClick={() => setEditingCategory(null)} className="text-slate-400 hover:text-white">
                                <X />
                            </button>
                        </div>

                        {/* 新增題目 (主持人或有權限的玩家) */}
                        {canAddWords && (
                            <div className="space-y-3 mb-4">
                                {/* 雙輸入框 */}
                                <div className="flex gap-2">
                                    <input
                                        value={emojiInput}
                                        onChange={(e) => setEmojiInput(e.target.value)}
                                        placeholder="輸入 Emoji，如 🐔🥚🦴"
                                        className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-xl"
                                    />
                                    <input
                                        value={answerInput}
                                        onChange={(e) => setAnswerInput(e.target.value)}
                                        placeholder="輸入答案，如 雞蛋裡挑骨頭"
                                        className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400"
                                        onKeyDown={(e) => e.key === 'Enter' && addWordToCategory()}
                                    />
                                    <button
                                        onClick={addWordToCategory}
                                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg font-medium flex items-center gap-1"
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>

                                {/* CSV 匯入按鈕 (僅主持人) */}
                                {isHost && (
                                    <label className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg cursor-pointer text-sm text-slate-300 w-fit transition">
                                        <Download size={14} /> 匯入 CSV (格式: Emoji|答案)
                                        <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCSVImport} />
                                    </label>
                                )}
                            </div>
                        )}

                        {/* 題目列表 */}
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {(!editingCategory.questions || editingCategory.questions.length === 0) ? (
                                <div className="text-center text-slate-400 py-8">此題庫尚無題目</div>
                            ) : (
                                editingCategory.questions.map((q, idx) => (
                                    <div key={q.id || idx} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{q.emojis}</span>
                                            <span className="text-white">{q.answer}</span>
                                        </div>
                                        {/* 主持人可刪除 */}
                                        {isHost && (
                                            <button
                                                onClick={() => removeWordFromCategory(q.id)}
                                                className="text-red-400 hover:text-red-300 p-1"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="text-sm text-slate-400 mt-4 pt-4 border-t border-slate-700 flex justify-between">
                            <span>共 {editingCategory.questions?.length || 0} 題</span>
                            <button onClick={() => setEditingCategory(null)} className="text-cyan-400 hover:text-cyan-300">
                                完成編輯
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// =================================================================
// Game Interface (遊戲進行中)
// =================================================================
function EmojiGameInterface({ roomData, roomId, currentUser, getNow }) {
    const [answer, setAnswer] = useState('');
    const [showCorrect, setShowCorrect] = useState(false);
    const [showTimeout, setShowTimeout] = useState(false);
    const [showWrong, setShowWrong] = useState(false);
    const [lastCorrectInfo, setLastCorrectInfo] = useState(null);
    const [timeoutQuestion, setTimeoutQuestion] = useState(null);
    const [timeLeft, setTimeLeft] = useState(0);
    const inputRef = useRef(null);
    const timerRef = useRef(null);
    // ★ v8.2 優化：追蹤已處理的 roundResult timestamp，防止重複處理
    const processedResultRef = useRef(null);

    const currentQuestion = roomData.currentQuestion;
    const currentIndex = roomData.currentQuestionIndex;
    const totalQuestions = roomData.questions?.length || roomData.settings.totalQuestions;
    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};
    const timePerQuestion = roomData.settings.timePerQuestion || 40;
    const isHost = roomData.hostId === currentUser.uid;

    // 安全的時間獲取
    const getCurrentTime = useCallback(() => {
        if (typeof getNow === 'function') return getNow();
        return Date.now();
    }, [getNow]);

    // 找出當前玩家所屬隊伍
    const myTeam = roomData.players?.find(p => p.id === currentUser.uid)?.team;

    // 計算提示 (只顯示第一個字)
    const getHint = () => {
        if (!currentQuestion) return '';
        const ans = currentQuestion.answer;
        if (ans.length <= 1) return ans;
        return ans.charAt(0) + '○'.repeat(ans.length - 1);
    };

    // 計時器邏輯 (支援暫停)
    useEffect(() => {
        // 暫停中：顯示儲存的剩餘時間
        if (roomData.gameState === 'paused') {
            setTimeLeft(Math.ceil((roomData.savedRemainingTime || 0) / 1000));
            return;
        }

        if (!roomData.questionEndTime || showCorrect || showTimeout) {
            setTimeLeft(0);
            return;
        }

        const updateTimer = () => {
            const now = getCurrentTime();
            const remaining = Math.max(0, Math.ceil((roomData.questionEndTime - now) / 1000));
            setTimeLeft(remaining);

            // 時間到且是主持人，自動切換下一題
            if (remaining <= 0 && isHost && currentQuestion) {
                console.log('[EmojiGameInterface] 時間到！');
                handleTimeout();
            }
        };

        updateTimer();
        timerRef.current = setInterval(updateTimer, 100); // 提高更新頻率為 100ms

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- handleTimeout 用 useCallback 包覆，其他依賴會導致計時器異常重置
    }, [roomData.questionEndTime, roomData.gameState, currentIndex, showCorrect, showTimeout]);

    // 時間到處理 (僅主持人執行寫入)
    // ★ v8.2 優化：合併寫入 roundResult + 下一題資料，從 2 次寫入降為 1 次
    const handleTimeout = useCallback(async () => {
        if (showTimeout || showCorrect) return;

        console.log('[EmojiGameInterface] handleTimeout - 合併寫入優化');

        // ★ 預先計算下一題資料
        const nextIndex = currentIndex + 1;
        const isLastQuestion = nextIndex >= totalQuestions;
        const newEndTime = getCurrentTime() + (timePerQuestion * 1000);

        // ★ 一次寫入：roundResult + 下一題資料（不再需要第二次寫入清除 roundResult）
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            roundResult: {
                type: 'timeout',
                emojis: currentQuestion.emojis,
                answer: currentQuestion.answer,
                showModal: true,
                timestamp: getCurrentTime()
            },
            // ★ 同時寫入下一題資料
            currentQuestionIndex: nextIndex,
            currentQuestion: isLastQuestion ? null : roomData.questions[nextIndex],
            questionEndTime: isLastQuestion ? null : newEndTime,
            status: isLastQuestion ? 'finished' : 'playing'
        });
    }, [showTimeout, showCorrect, currentIndex, totalQuestions, getCurrentTime, timePerQuestion, roomId, currentQuestion, roomData.questions]);

    // 監聽 roundResult 進行全域同步顯示
    // ★ v8.2 優化：使用 timestamp 追蹤已處理的結果，本地 setTimeout 控制動畫
    useEffect(() => {
        const result = roomData.roundResult;
        if (!result || !result.showModal) return;

        // ★ 防止重複處理同一個結果（使用 timestamp 作為唯一識別）
        if (processedResultRef.current === result.timestamp) {
            console.log('[EmojiGameInterface] roundResult 已處理，跳過:', result.timestamp);
            return;
        }
        processedResultRef.current = result.timestamp;
        console.log('[EmojiGameInterface] 處理新的 roundResult:', result.type, result.timestamp);

        if (result.type === 'timeout') {
            setTimeoutQuestion({ emojis: result.emojis, answer: result.answer });
            setShowTimeout(true);
            // ★ 本地 setTimeout 控制動畫顯示時間（不再依賴 roundResult 被清除）
            setTimeout(() => {
                setShowTimeout(false);
                setTimeoutQuestion(null);
            }, 2400);
        } else if (result.type === 'correct') {
            const correctTeam = teams.find(t => t.id === result.teamId);
            setLastCorrectInfo({
                player: result.playerName,
                team: correctTeam?.name || result.teamId,
                teamColor: correctTeam?.color || '#22c55e',
                emojis: result.emojis,
                answer: result.answer
            });
            setShowCorrect(true);
            // ★ 本地 setTimeout 控制動畫顯示時間
            setTimeout(() => {
                setShowCorrect(false);
                setLastCorrectInfo(null);
            }, 2000);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- teams 變化不應觸發此 effect，只需監聽 roundResult
    }, [roomData.roundResult]);



    // 自動聚焦輸入框
    useEffect(() => {
        if (inputRef.current && !showCorrect && !showTimeout) {
            inputRef.current.focus();
        }
    }, [currentIndex, showCorrect, showTimeout]);

    // 清空答案當題目變化時
    useEffect(() => {
        setAnswer('');
        setShowWrong(false);
    }, [currentIndex]);

    // 提交答案
    const submitAnswer = async () => {
        if (!answer.trim() || !currentQuestion || showCorrect || showTimeout) return;

        const normalizedAnswer = answer.trim().replace(/\s/g, '');
        const correctAnswer = currentQuestion.answer.replace(/\s/g, '');

        console.log(`[EmojiGameInterface] 提交答案: ${normalizedAnswer} vs ${correctAnswer}`);

        if (normalizedAnswer === correctAnswer) {
            console.log('[EmojiGameInterface] 答對了！');

            // 儲存當前題目資訊
            const answeredQuestion = { ...currentQuestion };
            const myPlayer = roomData.players?.find(p => p.id === currentUser.uid);

            // 更新分數和進入下一題
            const newScores = { ...scores };
            if (myTeam) {
                newScores[myTeam] = (newScores[myTeam] || 0) + roomData.settings.pointsCorrect;
            }

            const nextIndex = currentIndex + 1;
            const isLastQuestion = nextIndex >= totalQuestions;
            const newEndTime = getCurrentTime() + (timePerQuestion * 1000);

            // 使用 roundResult 進行全域同步
            // ★ v8.2 優化：一次寫入所有資料，不再需要清除 roundResult
            console.log('[EmojiGameInterface] submitAnswer - 合併寫入優化');
            await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                scores: newScores,
                roundResult: {
                    type: 'correct',
                    teamId: myTeam,
                    playerName: myPlayer?.name || '玩家',
                    emojis: answeredQuestion.emojis,
                    answer: answeredQuestion.answer,
                    showModal: true,
                    timestamp: getCurrentTime()
                },
                currentQuestionIndex: nextIndex,
                currentQuestion: isLastQuestion ? null : roomData.questions[nextIndex],
                questionEndTime: isLastQuestion ? null : newEndTime,
                status: isLastQuestion ? 'finished' : 'playing'
            });
            // ★ v8.2 優化：移除清除 roundResult 的 setTimeout（節省 1 次寫入）
        } else {
            // 答錯，顯示提示
            console.log('[EmojiGameInterface] 答錯了');
            setShowWrong(true);
            setAnswer('');
            setTimeout(() => setShowWrong(false), 1000);
        }
    };


    // Enter 提交
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            submitAnswer();
        }
    };

    // 排行榜
    const sortedTeams = [...teams].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

    // 是否顯示提示 (時間過半)
    const showHint = timeLeft > 0 && timeLeft <= timePerQuestion / 2;

    if (!currentQuestion) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-white text-xl">載入中...</div>
            </div>
        );
    }

    return (
        <div className="flex-1 p-4 md:p-8 relative">
            {/* 暫停遮罩 */}
            {roomData.gameState === 'paused' && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
                    <div className="text-center">
                        <div className="text-8xl mb-4">⏸️</div>
                        <div className="text-5xl font-bold text-yellow-400 animate-pulse">PAUSED</div>
                        <div className="text-xl text-slate-300 mt-4">等待主持人繼續遊戲...</div>
                        <div className="text-lg text-white/60 mt-2">剩餘時間: {timeLeft}s</div>
                    </div>
                </div>
            )}

            {/* 正確答案動畫 */}
            {showCorrect && lastCorrectInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-200">
                    <div className="text-center animate-in zoom-in duration-300">
                        <PartyPopper className="w-24 h-24 text-yellow-400 mx-auto mb-4 animate-bounce" />
                        <div className="text-4xl font-bold text-white mb-2">正確！</div>
                        <div className="text-xl" style={{ color: lastCorrectInfo.teamColor }}>
                            {lastCorrectInfo.player} ({lastCorrectInfo.team}) 答對了！
                        </div>
                        <div className="text-6xl mt-4">{lastCorrectInfo.emojis}</div>
                        <div className="text-3xl text-yellow-400 mt-2 font-bold">{lastCorrectInfo.answer}</div>
                    </div>
                </div>
            )}

            {/* 時間到動畫 */}
            {showTimeout && timeoutQuestion && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-200">
                    <div className="text-center animate-in zoom-in duration-300">
                        <div className="text-6xl mb-4">⏰</div>
                        <div className="text-4xl font-bold text-red-400 mb-2">時間到！</div>
                        <div className="text-xl text-slate-300 mb-4">正確答案是...</div>
                        <div className="text-6xl mb-2">{timeoutQuestion.emojis}</div>
                        <div className="text-4xl text-yellow-400 font-bold">{timeoutQuestion.answer}</div>
                    </div>
                </div>
            )}

            <div className="max-w-4xl mx-auto space-y-6">
                {/* 進度條與計時器 */}
                <div className="flex items-center justify-between text-white gap-2">
                    <span className="text-lg font-bold whitespace-nowrap">第 {currentIndex + 1} / {totalQuestions} 題</span>
                    <div className="flex-1 mx-2 h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-300"
                            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                        />
                    </div>
                    {/* 計時器 */}
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg ${timeLeft <= 10 ? 'bg-red-500/20 text-red-400 animate-pulse' :
                        timeLeft <= timePerQuestion / 2 ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-700 text-white'
                        }`}>
                        ⏱️ {timeLeft}s
                    </div>
                    {/* 主持人暫停/繼續按鈕 */}
                    {isHost && (
                        <button
                            onClick={async () => {
                                if (roomData.gameState === 'paused') {
                                    // 繼續遊戲
                                    const newEndTime = getCurrentTime() + (roomData.savedRemainingTime || 0);
                                    await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                                        gameState: 'playing',
                                        questionEndTime: newEndTime,
                                        savedRemainingTime: null
                                    });
                                } else {
                                    // 暫停遊戲
                                    const remaining = roomData.questionEndTime - getCurrentTime();
                                    await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                                        gameState: 'paused',
                                        savedRemainingTime: remaining,
                                        questionEndTime: null
                                    });
                                }
                            }}
                            className={`flex items-center gap-1 px-3 py-2 rounded-full text-sm font-medium transition ${roomData.gameState === 'paused' ? 'bg-green-500/20 hover:bg-green-500/40 text-green-400' : 'bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-400'}`}
                            title={roomData.gameState === 'paused' ? '繼續遊戲' : '暫停遊戲'}
                        >
                            {roomData.gameState === 'paused' ? <Play size={16} /> : <StopCircle size={16} />}
                            {roomData.gameState === 'paused' ? '繼續' : '暫停'}
                        </button>
                    )}
                    {/* 主持人結束遊戲按鈕 */}
                    {isHost && (
                        <button
                            onClick={async () => {
                                if (window.confirm('確定要提前結束遊戲嗎？將直接進入結算畫面。')) {
                                    await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
                                        status: 'finished',
                                        roundResult: null,
                                        gameState: null
                                    });
                                }
                            }}
                            className="flex items-center gap-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-full text-sm font-medium transition"
                            title="提前結束遊戲"
                        >
                            <X size={16} /> 結束
                        </button>
                    )}
                </div>


                {/* 題目區 */}
                <div className="bg-slate-800 rounded-3xl p-8 md:p-12 border border-slate-700 text-center">
                    <div className="text-7xl md:text-8xl lg:text-9xl mb-4 leading-relaxed tracking-wide">
                        {currentQuestion.emojis}
                    </div>
                    <div className="text-slate-400 text-sm mb-2">{currentQuestion.category}</div>

                    {/* 提示區 */}
                    {showHint && (
                        <div className="mt-4 p-3 bg-orange-500/20 border border-orange-500/30 rounded-xl animate-in fade-in">
                            <div className="text-orange-400 text-sm font-bold mb-1">💡 提示</div>
                            <div className="text-2xl text-white font-mono tracking-wider">{getHint()}</div>
                        </div>
                    )}
                </div>

                {/* 輸入區 */}
                <div className="space-y-2">
                    <div className="flex gap-3">
                        <input
                            ref={inputRef}
                            type="text"
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="輸入你的答案..."
                            disabled={showCorrect || showTimeout}
                            className={`flex-1 px-6 py-4 bg-slate-800 border rounded-2xl text-white text-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none placeholder-slate-500 disabled:opacity-50 transition-all ${showWrong ? 'border-red-500 animate-shake' : 'border-slate-600'
                                }`}
                        />
                        <button
                            onClick={submitAnswer}
                            disabled={!answer.trim() || showCorrect || showTimeout}
                            className="px-8 py-4 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-2xl font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <Send size={20} /> 送出
                        </button>
                    </div>
                    {/* 答錯提示 */}
                    {showWrong && (
                        <div className="text-red-400 text-center animate-in fade-in">
                            ❌ 答案不正確，再試一次！
                        </div>
                    )}
                </div>

                {/* 排行榜 */}
                <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                        <Trophy className="text-yellow-400" size={18} /> 即時排行
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {sortedTeams.map((team, idx) => (
                            <div
                                key={team.id}
                                className={`p-3 rounded-xl border ${myTeam === team.id ? 'border-yellow-400 bg-yellow-500/10' : 'border-slate-600 bg-slate-700/50'}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    {idx === 0 && <Trophy size={14} className="text-yellow-400" />}
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team.color }}></div>
                                    <span className="text-white font-medium text-sm">{team.name}</span>
                                </div>
                                <div className="text-2xl font-bold" style={{ color: team.color }}>
                                    {scores[team.id] || 0}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}


// =================================================================
// Result View (結算畫面)
// =================================================================
function EmojiResultView({ roomData, isHost, roomId }) {
    const teams = roomData.settings.teams || [];
    const scores = roomData.scores || {};

    // 排序隊伍並計算贏家
    const sortedTeams = [...teams].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
    const maxScore = sortedTeams[0] ? (scores[sortedTeams[0].id] || 0) : 0;
    const winners = sortedTeams.filter(t => (scores[t.id] || 0) === maxScore);

    // 重新開始
    const restartGame = async () => {
        await updateDoc(doc(db, 'emoji_rooms', `emoji_room_${roomId}`), {
            status: 'waiting',
            currentQuestionIndex: 0,
            currentQuestion: null,
            questions: [],
            lastCorrectTeam: null,
            lastCorrectPlayer: null,
            scores: {}
        });
    };

    return (
        <div className="flex-1 p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-2xl w-full text-center space-y-8">
                {/* 獎盃動畫 */}
                <div className="relative inline-block">
                    <Trophy className="w-32 h-32 text-yellow-400 mx-auto drop-shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-bounce" />
                    <div className="absolute -top-4 -right-4 text-6xl">🎉</div>
                    <div className="absolute -bottom-2 -left-4 text-6xl">✨</div>
                </div>

                {/* 標題與冠軍 */}
                <div>
                    <h2 className="text-slate-400 font-bold uppercase tracking-widest mb-2">
                        {winners.length > 1 ? "🤝 平手 (WINNERS)" : "🏆 冠軍 (WINNER)"}
                    </h2>
                    <h1 className="text-4xl md:text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-300 leading-tight">
                        {winners.map(w => w.name).join(" & ")}
                    </h1>
                    <div className="text-2xl text-yellow-400 font-bold mt-2">
                        {maxScore} 分
                    </div>
                </div>

                {/* 所有隊伍分數 */}
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
                                <div className="text-3xl font-bold" style={{ color: team.color }}>
                                    {scores[team.id] || 0}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 操作按鈕 */}
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
function SettingsModal({ localSettings, setLocalSettings, setShowSettings, onSave }) {
    const updateSetting = (key, value) => {
        setLocalSettings(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 w-full max-w-md rounded-2xl p-6 border border-slate-700 space-y-6">
                <div className="flex justify-between items-center border-b border-slate-700 pb-4">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2">
                        <Settings className="text-yellow-400" /> 遊戲設定
                    </h3>
                    <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                        <X />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">題目數量</label>
                        <input
                            type="number"
                            min="5"
                            max="50"
                            value={localSettings.totalQuestions}
                            onChange={(e) => updateSetting('totalQuestions', parseInt(e.target.value) || 10)}
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-yellow-400 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">答題時間 (秒)</label>
                        <input
                            type="number"
                            min="10"
                            max="120"
                            value={localSettings.timePerQuestion || 40}
                            onChange={(e) => updateSetting('timePerQuestion', parseInt(e.target.value) || 40)}
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-yellow-400 outline-none"
                        />
                        <div className="text-xs text-slate-400 mt-1">時間過半時會顯示提示</div>
                    </div>

                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">答對得分</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={localSettings.pointsCorrect}
                            onChange={(e) => updateSetting('pointsCorrect', parseInt(e.target.value) || 3)}
                            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-yellow-400 outline-none"
                        />
                    </div>

                    {/* 權限設定 */}
                    <div className="border-t border-slate-700 pt-4 mt-4">
                        <label className="text-sm text-slate-300 mb-3 block">權限設定</label>
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={localSettings.permissions?.allowPlayerAddWords || false}
                                onChange={(e) => setLocalSettings(prev => ({
                                    ...prev,
                                    permissions: {
                                        ...prev.permissions,
                                        allowPlayerAddWords: e.target.checked
                                    }
                                }))}
                                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-yellow-400 focus:ring-yellow-400"
                            />
                            <span className="text-white">允許參賽者新增題目</span>
                        </label>
                    </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-700">
                    <button
                        onClick={() => setShowSettings(false)}
                        className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium transition"
                    >
                        取消
                    </button>
                    <button
                        onClick={onSave}
                        className="flex-1 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white rounded-xl font-bold transition"
                    >
                        儲存
                    </button>
                </div>
            </div>
        </div>
    );
}
