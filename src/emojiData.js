// =================================================================
// Emoji 猜詞語題庫 (Emoji Guessing Game Question Bank)
// 資料結構：{ id, category, emojis, answer }
// =================================================================

export const EMOJI_QUESTIONS = [
  // =================================================================
  // 成語類 (Idioms)
  // =================================================================
  { id: 1, category: '成語', emojis: '🐔✈️🐶💃', answer: '雞飛狗跳' },
  { id: 2, category: '成語', emojis: '🐍➕🦶', answer: '畫蛇添足' },
  { id: 3, category: '成語', emojis: '🐄🎸', answer: '對牛彈琴' },
  { id: 4, category: '成語', emojis: '🪨1️⃣🐦🐦', answer: '一石二鳥' },
  { id: 5, category: '成語', emojis: '🐸⬇️🕳️', answer: '井底之蛙' },
  { id: 6, category: '成語', emojis: '🌳🧍‍♂️⏳🐰', answer: '守株待兔' },
  { id: 7, category: '成語', emojis: '👂🙈🔔', answer: '掩耳盜鈴' },
  { id: 8, category: '成語', emojis: '🦊👔🐯😤', answer: '狐假虎威' },
  { id: 9, category: '成語', emojis: '🙈🤚🐘', answer: '盲人摸象' },
  { id: 10, category: '成語', emojis: '🍵🏹🐍👻', answer: '杯弓蛇影' },
  { id: 11, category: '成語', emojis: '🗡️🚤🔍💎', answer: '刻舟求劍' },
  { id: 12, category: '成語', emojis: '🐺🍽️🐯😋', answer: '狼吞虎嚥' },
  { id: 13, category: '成語', emojis: '🐉✈️🦚💃', answer: '龍飛鳳舞' },
  { id: 14, category: '成語', emojis: '🦢👔🐔🐔🐔', answer: '鶴立雞群' },
  { id: 15, category: '成語', emojis: '🐔💬🦆❓', answer: '雞同鴨講' },
  { id: 16, category: '成語', emojis: '🐶😰🧱🦘', answer: '狗急跳牆' },
  { id: 17, category: '成語', emojis: '🌿🐍😱', answer: '打草驚蛇' },
  { id: 18, category: '成語', emojis: '🔪🐔⚠️🐵', answer: '殺雞儆猴' },
  { id: 19, category: '成語', emojis: '🐟💧😊', answer: '如魚得水' },
  { id: 20, category: '成語', emojis: '🐟⬇️🦢⬇️', answer: '沉魚落雁' },
  { id: 21, category: '成語', emojis: '3️⃣🧠2️⃣💭', answer: '三心二意' },
  { id: 22, category: '成語', emojis: '4️⃣📍🎵😢', answer: '四面楚歌' },
  { id: 23, category: '成語', emojis: '5️⃣🫀🛐', answer: '五體投地' },
  { id: 24, category: '成語', emojis: '7️⃣👄8️⃣👅', answer: '七嘴八舌' },
  { id: 25, category: '成語', emojis: '9️⃣🐄1️⃣🦰', answer: '九牛一毛' },
  { id: 26, category: '成語', emojis: '🔟✅🔟✨', answer: '十全十美' },
  { id: 27, category: '成語', emojis: '1️⃣🏹2️⃣🦅', answer: '一箭雙鵰' },
  { id: 28, category: '成語', emojis: '👁️🚫🔄👀', answer: '目不轉睛' },
  { id: 29, category: '成語', emojis: '🤚🏃🦶🌀', answer: '手忙腳亂' },
  { id: 30, category: '成語', emojis: '😊🌸💐🗣️', answer: '花言巧語' },
  { id: 31, category: '成語', emojis: '🐴🏃👀🌸', answer: '走馬看花' },
  { id: 32, category: '成語', emojis: '😞⬇️👤😔', answer: '垂頭喪氣' },
  { id: 33, category: '成語', emojis: '😊👁️😄', answer: '眉開眼笑' },
  { id: 34, category: '成語', emojis: '😠💢😤💥', answer: '氣急敗壞' },
  { id: 35, category: '成語', emojis: '❤️🫣💓🪢', answer: '提心吊膽' },
  { id: 36, category: '成語', emojis: '😴💤😑', answer: '無精打采' },
  { id: 37, category: '成語', emojis: '😊🎉🥳✨', answer: '興高采烈' },
  { id: 38, category: '成語', emojis: '🐦🐦🔇', answer: '鴉雀無聲' },
  { id: 39, category: '成語', emojis: '💓🐭😨', answer: '膽小如鼠' },
  { id: 40, category: '成語', emojis: '1️⃣🦰🚫👋', answer: '一毛不拔' },

  // =================================================================
  // 流行語與日常用語
  // =================================================================
  { id: 41, category: '流行語', emojis: '🛋️😴🏳️', answer: '躺平' },
  { id: 42, category: '流行語', emojis: '👤😰🙈💬', answer: '社恐' },
  { id: 43, category: '流行語', emojis: '🔄📈😵‍💫', answer: '內卷' },
  { id: 44, category: '流行語', emojis: '🐶👀📱', answer: '單身狗' },
  { id: 45, category: '流行語', emojis: '💰👶', answer: '富二代' },
  { id: 46, category: '流行語', emojis: '🍋😫💔', answer: '檸檬精' },
  { id: 47, category: '流行語', emojis: '🧂👤', answer: '鹹魚' },
  { id: 48, category: '流行語', emojis: '🐷🐷👧', answer: '豬隊友' },
  { id: 49, category: '流行語', emojis: '🔥🔥🔥👀', answer: '吃瓜群眾' },
  { id: 50, category: '流行語', emojis: '👋🏋️‍♂️', answer: '擺爛' },
  { id: 51, category: '流行語', emojis: '🐸☕', answer: '佛系' },
  { id: 52, category: '流行語', emojis: '💔👻', answer: '心累' },
  { id: 53, category: '流行語', emojis: '🎯🎯🎯', answer: '穩了' },
  { id: 54, category: '流行語', emojis: '💸💸💸🫠', answer: '月光族' },
  { id: 55, category: '流行語', emojis: '👴👵📱❓', answer: '數位落差' },

  // =================================================================
  // 電影與動漫
  // =================================================================
  { id: 56, category: '電影動漫', emojis: '🦁👑', answer: '獅子王' },
  { id: 57, category: '電影動漫', emojis: '❄️👸💙', answer: '冰雪奇緣' },
  { id: 58, category: '電影動漫', emojis: '🐉🐉🔮', answer: '乘龍高手' },
  { id: 59, category: '電影動漫', emojis: '🧙‍♂️💍🌋', answer: '魔戒' },
  { id: 60, category: '電影動漫', emojis: '🦸‍♂️🕷️', answer: '蜘蛛人' },
  { id: 61, category: '電影動漫', emojis: '🤖🚗', answer: '變形金剛' },
  { id: 62, category: '電影動漫', emojis: '🐼🥋', answer: '功夫熊貓' },
  { id: 63, category: '電影動漫', emojis: '👻👻🎃', answer: '乩童' },
  { id: 64, category: '電影動漫', emojis: '🐭👨‍🍳🍝', answer: '乒巧亏' },
  { id: 65, category: '電影動漫', emojis: '⚡🧙‍♂️👓', answer: '哈利波特' },

  // =================================================================
  // 食物與生活
  // =================================================================
  { id: 66, category: '食物', emojis: '🧋🖤⚫', answer: '珍珠奶茶' },
  { id: 67, category: '食物', emojis: '🫕🔥🥬🥩', answer: '火鍋' },
  { id: 68, category: '食物', emojis: '🍜🥩', answer: '牛肉麵' },
  { id: 69, category: '食物', emojis: '🐔🍗💥', answer: '炸雞' },
  { id: 70, category: '食物', emojis: '🍚🥚🍳', answer: '蛋炒飯' },

  // =================================================================
  // 地點與景點
  // =================================================================
  { id: 71, category: '地點', emojis: '🗼🇹🇼101', answer: '台北101' },
  { id: 72, category: '地點', emojis: '🗽🇺🇸', answer: '自由女神' },
  { id: 73, category: '地點', emojis: '🗼🇫🇷💕', answer: '艾菲爾鐵塔' },
  { id: 74, category: '地點', emojis: '🏯🌸🇯🇵', answer: '日本' },
  { id: 75, category: '地點', emojis: '🏖️☀️🌴', answer: '夏威夷' },

  // =================================================================
  // 職業與角色
  // =================================================================
  { id: 76, category: '職業', emojis: '👨‍⚕️💉🏥', answer: '醫生' },
  { id: 77, category: '職業', emojis: '👨‍🍳🍳🔥', answer: '廚師' },
  { id: 78, category: '職業', emojis: '👮‍♂️🚔🚨', answer: '警察' },
  { id: 79, category: '職業', emojis: '🚀👨‍🚀🌙', answer: '太空人' },
  { id: 80, category: '職業', emojis: '🎤🎶✨', answer: '歌手' },
];

// 根據分類獲取題目
export const getQuestionsByCategory = (category) => {
  console.log(`[emojiData] 取得分類「${category}」的題目`);
  return EMOJI_QUESTIONS.filter(q => q.category === category);
};

// 取得所有分類
export const getAllCategories = () => {
  const categories = [...new Set(EMOJI_QUESTIONS.map(q => q.category))];
  console.log(`[emojiData] 所有分類:`, categories);
  return categories;
};

// 隨機洗牌題目
export const shuffleQuestions = (questions) => {
  console.log(`[emojiData] 洗牌 ${questions.length} 題`);
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled;
};
