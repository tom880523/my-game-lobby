import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { 
  Users, Gamepad2, ArrowLeft, LogIn, Construction
} from 'lucide-react';

// 引用我們拆分出去的檔案
import { auth, db } from './firebase'; // 共用 Firebase 設定
import CharadesGame from './CharadesGame'; // 遊戲主程式

export default function App() {
  const [currentApp, setCurrentApp] = useState('home');
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // 全域登入監聽
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        if (!u.isAnonymous) {
          try {
            // 檢查是否為管理員
            const adminDoc = await getDoc(doc(db, 'admins', u.uid));
            setIsAdmin(adminDoc.exists());
          } catch (e) {
            setIsAdmin(false);
          }
        } else {
          setIsAdmin(false);
        }
        setAuthLoading(false);
      } else {
        // 未登入則自動匿名登入
        console.log("Auto signing in anonymously...");
        signInAnonymously(auth).catch((e) => {
          console.error("Auth error:", e);
          setAuthLoading(false);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // 登入 Google
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("登入失敗: " + error.message);
    }
  };

  // 登出
  const handleLogout = async () => {
    await signOut(auth);
    // 登出後 onAuthStateChanged 會觸發並自動執行匿名登入
  };

  // 如果選擇了比手畫腳，渲染遊戲組件
  if (currentApp === 'charades') {
    return <CharadesGame onBack={() => setCurrentApp('home')} />;
  }

  // --- 大廳介面 ---
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center relative overflow-hidden">
      {/* 背景裝飾 */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      
      <header className="w-full max-w-4xl flex justify-between items-center mb-12 z-10">
         <h1 className="text-3xl font-bold flex items-center gap-3 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
            <Gamepad2 className="text-indigo-400 w-8 h-8" />
            線上派對遊戲中心
         </h1>
         <div>
             {authLoading ? (
                 <span className="text-slate-400 text-sm">連線中...</span>
             ) : (user && !user.isAnonymous) ? (
                 <div className="flex items-center gap-2">
                     {isAdmin && <span className="text-xs bg-yellow-500 text-black px-2 py-1 rounded font-bold shadow-glow">Admin</span>}
                     <button onClick={handleLogout} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full text-sm transition border border-slate-700">
                         {user.photoURL && <img src={user.photoURL} alt="user" className="w-6 h-6 rounded-full"/>}
                         <span>登出</span>
                     </button>
                 </div>
             ) : (
                 <button onClick={handleLogin} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-full text-sm font-bold transition shadow-lg">
                     <LogIn size={16}/> 登入 Google (啟用管理權限)
                 </button>
             )}
         </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl z-10">
        {/* 比手畫腳卡片 */}
        <button 
          onClick={() => setCurrentApp('charades')}
          disabled={authLoading}
          className={`group relative border rounded-2xl p-1 overflow-hidden transition-all duration-300 text-left shadow-xl ${authLoading ? 'bg-slate-800 border-slate-700 opacity-50 cursor-not-allowed' : 'bg-slate-800/50 hover:bg-slate-800/80 border-slate-700 hover:scale-105'}`}
        >
          <div className="h-full rounded-xl p-6 flex flex-col justify-between min-h-[200px]">
             <div>
               <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:rotate-12 transition-transform">
                  <Users className="text-white w-8 h-8" />
               </div>
               <h2 className="text-2xl font-bold mb-2 text-white">比手畫腳大亂鬥</h2>
               <p className="text-slate-400 text-sm">經典派對遊戲！內建豐富題庫、支援搶答、自訂多重隊伍與即時計分。</p>
             </div>
             <div className="flex items-center gap-2 text-indigo-400 font-bold mt-6 group-hover:translate-x-2 transition-transform">
                {authLoading ? "連線中..." : "進入遊戲"} <ArrowLeft className="rotate-180" size={16}/>
             </div>
          </div>
        </button>

        {/* 待開發遊戲佔位 */}
        {[
          { icon: <Construction />, title: "間諜家家酒", desc: "誰是臥底？開發中..." },
          { icon: <Construction />, title: "你畫我猜", desc: "靈魂繪師大顯身手..." }
        ].map((item, idx) => (
          <div key={idx} className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 flex flex-col justify-between min-h-[200px] opacity-50 cursor-not-allowed">
             <div>
               <div className="w-14 h-14 bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
                  {React.cloneElement(item.icon, { className: "text-slate-500 w-8 h-8" })}
               </div>
               <h2 className="text-xl font-bold text-slate-500 mb-2">{item.title}</h2>
               <p className="text-slate-600 text-sm">{item.desc}</p>
             </div>
          </div>
        ))}
      </main>

      <footer className="mt-auto pt-12 text-slate-600 text-sm z-10">
        v6.0 Modular Architecture
      </footer>
    </div>
  );
}