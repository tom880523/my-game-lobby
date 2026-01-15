/**
 * dbOperations.js
 * 統一匯出受監控的 Firebase Firestore 函式
 * 
 * 用法：
 * import { getDoc, updateDoc, onSnapshot, ... } from './dbOperations';
 * 
 * 這些函式會自動計入 FirebaseMonitor 的讀寫統計
 */

import { useMonitor, createMonitoredFirebaseFunctions } from './FirebaseMonitor';
import {
    doc,
    collection,
    query,
    where,
    orderBy,
    limit,
    increment,
    serverTimestamp,
    arrayUnion,
    arrayRemove
} from 'firebase/firestore';

// 直接匯出不需監控的 helper 函式
export {
    doc,
    collection,
    query,
    where,
    orderBy,
    limit,
    increment,
    serverTimestamp,
    arrayUnion,
    arrayRemove
};

/**
 * ★ 重要說明 ★
 * 
 * 由於 Firebase 函式需要在 React 元件中使用才能存取 Context，
 * 建議在各遊戲元件中這樣使用：
 * 
 * function MyGame() {
 *     const { incrementRead, incrementWrite } = useMonitor();
 *     const db = useRef(createMonitoredFirebaseFunctions(incrementRead, incrementWrite)).current;
 *     
 *     // 然後使用 db.getDoc(), db.updateDoc() 等
 * }
 * 
 * 或者，若不想修改現有元件，只需掛載 PerformanceOverlay 即可手動觀察。
 */

// 匯出 hook 和工廠函式供元件使用
export { useMonitor, createMonitoredFirebaseFunctions };

// 匯出原始函式 (用於不需要監控的場景)
export {
    firebaseGetDoc as getDocRaw,
    firebaseOnSnapshot as onSnapshotRaw,
    firebaseUpdateDoc as updateDocRaw,
    firebaseSetDoc as setDocRaw,
    firebaseAddDoc as addDocRaw,
    firebaseDeleteDoc as deleteDocRaw,
    firebaseGetDocs as getDocsRaw,
    firebaseRunTransaction as runTransactionRaw
} from './FirebaseMonitor';

// ★ 保持向後相容：直接匯出原始函式 ★
// 這樣現有程式碼 import { getDoc, updateDoc } from 'firebase/firestore' 
// 改為 from './dbOperations' 時能正常運作（不帶監控）
export {
    getDoc,
    getDocs,
    onSnapshot,
    updateDoc,
    setDoc,
    addDoc,
    deleteDoc,
    runTransaction
} from 'firebase/firestore';
