/**
 * FirebaseMonitor.js
 * Firebase 讀寫效能監控工具
 * 
 * 功能：
 * 1. 提供 MonitorContext 追蹤讀寫次數
 * 2. 封裝 Firebase 函式，自動計數
 * 3. 提供 PerformanceOverlay 浮動面板
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import {
    getDoc as firebaseGetDoc,
    onSnapshot as firebaseOnSnapshot,
    updateDoc as firebaseUpdateDoc,
    setDoc as firebaseSetDoc,
    addDoc as firebaseAddDoc,
    deleteDoc as firebaseDeleteDoc,
    getDocs as firebaseGetDocs,
    runTransaction as firebaseRunTransaction
} from 'firebase/firestore';
import { Activity, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// =================================================================
// Context
// =================================================================
const MonitorContext = createContext(null);

export function useMonitor() {
    const context = useContext(MonitorContext);
    if (!context) {
        // 若未包在 Provider 中，返回 dummy 函式
        return {
            readCount: 0,
            writeCount: 0,
            incrementRead: () => { },
            incrementWrite: () => { },
            reset: () => { },
            logs: []
        };
    }
    return context;
}

export function MonitorProvider({ children }) {
    const [readCount, setReadCount] = useState(0);
    const [writeCount, setWriteCount] = useState(0);
    const [logs, setLogs] = useState([]);
    const logIdRef = useRef(0);

    const addLog = useCallback((type, detail) => {
        const id = ++logIdRef.current;
        const entry = {
            id,
            type,
            detail,
            timestamp: new Date().toLocaleTimeString()
        };
        setLogs(prev => [...prev.slice(-49), entry]); // 保留最近 50 筆
        console.log(`[FirebaseMonitor] ${type}: ${detail}`);
    }, []);

    const incrementRead = useCallback((detail = 'read') => {
        setReadCount(c => c + 1);
        addLog('READ', detail);
    }, [addLog]);

    const incrementWrite = useCallback((detail = 'write') => {
        setWriteCount(c => c + 1);
        addLog('WRITE', detail);
    }, [addLog]);

    const reset = useCallback(() => {
        setReadCount(0);
        setWriteCount(0);
        setLogs([]);
        console.log('[FirebaseMonitor] 計數已歸零');
    }, []);

    return (
        <MonitorContext.Provider value={{ readCount, writeCount, incrementRead, incrementWrite, reset, logs }}>
            {children}
        </MonitorContext.Provider>
    );
}

// =================================================================
// 受監控的 Firebase 函式
// =================================================================

// 內部 helper：取得 collection path 用於 log
function getPathFromRef(ref) {
    try {
        if (ref?.path) return ref.path;
        if (ref?._path?.segments) return ref._path.segments.join('/');
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * 建立受監控的 Firebase 函式
 * @param {Function} incrementRead - 來自 context 的 incrementRead
 * @param {Function} incrementWrite - 來自 context 的 incrementWrite
 */
export function createMonitoredFirebaseFunctions(incrementRead, incrementWrite) {

    const monitoredGetDoc = async (ref) => {
        incrementRead(`getDoc: ${getPathFromRef(ref)}`);
        return firebaseGetDoc(ref);
    };

    const monitoredGetDocs = async (query) => {
        incrementRead(`getDocs: ${getPathFromRef(query)}`);
        return firebaseGetDocs(query);
    };

    const monitoredOnSnapshot = (ref, callback, onError) => {
        let isFirst = true;
        return firebaseOnSnapshot(ref, (snapshot) => {
            if (isFirst) {
                incrementRead(`onSnapshot (init): ${getPathFromRef(ref)}`);
                isFirst = false;
            } else {
                incrementRead(`onSnapshot (update): ${getPathFromRef(ref)}`);
            }
            callback(snapshot);
        }, onError);
    };

    const monitoredUpdateDoc = async (ref, data) => {
        incrementWrite(`updateDoc: ${getPathFromRef(ref)}`);
        return firebaseUpdateDoc(ref, data);
    };

    const monitoredSetDoc = async (ref, data, options) => {
        incrementWrite(`setDoc: ${getPathFromRef(ref)}`);
        return firebaseSetDoc(ref, data, options);
    };

    const monitoredAddDoc = async (collectionRef, data) => {
        incrementWrite(`addDoc: ${getPathFromRef(collectionRef)}`);
        return firebaseAddDoc(collectionRef, data);
    };

    const monitoredDeleteDoc = async (ref) => {
        incrementWrite(`deleteDoc: ${getPathFromRef(ref)}`);
        return firebaseDeleteDoc(ref);
    };

    const monitoredRunTransaction = async (db, updateFunction) => {
        // Transaction 較複雜，簡化計為 1 次寫入
        incrementWrite('runTransaction');
        return firebaseRunTransaction(db, updateFunction);
    };

    return {
        getDoc: monitoredGetDoc,
        getDocs: monitoredGetDocs,
        onSnapshot: monitoredOnSnapshot,
        updateDoc: monitoredUpdateDoc,
        setDoc: monitoredSetDoc,
        addDoc: monitoredAddDoc,
        deleteDoc: monitoredDeleteDoc,
        runTransaction: monitoredRunTransaction
    };
}

// =================================================================
// 浮動監控面板
// =================================================================
export function PerformanceOverlay() {
    const { readCount, writeCount, reset, logs } = useMonitor();
    const [isMinimized, setIsMinimized] = useState(true);
    const [showLogs, setShowLogs] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    // 鍵盤快捷鍵：Ctrl + Shift + M 切換顯示
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'M') {
                setIsVisible(v => !v);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    if (!isVisible) return null;

    // 最小化模式
    if (isMinimized) {
        return (
            <div
                className="fixed bottom-4 right-4 z-[9999] bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-full px-4 py-2 shadow-xl cursor-pointer hover:bg-slate-700/95 transition-all"
                onClick={() => setIsMinimized(false)}
                title="點擊展開效能監控"
            >
                <div className="flex items-center gap-3 text-sm">
                    <Activity size={16} className="text-cyan-400" />
                    <span className="text-emerald-400 font-mono">{readCount}R</span>
                    <span className="text-orange-400 font-mono">{writeCount}W</span>
                </div>
            </div>
        );
    }

    // 展開模式
    return (
        <div className="fixed bottom-4 right-4 z-[9999] bg-slate-800/95 backdrop-blur-sm border border-slate-600 rounded-xl shadow-2xl w-80 max-h-[70vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-900/50">
                <div className="flex items-center gap-2">
                    <Activity size={18} className="text-cyan-400" />
                    <span className="font-bold text-white text-sm">Firebase 監控</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={reset}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition"
                        title="歸零"
                    >
                        <RotateCcw size={14} />
                    </button>
                    <button
                        onClick={() => setIsMinimized(true)}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition"
                        title="最小化"
                    >
                        <ChevronDown size={14} />
                    </button>
                    <button
                        onClick={() => setIsVisible(false)}
                        className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition"
                        title="關閉 (Ctrl+Shift+M 重開)"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 p-3">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-center">
                    <div className="text-xs text-emerald-400/80 mb-1">讀取 (Read)</div>
                    <div className="text-2xl font-mono font-bold text-emerald-400">{readCount}</div>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
                    <div className="text-xs text-orange-400/80 mb-1">寫入 (Write)</div>
                    <div className="text-2xl font-mono font-bold text-orange-400">{writeCount}</div>
                </div>
            </div>

            {/* Logs Toggle */}
            <button
                onClick={() => setShowLogs(!showLogs)}
                className="flex items-center justify-between px-3 py-2 bg-slate-900/50 text-slate-300 hover:bg-slate-700/50 text-sm transition"
            >
                <span>操作日誌 ({logs.length})</span>
                {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Logs List */}
            {showLogs && (
                <div className="flex-1 overflow-y-auto max-h-48 p-2 space-y-1 text-xs font-mono">
                    {logs.length === 0 ? (
                        <div className="text-slate-500 text-center py-4">尚無操作記錄</div>
                    ) : (
                        logs.slice().reverse().map(log => (
                            <div key={log.id} className="flex gap-2 py-1 px-2 rounded hover:bg-slate-700/50">
                                <span className="text-slate-500 flex-shrink-0">{log.timestamp}</span>
                                <span className={log.type === 'READ' ? 'text-emerald-400' : 'text-orange-400'}>
                                    {log.type}
                                </span>
                                <span className="text-slate-300 truncate" title={log.detail}>{log.detail}</span>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-700 text-center">
                Ctrl+Shift+M 切換顯示
            </div>
        </div>
    );
}

// =================================================================
// 匯出原始 Firebase 函式 (方便切換)
// =================================================================
export {
    firebaseGetDoc,
    firebaseOnSnapshot,
    firebaseUpdateDoc,
    firebaseSetDoc,
    firebaseAddDoc,
    firebaseDeleteDoc,
    firebaseGetDocs,
    firebaseRunTransaction
};
