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
const SHEET_URL_BASE = "https://script.google.com/macros/s/AKfycby29REM7ykGovhBuNb755KGIwR6Swi_vdH9oPE1oVV2MO74azqtf74UpkTitYbZKoAM/exec";


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
let alphabetData = [];

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

async function loadWordsFromGoogleSheets(sheetName = 'Words') {
    const url = SHEET_URL_BASE + '?sheet=' + sheetName;
    // остальной код без изменений
    try {
        console.log(`📥 Загрузка из листа ${sheetName}...`);
        const response = await fetch(url, { mode: 'cors', headers: { 'Accept': 'text/csv, text/plain, */*' } });
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

async function loadAlphabetFromGoogleSheets() {
    const url = SHEET_URL_BASE + '?sheet=Alphabet';
    try {
        console.log("📥 Загрузка алфавита...");
        const response = await fetch(url, { mode: 'cors', headers: { 'Accept': 'text/csv, text/plain, */*' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csvText = await response.text();
        if (!csvText || csvText.trim().length === 0) throw new Error("Таблица алфавита пуста");
        
        // Парсим CSV
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];
        const headers = parseCSVLine(lines[0]);
        const letterIdx = headers.findIndex(h => h.toLowerCase().trim() === 'letter');
        const nameIdx = headers.findIndex(h => h.toLowerCase().trim() === 'name');
        const pronIdx = headers.findIndex(h => h.toLowerCase().trim() === 'pronunciation');
        const exIdx = headers.findIndex(h => h.toLowerCase().trim() === 'example');
        
        const alphabet = [];
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i]);
            const letter = values[letterIdx]?.trim() || '';
            const name = values[nameIdx]?.trim() || '';
            const pronunciation = values[pronIdx]?.trim() || '';
            const example = values[exIdx]?.trim() || '';
            if (letter) alphabet.push({ letter, name, pronunciation, example });
        }
        console.log(`✅ Загружено ${alphabet.length} букв`);
        return alphabet;
    } catch (error) {
        console.error("❌ Ошибка загрузки алфавита:", error);
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

// ========== СТРАНИЦА АЛФАВИТА ==========
if (window.location.pathname.includes('alphabet.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        // Ждём авторизацию через onAuthStateChanged
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }
            
            const grid = document.getElementById('alphabet-grid');
            if (!grid) return;
            
            // Показываем загрузку
            grid.innerHTML = '<p class="loading">Загрузка алфавита...</p>';
            
            // Загружаем данные
            alphabetData = await loadAlphabetFromGoogleSheets();
            
            if (alphabetData.length === 0) {
                grid.innerHTML = '<p class="placeholder">Не удалось загрузить алфавит. Проверьте лист "Alphabet" в таблице.</p>';
                return;
            }
            
            // Отображаем карточки
            let html = '';
            alphabetData.forEach(item => {
                html += `
                    <div class="alphabet-card">
                        <div class="alphabet-letter">${escapeHtml(item.letter)}</div>
                        <div class="alphabet-name">${escapeHtml(item.name)}</div>
                        <div class="alphabet-pronunciation">${escapeHtml(item.pronunciation)}</div>
                        <div class="alphabet-example">${escapeHtml(item.example)}</div>
                    </div>
                `;
            });
            grid.innerHTML = html;
        });
        
        // Кнопка выхода
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await auth.signOut();
                window.location.href = 'index.html';
            });
        }
    });
}

// ========== СТРАНИЦА ТРЕНИРОВКИ АЛФАВИТА ==========
if (window.location.pathname.includes('alphabet-practice.html')) {
    let practiceMode = 'letter-to-name'; // или 'name-to-letter'
    let practiceQuestions = [];
    let practiceIndex = 0;
    let practiceCorrect = 0;
    let practiceWrong = 0;
    let practiceActive = false;

    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) {
                window.location.href = 'index.html';
                return;
            }

            // Загружаем алфавит
            alphabetData = await loadAlphabetFromGoogleSheets();

            if (alphabetData.length === 0) {
                document.getElementById('practice-question').textContent = '⚠️ Алфавит не загружен. Проверьте лист "Alphabet".';
                return;
            }

            // Настройка кнопок переключения режимов
            document.getElementById('mode-letter-to-name').addEventListener('click', () => {
                setPracticeMode('letter-to-name');
            });
            document.getElementById('mode-name-to-letter').addEventListener('click', () => {
                setPracticeMode('name-to-letter');
            });

            // Кнопка "Следующая буква"
            document.getElementById('practice-next').addEventListener('click', () => {
                loadNextQuestion();
            });

            // Запускаем тренировку
            setPracticeMode('letter-to-name');

            // Кнопка выхода
            const logoutBtn = document.getElementById('logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await auth.signOut();
                    window.location.href = 'index.html';
                });
            }
        });
    });

    function setPracticeMode(mode) {
        practiceMode = mode;
        // Обновляем активную кнопку
        document.querySelectorAll('.mode-switcher .mode-btn').forEach(btn => btn.classList.remove('active'));
        if (mode === 'letter-to-name') {
            document.getElementById('mode-letter-to-name').classList.add('active');
        } else {
            document.getElementById('mode-name-to-letter').classList.add('active');
        }
        // Сбрасываем статистику
        practiceCorrect = 0;
        practiceWrong = 0;
        updateStats();
        // Перемешиваем и запускаем
        startPractice();
    }

    function startPractice() {
        // Берём все буквы, перемешиваем
        const shuffled = shuffleArray([...alphabetData]);
        practiceQuestions = shuffled.slice(0, Math.min(shuffled.length, 20)); // максимум 20 для тренировки
        practiceIndex = 0;
        practiceActive = true;
        document.getElementById('practice-message').textContent = '';
        document.getElementById('practice-next').style.display = 'none';
        loadNextQuestion();
    }

    function loadNextQuestion() {
        if (!practiceActive) return;
        if (practiceIndex >= practiceQuestions.length) {
            document.getElementById('practice-question').textContent = '🏆 Тренировка завершена!';
            document.getElementById('practice-options').innerHTML = '';
            document.getElementById('practice-message').textContent = 'Отличная работа!';
            document.getElementById('practice-next').style.display = 'none';
            practiceActive = false;
            return;
        }

        const item = practiceQuestions[practiceIndex];
        const questionEl = document.getElementById('practice-question');
        const optionsContainer = document.getElementById('practice-options');
        const messageEl = document.getElementById('practice-message');
        const nextBtn = document.getElementById('practice-next');

        // Готовим вопрос и правильный ответ
        let correctAnswer, displayText, options;
        if (practiceMode === 'letter-to-name') {
            // Показываем букву, нужно выбрать название
            displayText = item.letter; // например, "ա"
            correctAnswer = item.name; // например, "Айб"
            // Варианты: названия всех букв, перемешанные, кроме правильного
            const allNames = alphabetData.map(i => i.name);
            const wrongNames = allNames.filter(n => n !== correctAnswer);
            const shuffledWrong = shuffleArray(wrongNames).slice(0, 3);
            options = shuffleArray([correctAnswer, ...shuffledWrong]);
        } else {
            // Показываем название, нужно выбрать букву
            displayText = item.name; // например, "Айб"
            correctAnswer = item.letter; // например, "ա"
            const allLetters = alphabetData.map(i => i.letter);
            const wrongLetters = allLetters.filter(l => l !== correctAnswer);
            const shuffledWrong = shuffleArray(wrongLetters).slice(0, 3);
            options = shuffleArray([correctAnswer, ...shuffledWrong]);
        }

        // Отображаем вопрос
        questionEl.textContent = displayText;

        // Генерируем кнопки вариантов
        optionsContainer.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.dataset.value = opt;
            btn.addEventListener('click', () => handlePracticeAnswer(btn, opt, correctAnswer));
            optionsContainer.appendChild(btn);
        });

        messageEl.textContent = '';
        nextBtn.style.display = 'none';
    }

    function handlePracticeAnswer(btn, selected, correct) {
        const allBtns = document.querySelectorAll('#practice-options button');
        if (Array.from(allBtns).some(b => b.disabled)) return;

        const isCorrect = (selected === correct);
        if (isCorrect) {
            btn.classList.add('correct');
            practiceCorrect++;
            document.getElementById('practice-message').textContent = '✅ Правильно!';
            document.getElementById('practice-message').style.color = '#48bb78';
        } else {
            btn.classList.add('wrong');
            practiceWrong++;
            document.getElementById('practice-message').textContent = `❌ Неправильно! Правильно: ${correct}`;
            document.getElementById('practice-message').style.color = '#f56565';
            // Показать правильный ответ
            allBtns.forEach(b => {
                if (b.dataset.value === correct) {
                    b.classList.add('correct');
                }
            });
        }

        // Блокируем все кнопки
        allBtns.forEach(b => b.disabled = true);

        // Обновляем статистику
        updateStats();

        // Показываем кнопку "Следующий"
        practiceIndex++;
        if (practiceIndex < practiceQuestions.length) {
            document.getElementById('practice-next').style.display = 'block';
        } else {
            // Если это был последний вопрос, показываем кнопку для завершения
            document.getElementById('practice-next').style.display = 'block';
            document.getElementById('practice-next').textContent = '🏁 Завершить тренировку';
        }
    }

    function updateStats() {
        document.getElementById('practice-correct').textContent = practiceCorrect;
        document.getElementById('practice-wrong').textContent = practiceWrong;
    }
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
        
        console.log("🔄 Инициализация игры, загрузка слов...");
        const modeDiv = document.getElementById('mode-selection');
        if (modeDiv) {
            modeDiv.innerHTML = `<div class="loading-container"><p>📥 Загрузка слов...</p></div>`;
        }
        
        wordsDatabase = await loadWordsFromGoogleSheets();
        
        if (wordsDatabase.length < 4) {
            if (modeDiv) {
                modeDiv.innerHTML = `<div class="error-message-box"><p>⚠️ Загружено ${wordsDatabase.length} слов. Нужно минимум 4.</p></div>`;
            }
            return;
        }
        
        if (Object.keys(wordsWeights.RUS_ARM).length === 0) {
            await loadWeightsFromFirebase(user.uid, 'RUS_ARM');
            await loadWeightsFromFirebase(user.uid, 'ARM_RUS');
        }
        
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
        
        attachModeButtons();
        
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
    
    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(user => {
            if (user) initGame();
            else window.location.href = 'index.html';
        });
    });
    
    // Функции игры
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
    
    async function saveLearnedWord(word, translation) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const userRef = db.collection('users').doc(user.uid);
            const doc = await userRef.get();
            if (doc.exists) {
                let learnedWords = doc.data().learnedWords || [];
                const wordKey = `${currentMode}_${word}`;
                if (!learnedWords.some(w => w.key === wordKey)) {
                    learnedWords.push({
                        key: wordKey,
                        mode: currentMode,
                        word: word,
                        translation: translation,
                        learnedAt: new Date()
                    });
                    await userRef.update({ learnedWords });
                }
            }
        } catch (error) {
            console.error("Ошибка сохранения выученного слова:", error);
        }
    }

    //========ПРОВЕРКА ОТВЕТА

    async function checkAnswer(btn, selected, correct, wordId) {
        if (!gameActive) return;
        const allBtns = document.querySelectorAll('.answer-btn');
        if (Array.from(allBtns).some(b => b.disabled)) return;
        const isCorrect = (selected === correct);
        
        if (isCorrect) {
            btn.classList.add('correct');
            currentScore += 10;
            correctAnswers++;
            document.getElementById('score').textContent = currentScore;
            document.getElementById('game-message').innerHTML = '✅ Правильно! +10 очков';
            document.getElementById('game-message').style.color = '#48bb78';
            saveLearnedWord(currentQuestions[currentQuestionIndex].question, correct);
        } else {
            btn.classList.add('wrong');
            currentScore = Math.max(0, currentScore - 3);
            document.getElementById('score').textContent = currentScore;
            document.getElementById('game-message').innerHTML = `❌ Неправильно! Правильно: ${correct} ( -3 очка )`;
            document.getElementById('game-message').style.color = '#f56565';
            allBtns.forEach(b => { if (b.innerText === correct) b.classList.add('correct'); });
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
             // Игра окончена, но окно результатов не показываем автоматически
        gameActive = false;  // запрещаем дальнейшие ответы
        document.getElementById('next-btn').style.display = 'none';
        document.getElementById('show-results-btn').style.display = 'block';
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
    
    // Обработчики кнопок управления игрой
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (currentQuestionIndex < currentQuestions.length) loadQuestion();
        };
    }
    // Кнопка "Показать результаты"
    const showResultsBtn = document.getElementById('show-results-btn');
    if (showResultsBtn) {
        showResultsBtn.onclick = async () => {
            showResultsBtn.style.display = 'none';
            await endGame();
        };
    }    
    const backBtn = document.getElementById('back-to-menu');
    if (backBtn) {
        backBtn.onclick = () => {
            if (confirm('Выйти в меню?')) {
                document.getElementById('game-area').style.display = 'none';
                document.getElementById('mode-selection').style.display = 'block';
                currentMode = null;
            }
        };
    }
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