import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// =================================================================
// ★★★ 你的 Firebase Config ★★★
// =================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA5vgv34lsCJGOgmKhVZzZUp9L0Ut-JdUY",
  authDomain: "game-lobby-c3225.firebaseapp.com",
  projectId: "game-lobby-c3225",
  storageBucket: "game-lobby-c3225.firebasestorage.app",
  messagingSenderId: "900294983374",
  appId: "1:900294983374:web:696061e1ab31ca49bb5a9f"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };