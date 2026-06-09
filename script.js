// ========== НАСТРОЙКА FIREBASE ==========
const firebaseConfig = {
    apiKey: "AIzaSyDShCzZja-zwwI3hlqY3_XS_4JP1s-cXcw",
    authDomain: "learnam-f5c99.firebaseapp.com",
    projectId: "learnam-f5c99",
    storageBucket: "learnam-f5c99.firebasestorage.app",
    messagingSenderId: "62297810080",
    appId: "1:62297810080:web:1ffc50c5a38d2c907a95c5"
};

// ========== НАСТРОЙКИ GOOGLE SHEETS ==========
const SHEET_URL = "https://script.google.com/macros/s/AKfycbz_pJsO9okF08adnS3aR80LmdVMlpImII3qwnpNUoppUVeFpq86UDofN31NQgVS-Js9/exec";

// ========== НАСТРОЙКИ ==========
const WEIGHT_SETTINGS = {
    DEFAULT_WEIGHT: 1.0,
    CORRECT_DECREASE: 0.3,
    WRONG_INCREASE: 0.5,
    MIN_WEIGHT: 0.1,
    MAX_WEIGHT: 3.0,
    RESET_AFTER_GAMES: 5
};
const QUESTIONS_PER_GAME = 10;

// Инициализация Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// Глобальные переменные
let wordsDatabase = [];
let wordsWeights = { RUS_ARM: {}, ARM_RUS: {} };
let currentMode = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let currentScore = 0;
let correctAnswers = 0;
let gameActive = false;
let currentGameWords = [];
let gamesSinceReset = { RUS_ARM: 0, ARM_RUS: 0 };

// ========== ОБЩИЕ ФУНКЦИИ ==========
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result;
}

// ========== ЗАГРУЗКА СЛОВ ==========
function parseCSVToWords(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const wordIndex = headers.findIndex(h => h.toLowerCase().replace(/["']/g, '').trim() === 'rus');
    const transIndex = headers.findIndex(h => h.toLowerCase().replace(/["']/g, '').trim() === 'arm');
    if (wordIndex === -1 || transIndex === -1) return [];
    const words = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const russian = values[wordIndex]?.replace(/["']/g, '').trim();
        const armenian = values[transIndex]?.replace(/["']/g, '').trim();
        if (russian && armenian) {
            words.push({ id: russian, russian: russian, armenian: armenian });
        }
    }
    return words;
}

async function loadWordsFromGoogleSheets() {
    try {
        console.log("📥 Загрузка слов...");
        const response = await fetch(SHEET_URL, { mode: 'cors', headers: { 'Accept': 'text/csv, text/plain, */*' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        if (!csvText || csvText.trim().length === 0) throw new Error("Таблица пуста");
        const words = parseCSVToWords(csvText);
        if (words.length === 0) throw new Error("Не удалось распарсить слова");
        console.log(`✅ Загружено ${words.length} слов`);
        return words;
    } catch (error) {
        console.error("❌ Ошибка:", error);
        return [];
    }
}

function generateOptions(correctAnswer, mode, currentWordId) {
    let candidates = [];
    if (mode === 'RUS_ARM') {
        candidates = wordsDatabase.filter(w => w.russian !== currentWordId).map(w => w.armenian);
    } else {
        candidates = wordsDatabase.filter(w => w.armenian !== currentWordId).map(w => w.russian);
    }
    const shuffled = shuffleArray([...candidates]);
    const wrongOptions = [];
    for (let i = 0; i < shuffled.length && wrongOptions.length < 3; i++) {
        if (shuffled[i] !== correctAnswer) wrongOptions.push(shuffled[i]);
    }
    while (wrongOptions.length < 3) wrongOptions.push(`Вариант ${wrongOptions.length + 1}`);
    return shuffleArray([correctAnswer, ...wrongOptions]);
}

// ========== СИСТЕМА ВЕСОВ ==========
async function loadWeightsFromFirebase(userId, mode) {
    try {
        const doc = await db.collection('wordWeights').doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            wordsWeights[mode] = data[mode] || {};
            gamesSinceReset[mode] = data.gamesSinceReset?.[mode] || 0;
        } else {
            wordsWeights[mode] = {};
            wordsDatabase.forEach(word => {
                const key = mode === 'RUS_ARM' ? word.russian : word.armenian;
                wordsWeights[mode][key] = WEIGHT_SETTINGS.DEFAULT_WEIGHT;
            });
        }
    } catch (error) {
        console.error("Ошибка весов:", error);
    }
}

async function saveWeightsToFirebase(userId) {
    if (!userId) return;
    try {
        await db.collection('wordWeights').doc(userId).set({
            RUS_ARM: wordsWeights.RUS_ARM || {},
            ARM_RUS: wordsWeights.ARM_RUS || {},
            gamesSinceReset: gamesSinceReset,
            lastUpdated: new Date()
        });
    } catch (error) { console.error("Ошибка сохранения весов:", error); }
}

async function updateWeight(wordKey, isCorrect, userId, mode) {
    if (!wordsWeights[mode]) wordsWeights[mode] = {};
    const currentWeight = wordsWeights[mode][wordKey] || WEIGHT_SETTINGS.DEFAULT_WEIGHT;
    let newWeight = isCorrect ? currentWeight - WEIGHT_SETTINGS.CORRECT_DECREASE : currentWeight + WEIGHT_SETTINGS.WRONG_INCREASE;
    newWeight = Math.max(WEIGHT_SETTINGS.MIN_WEIGHT, Math.min(WEIGHT_SETTINGS.MAX_WEIGHT, newWeight));
    wordsWeights[mode][wordKey] = newWeight;
    if (userId) await saveWeightsToFirebase(userId);
}

function selectWordsWithWeights(mode, count) {
    if (!wordsDatabase.length) return [];
    if (count > wordsDatabase.length) count = wordsDatabase.length;
    let weightedPool = [];
    wordsDatabase.forEach(word => {
        const key = mode === 'RUS_ARM' ? word.russian : word.armenian;
        const weight = wordsWeights[mode][key] || WEIGHT_SETTINGS.DEFAULT_WEIGHT;
        const repeatCount = Math.max(1, Math.round(weight * 10));
        for (let i = 0; i < repeatCount; i++) weightedPool.push(word);
    });
    if (weightedPool.length === 0) return shuffleArray([...wordsDatabase]).slice(0, count);
    const selected = [];
    const shuffledPool = shuffleArray([...weightedPool]);
    for (let i = 0; i < shuffledPool.length && selected.length < count; i++) {
        const candidate = shuffledPool[i];
        if (!selected.some(s => (mode === 'RUS_ARM' ? s.russian : s.armenian) === (mode === 'RUS_ARM' ? candidate.russian : candidate.armenian))) {
            selected.push(candidate);
        }
    }
    if (selected.length < count) {
        const remaining = wordsDatabase.filter(w => !selected.some(s => (mode === 'RUS_ARM' ? s.russian : s.armenian) === (mode === 'RUS_ARM' ? w.russian : w.armenian)));
        selected.push(...shuffleArray(remaining).slice(0, count - selected.length));
    }
    return selected;
}

// ========== ТАБЛИЦА ЛИДЕРОВ ==========
async function loadLeaderboard() {
    const container = document.getElementById('leaderboard');
    if (!container) return;
    try {
        const snapshot = await db.collection('users').orderBy('totalScore', 'desc').limit(10).get();
        if (snapshot.empty) { container.innerHTML = '<div>Нет данных</div>'; return; }
        let html = '<div class="leaderboard-row header"><div>#</div><div>Игрок</div><div>Очки</div></div>';
        let rank = 1;
        snapshot.forEach(doc => {
            const user = doc.data();
            html += `<div class="leaderboard-row"><div class="leaderboard-rank">${rank}</div><div class="leaderboard-name">${escapeHtml(user.name || 'Аноним')}</div><div class="leaderboard-score">${user.totalScore || 0}</div></div>`;
            rank++;
        });
        container.innerHTML = html;
        const user = auth.currentUser;
        if (user) {
            const all = await db.collection('users').orderBy('totalScore', 'desc').get();
            let pos = 0;
            all.forEach((doc, i) => { if (doc.id === user.uid) pos = i + 1; });
            const rankDiv = document.getElementById('user-rank');
            if (rankDiv) rankDiv.innerHTML = `🎯 Ваше место: #${pos} из ${all.size}`;
        }
    } catch (error) { console.error("Ошибка лидерборда:", error); }
}

// ========== ИНИЦИАЛИЗАЦИЯ СТРАНИЦ ==========

// Страница входа
if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const tabs = document.querySelectorAll('.tab-btn');
        
        if (tabs.length) {
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
                    document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
                });
            });
        }
        
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value;
                const password = document.getElementById('login-password').value;
                const errorDiv = document.getElementById('login-error');
                try {
                    await auth.signInWithEmailAndPassword(email, password);
                    window.location.href = 'game.html';
                } catch (error) {
                    errorDiv.textContent = 'Ошибка: ' + error.message;
                }
            });
        }
        
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('reg-name').value;
                const email = document.getElementById('reg-email').value;
                const password = document.getElementById('reg-password').value;
                const errorDiv = document.getElementById('reg-error');
                try {
                    const cred = await auth.createUserWithEmailAndPassword(email, password);
                    await db.collection('users').doc(cred.user.uid).set({
                        name: name, email: email, totalScore: 0, totalCorrect: 0, gamesPlayed: 0,
                        learnedWords: [],
                        rusArmStats: { score: 0, correct: 0, games: 0 },
                        armRusStats: { score: 0, correct: 0, games: 0 }
                    });
                    window.location.href = 'game.html';
                } catch (error) {
                    errorDiv.textContent = 'Ошибка: ' + error.message;
                }
            });
        }
    });
}

// ========== СТРАНИЦА ИГРЫ ==========
if (window.location.pathname.includes('game.html')) {
    let isInitialized = false;
    
    async function initGame() {
        const user = auth.currentUser;
        if (!user) {
            window.location.href = 'index.html';
            return;
        }
        
        // Всегда перезагружаем слова при входе в игру (чтобы после профиля были свежие)
        console.log("🔄 Инициализация игры, загрузка слов...");
        const modeDiv = document.getElementById('mode-selection');
        if (modeDiv) {
            modeDiv.innerHTML = `<div class="loading-container"><p>📥 Загрузка слов...</p></div>`;
        }
        
        // Загружаем слова (если уже есть в памяти, всё равно перезагружаем, чтобы быть уверенными)
        wordsDatabase = await loadWordsFromGoogleSheets();
        
        if (wordsDatabase.length < 4) {
            if (modeDiv) {
                modeDiv.innerHTML = `<div class="error-message-box"><p>⚠️ Загружено ${wordsDatabase.length} слов. Нужно минимум 4.</p></div>`;
            }
            return;
        }
        
        // Загружаем веса (только если нет, но можно и заново)
        if (Object.keys(wordsWeights.RUS_ARM).length === 0) {
            await loadWeightsFromFirebase(user.uid, 'RUS_ARM');
            await loadWeightsFromFirebase(user.uid, 'ARM_RUS');
        }
        
        // Восстанавливаем интерфейс выбора режима
        if (modeDiv) {
            modeDiv.innerHTML = `
                <h2>Выберите режим игры</h2>
                <div class="mode-cards">
                    <div class="mode-card" data-mode="RUS_ARM">
                        <div class="mode-icon">🇷🇺➡️🇦🇲</div>
                        <h3>Русский → Армянский</h3>
                        <p>Вам показывают русское слово, нужно выбрать армянский перевод</p>
                        <button class="mode-btn">Выбрать</button>
                    </div>
                    <div class="mode-card" data-mode="ARM_RUS">
                        <div class="mode-icon">🇦🇲➡️🇷🇺</div>
                        <h3>Армянский → Русский</h3>
                        <p>Вам показывают армянское слово, нужно выбрать русский перевод</p>
                        <button class="mode-btn">Выбрать</button>
                    </div>
                </div>
            `;
        }
        
        // Привязываем обработчики кнопок
        attachModeButtons();
        
        // Кнопка выхода
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = async () => {
                await auth.signOut();
                window.location.href = 'index.html';
            };
        }
        
        isInitialized = true;
    }
    
    function attachModeButtons() {
        const cards = document.querySelectorAll('.mode-card');
        cards.forEach(card => {
            // Удаляем старые обработчики через клонирование (чистый способ)
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            const mode = newCard.dataset.mode;
            const btn = newCard.querySelector('.mode-btn');
            
            const start = () => {
                if (wordsDatabase.length < 4) {
                    alert(`Недостаточно слов (${wordsDatabase.length}). Обновите страницу.`);
                    return;
                }
                startGameWithMode(mode);
            };
            
            newCard.addEventListener('click', start);
            if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
        });
    }
    
    // Запускаем инициализацию при загрузке страницы (даже если пришли из профиля)
    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(user => {
            if (user) {
                initGame();
            } else {
                window.location.href = 'index.html';
            }
        });
    });
    
    // Остальные функции (startGameWithMode, startNewGame и т.д.) остаются без изменений
    // ... (скопируйте их из предыдущей стабильной версии)
    // 
    // Функция старта игры (остаётся без изменений)
    async function startGameWithMode(mode) {
        currentMode = mode;
        if (wordsDatabase.length < 4) {
            alert(`Нужно минимум 4 слова. Загружено: ${wordsDatabase.length}`);
            return;
        }
        document.getElementById('mode-selection').style.display = 'none';
        document.getElementById('game-area').style.display = 'block';
        document.getElementById('mode-badge').innerHTML = mode === 'RUS_ARM' ? '🇷🇺 РУССКИЙ → АРМЯНСКИЙ 🇦🇲' : '🇦🇲 АРМЯНСКИЙ → РУССКИЙ 🇷🇺';
        await startNewGame();
    }
    
    // Остальные функции (startNewGame, loadQuestion, checkAnswer, endGame) остаются без изменений
    // ... (скопируйте их из предыдущей версии)    
    async function startNewGame() {
        const selectedWords = selectWordsWithWeights(currentMode, QUESTIONS_PER_GAME);
        currentQuestions = selectedWords.map(word => {
            const question = currentMode === 'RUS_ARM' ? word.russian : word.armenian;
            const correctAnswer = currentMode === 'RUS_ARM' ? word.armenian : word.russian;
            return {
                id: currentMode === 'RUS_ARM' ? word.russian : word.armenian,
                question: question,
                correctAnswer: correctAnswer,
                options: generateOptions(correctAnswer, currentMode, currentMode === 'RUS_ARM' ? word.russian : word.armenian)
            };
        });
        currentGameWords = currentQuestions.map(q => ({ id: q.id, answered: false, correct: false }));
        currentQuestionIndex = 0;
        currentScore = 0;
        correctAnswers = 0;
        gameActive = true;
        document.getElementById('score').textContent = '0';
        document.getElementById('total-q').textContent = currentQuestions.length;
        document.getElementById('current-q').textContent = '1';
        document.getElementById('game-message').innerHTML = '';
        document.getElementById('next-btn').style.display = 'none';
        loadQuestion();
    }
    
    function loadQuestion() {
        if (!gameActive) return;
        const q = currentQuestions[currentQuestionIndex];
        document.getElementById('question-text').innerHTML = currentMode === 'RUS_ARM' ? `Как перевести "${q.question}" на армянский?` : `Как перевести "${q.question}" на русский?`;
        document.getElementById('current-q').textContent = currentQuestionIndex + 1;
        const container = document.getElementById('answers-container');
        if (!container) return;
        container.innerHTML = '';
        q.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.classList.add('answer-btn');
            btn.addEventListener('click', () => checkAnswer(btn, opt, q.correctAnswer, q.id));
            container.appendChild(btn);
        });
        document.getElementById('next-btn').style.display = 'none';
    }
    
    async function checkAnswer(btn, selected, correct, wordId) {
        if (!gameActive) return;
        const allBtns = document.querySelectorAll('.answer-btn');
        if (Array.from(allBtns).some(b => b.disabled)) return;
        const isCorrect = selected === correct;
        if (isCorrect) {
            btn.classList.add('correct');
            currentScore += 10;
            correctAnswers++;
            document.getElementById('score').textContent = currentScore;
            document.getElementById('game-message').innerHTML = '✅ Правильно! +10';
            document.getElementById('game-message').style.color = '#48bb78';
        } else {
            btn.classList.add('wrong');
            document.getElementById('game-message').innerHTML = `❌ Неправильно! Правильно: ${correct}`;
            document.getElementById('game-message').style.color = '#f56565';
            allBtns.forEach(b => { if (b.textContent === correct) b.classList.add('correct'); });
        }
        const user = auth.currentUser;
        if (user) await updateWeight(wordId, isCorrect, user.uid, currentMode);
        if (currentGameWords[currentQuestionIndex]) {
            currentGameWords[currentQuestionIndex].answered = true;
            currentGameWords[currentQuestionIndex].correct = isCorrect;
        }
        allBtns.forEach(b => b.disabled = true);
        currentQuestionIndex++;
        if (currentQuestionIndex < currentQuestions.length) {
            document.getElementById('next-btn').style.display = 'block';
        } else {
            await endGame();
        }
    }
    
    async function endGame() {
        gameActive = false;
        const user = auth.currentUser;
        if (user) {
            const userRef = db.collection('users').doc(user.uid);
            const doc = await userRef.get();
            if (doc.exists) {
                const data = doc.data();
                const updateData = {
                    totalScore: (data.totalScore || 0) + currentScore,
                    totalCorrect: (data.totalCorrect || 0) + correctAnswers,
                    gamesPlayed: (data.gamesPlayed || 0) + 1
                };
                if (currentMode === 'RUS_ARM') {
                    updateData.rusArmStats = {
                        score: (data.rusArmStats?.score || 0) + currentScore,
                        correct: (data.rusArmStats?.correct || 0) + correctAnswers,
                        games: (data.rusArmStats?.games || 0) + 1
                    };
                } else {
                    updateData.armRusStats = {
                        score: (data.armRusStats?.score || 0) + currentScore,
                        correct: (data.armRusStats?.correct || 0) + correctAnswers,
                        games: (data.armRusStats?.games || 0) + 1
                    };
                }
                await userRef.update(updateData);
            }
        }
        document.getElementById('result-mode-text').innerHTML = currentMode === 'RUS_ARM' ? '🇷🇺 Русский → Армянский' : '🇦🇲 Армянский → Русский';
        document.getElementById('result-correct').textContent = correctAnswers;
        document.getElementById('result-total').textContent = currentQuestions.length;
        document.getElementById('result-score').textContent = currentScore;
        document.getElementById('result-modal').style.display = 'flex';
        
        document.getElementById('restart-game').onclick = () => { document.getElementById('result-modal').style.display = 'none'; startNewGame(); };
        document.getElementById('change-mode').onclick = () => {
            document.getElementById('result-modal').style.display = 'none';
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'block';
            currentMode = null;
        };
    }
    
    // Назначаем обработчики для кнопок игры
    document.getElementById('next-btn')?.addEventListener('click', () => {
        if (currentQuestionIndex < currentQuestions.length) loadQuestion();
    });
    document.getElementById('back-to-menu')?.addEventListener('click', () => {
        if (confirm('Выйти в меню?')) {
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'block';
            currentMode = null;
        }
    });
}

// Страница профиля
if (window.location.pathname.includes('profile.html')) {
    document.addEventListener('DOMContentLoaded', async () => {
        // Ждём авторизацию
        auth.onAuthStateChanged(async (user) => {
            if (!user) { window.location.href = 'index.html'; return; }
            
            // Загружаем данные пользователя
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('profile-name').textContent = data.name || 'Ученик';
                document.getElementById('profile-email').textContent = user.email;
                document.getElementById('total-score').textContent = data.totalScore || 0;
                document.getElementById('total-answers').textContent = data.totalCorrect || 0;
                document.getElementById('games-played').textContent = data.gamesPlayed || 0;
                
                const rusArmStats = data.rusArmStats || { score: 0, correct: 0, games: 0 };
                const armRusStats = data.armRusStats || { score: 0, correct: 0, games: 0 };
                document.getElementById('mode-stats').innerHTML = `
                    <div class="stats-mode"><h4>🇷🇺 Русский → Армянский 🇦🇲</h4><p>🎯 Очки: ${rusArmStats.score} | ✅ Правильно: ${rusArmStats.correct} | 🎮 Игр: ${rusArmStats.games}</p></div>
                    <div class="stats-mode"><h4>🇦🇲 Армянский → Русский 🇷🇺</h4><p>🎯 Очки: ${armRusStats.score} | ✅ Правильно: ${armRusStats.correct} | 🎮 Игр: ${armRusStats.games}</p></div>
                `;
                
                const wordsList = document.getElementById('words-list');
                const learnedWords = data.learnedWords || [];
                if (learnedWords.length === 0) {
                    wordsList.innerHTML = '<p class="placeholder">Пройдите игру, чтобы изучать слова</p>';
                } else {
                    wordsList.innerHTML = '';
                    learnedWords.forEach(w => {
                        const div = document.createElement('div');
                        div.className = 'word-item';
                        div.innerHTML = `${w.mode === 'RUS_ARM' ? '🇷🇺➡️🇦🇲' : '🇦🇲➡️🇷🇺'} <span><strong>${escapeHtml(w.word)}</strong> → ${escapeHtml(w.translation)}</span>`;
                        wordsList.appendChild(div);
                    });
                }
            }
            
            // Загружаем таблицу лидеров
            await loadLeaderboard();
        });
        
        // Кнопка выхода
        document.getElementById('logout-btn-profile')?.addEventListener('click', async () => {
            await auth.signOut();
            window.location.href = 'index.html';
        });
    });
}