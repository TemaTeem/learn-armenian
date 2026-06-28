// ========== FIREBASE CONFIG ==========
const firebaseConfig = {
    apiKey: "AIzaSyDShCzZja-zwwI3hlqY3_XS_4JP1s-cXcw",
    authDomain: "learnam-f5c99.firebaseapp.com",
    projectId: "learnam-f5c99",
    storageBucket: "learnam-f5c99.firebasestorage.app",
    messagingSenderId: "62297810080",
    appId: "1:62297810080:web:1ffc50c5a38d2c907a95c5"
};

// ========== GOOGLE SHEETS API ==========
const SHEET_URL_BASE = "https://script.google.com/macros/s/AKfycby29REM7ykGovhBuNb755KGIwR6Swi_vdH9oPE1oVV2MO74azqtf74UpkTitYbZKoAM/exec";

// ========== GAME SETTINGS ==========
const WEIGHT_SETTINGS = {
    DEFAULT_WEIGHT: 1.0,
    CORRECT_DECREASE: 0.3,
    WRONG_INCREASE: 0.5,
    MIN_WEIGHT: 0.1,
    MAX_WEIGHT: 3.0,
    RESET_AFTER_GAMES: 5
};
const QUESTIONS_PER_GAME = 10;
const ALPHABET_POINTS = { correct: 5, wrong: 1 };
const SVG_RUS_ARM = `<svg width="40" height="24" viewBox="0 0 40 24"><use href="#icon-rus-arm"/></svg>`;
const SVG_ARM_RUS = `<svg width="40" height="24" viewBox="0 0 40 24"><use href="#icon-arm-rus"/></svg>`;
const SVG_ALPHABET = `<svg width="40" height="40" viewBox="0 0 40 40"><use href="#icon-alphabet"/></svg>`;

// ========== FIREBASE INIT ==========
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ========== GLOBAL STATE ==========
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
let alphabetDirection = 'letter-to-name';
let isAlphabetMode = false;
let alphabetQuestions = [];
let alphabetIndex = 0;
let alphabetCorrect = 0;
let alphabetWrong = 0;
let alphabetActive = false;

// ========== UTILITY FUNCTIONS ==========
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

// ========== DATA LOADING ==========
function parseWordsCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const wordIdx = headers.findIndex(h => h.toLowerCase().replace(/["']/g, '').trim() === 'rus');
    const transIdx = headers.findIndex(h => h.toLowerCase().replace(/["']/g, '').trim() === 'arm');
    if (wordIdx === -1 || transIdx === -1) return [];
    const words = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const russian = values[wordIdx]?.replace(/["']/g, '').trim();
        const armenian = values[transIdx]?.replace(/["']/g, '').trim();
        if (russian && armenian) words.push({ id: russian, russian, armenian });
    }
    return words;
}

function parseAlphabetCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const letterIdx = headers.findIndex(h => h.toLowerCase().trim() === 'letter');
    const nameIdx = headers.findIndex(h => h.toLowerCase().trim() === 'name');
    const result = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const letter = values[letterIdx]?.trim() || '';
        const name = values[nameIdx]?.trim() || '';
        if (letter && name) result.push({ letter, name });
    }
    return result;
}

async function loadSheetData(sheetName, parser) {
    const url = SHEET_URL_BASE + '?sheet=' + sheetName;
    try {
        console.log(`📥 Загрузка ${sheetName}...`);
        const response = await fetch(url, { mode: 'cors', headers: { Accept: 'text/csv, text/plain, */*' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const csv = await response.text();
        if (!csv.trim()) throw new Error('Пустой ответ');
        const data = parser(csv);
        if (!data.length) throw new Error('Нет данных');
        console.log(`✅ Загружено ${data.length} записей из ${sheetName}`);
        return data;
    } catch (e) {
        console.error(`❌ Ошибка загрузки ${sheetName}:`, e);
        return [];
    }
}

async function loadWords() {
    wordsDatabase = await loadSheetData('Words', parseWordsCSV);
}

async function loadAlphabet() {
    alphabetData = await loadSheetData('Alphabet', parseAlphabetCSV);
}

// ========== WEIGHT SYSTEM ==========
async function loadWeights(userId, mode) {
    try {
        const doc = await db.collection('wordWeights').doc(userId).get();
        if (doc.exists) {
            const data = doc.data();
            wordsWeights[mode] = data[mode] || {};
            gamesSinceReset[mode] = data.gamesSinceReset?.[mode] || 0;
        } else {
            initWeights(mode);
        }
    } catch (e) { console.error('Ошибка весов:', e); initWeights(mode); }
}

function initWeights(mode) {
    wordsWeights[mode] = {};
    wordsDatabase.forEach(word => {
        const key = mode === 'RUS_ARM' ? word.russian : word.armenian;
        wordsWeights[mode][key] = WEIGHT_SETTINGS.DEFAULT_WEIGHT;
    });
}

async function saveWeights(userId) {
    if (!userId) return;
    try {
        await db.collection('wordWeights').doc(userId).set({
            RUS_ARM: wordsWeights.RUS_ARM || {},
            ARM_RUS: wordsWeights.ARM_RUS || {},
            gamesSinceReset,
            lastUpdated: new Date()
        });
    } catch (e) { console.error('Ошибка сохранения весов:', e); }
}

function selectWordsWithWeights(mode, count) {
    if (!wordsDatabase.length) return [];
    const pool = [];
    wordsDatabase.forEach(word => {
        const key = mode === 'RUS_ARM' ? word.russian : word.armenian;
        const weight = wordsWeights[mode][key] || WEIGHT_SETTINGS.DEFAULT_WEIGHT;
        for (let i = 0; i < Math.max(1, Math.round(weight * 10)); i++) pool.push(word);
    });
    const shuffled = shuffleArray([...pool]);
    const selected = [];
    const used = new Set();
    for (const word of shuffled) {
        const id = mode === 'RUS_ARM' ? word.russian : word.armenian;
        if (!used.has(id)) {
            used.add(id);
            selected.push(word);
            if (selected.length === count) break;
        }
    }
    if (selected.length < count) {
        const rest = wordsDatabase.filter(w => !used.has(mode === 'RUS_ARM' ? w.russian : w.armenian));
        selected.push(...shuffleArray(rest).slice(0, count - selected.length));
    }
    return selected;
}

async function updateWeight(wordKey, isCorrect, userId, mode) {
    if (!wordsWeights[mode]) wordsWeights[mode] = {};
    const current = wordsWeights[mode][wordKey] || WEIGHT_SETTINGS.DEFAULT_WEIGHT;
    let newWeight = isCorrect ? current - WEIGHT_SETTINGS.CORRECT_DECREASE : current + WEIGHT_SETTINGS.WRONG_INCREASE;
    newWeight = Math.max(WEIGHT_SETTINGS.MIN_WEIGHT, Math.min(WEIGHT_SETTINGS.MAX_WEIGHT, newWeight));
    wordsWeights[mode][wordKey] = newWeight;
    if (userId) await saveWeights(userId);
}

// ========== LEADERBOARD ==========
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
    } catch (e) { console.error('Ошибка лидерборда:', e); }
}

// ========== LOGOUT ==========
function initLogout() {
    const btn = document.getElementById('logout-btn') || document.getElementById('logout-btn-profile');
    if (btn) btn.addEventListener('click', () => { auth.signOut(); window.location.href = 'index.html'; });
}

// ========== PAGE: INDEX ==========
if (window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/')) {
    document.addEventListener('DOMContentLoaded', () => {
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
            });
        });
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            try {
                await auth.signInWithEmailAndPassword(email, password);
                window.location.href = 'game.html';
            } catch (err) { errorDiv.textContent = 'Ошибка: ' + err.message; }
        });
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reg-name').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const errorDiv = document.getElementById('reg-error');
            try {
                const cred = await auth.createUserWithEmailAndPassword(email, password);
                await db.collection('users').doc(cred.user.uid).set({
                    name, email, totalScore: 0, totalCorrect: 0, gamesPlayed: 0,
                    learnedWords: [],
                    rusArmStats: { score: 0, correct: 0, games: 0 },
                    armRusStats: { score: 0, correct: 0, games: 0 }
                });
                window.location.href = 'game.html';
            } catch (err) { errorDiv.textContent = 'Ошибка: ' + err.message; }
        });
    });
}

// ========== PAGE: GAME ==========
if (window.location.pathname.includes('game.html')) {
    async function initGame() {
        const user = auth.currentUser;
        if (!user) return window.location.href = 'index.html';
        const modeDiv = document.getElementById('mode-selection');
        if (modeDiv) {
            modeDiv.innerHTML = `
                <h2>Выберите режим тренировки</h2>
                <div class="mode-cards">
                    <div class="mode-card" data-mode="RUS_ARM"><div class="mode-icon">${SVG_RUS_ARM}</div><h3>Русский → Армянский</h3><p>Вам показывают русское слово, нужно выбрать армянский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ARM_RUS"><div class="mode-icon">${SVG_ARM_RUS}</div><h3>Армянский → Русский</h3><p>Вам показывают армянское слово, нужно выбрать русский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ALPHABET"><div class="mode-icon">${SVG_ALPHABET}</div><h3>Тренировка алфавита</h3><p>Изучайте армянские буквы и их названия</p><button class="mode-btn">Выбрать</button></div>
                </div>
            `;
        }
        attachModeButtons();
        initLogout();
    }

    function attachModeButtons() {
        document.querySelectorAll('.mode-card').forEach(card => {
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
            const mode = newCard.dataset.mode;
            const start = async () => {
                if (mode === 'ALPHABET') {
                    await startAlphabetMode();
                } else {
                    await startWordMode(mode);
                }
            };
            newCard.addEventListener('click', start);
            const btn = newCard.querySelector('.mode-btn');
            if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); start(); });
        });
    }

    // ===== WORD MODE =====
    async function startWordMode(mode) {
        // Загружаем слова, если ещё не загружены
        if (wordsDatabase.length === 0) {
            const modeDiv = document.getElementById('mode-selection');
            if (modeDiv) modeDiv.innerHTML = `<div class="loading-container"><p>📥 Загрузка слов...</p></div>`;
            await loadWords();
            if (wordsDatabase.length < 4) {
                alert('Недостаточно слов для тренировки (минимум 4). Проверьте таблицу.');
                // Восстанавливаем меню
                if (modeDiv) {
                    modeDiv.innerHTML = `
                        <h2>Выберите режим тренировки</h2>
                        <div class="mode-cards">
                    <div class="mode-card" data-mode="RUS_ARM"><div class="mode-icon">${SVG_RUS_ARM}</div><h3>Русский → Армянский</h3><p>Вам показывают русское слово, нужно выбрать армянский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ARM_RUS"><div class="mode-icon">${SVG_ARM_RUS}</div><h3>Армянский → Русский</h3><p>Вам показывают армянское слово, нужно выбрать русский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ALPHABET"><div class="mode-icon">${SVG_ALPHABET}</div><h3>Тренировка алфавита</h3><p>Изучайте армянские буквы и их названия</p><button class="mode-btn">Выбрать</button></div>
                </div>
                    `;
                    attachModeButtons();
                }
                return;
            }
            const user = auth.currentUser;
            if (user) {
                await loadWeights(user.uid, 'RUS_ARM');
                await loadWeights(user.uid, 'ARM_RUS');
            }
        }

        isAlphabetMode = false;
        document.getElementById('alphabet-direction-switch').style.display = 'none';
        currentMode = mode;
        document.getElementById('mode-selection').style.display = 'none';
        document.getElementById('game-area').style.display = 'block';
        document.getElementById('mode-badge').innerHTML = mode === 'RUS_ARM' ? '🇷🇺 РУССКИЙ → АРМЯНСКИЙ 🇦🇲' : '🇦🇲 АРМЯНСКИЙ → РУССКИЙ 🇷🇺';
        await startNewGame();
    }

    async function startNewGame() {
        const selected = selectWordsWithWeights(currentMode, QUESTIONS_PER_GAME);
        currentQuestions = selected.map(word => {
            const question = currentMode === 'RUS_ARM' ? word.russian : word.armenian;
            const correct = currentMode === 'RUS_ARM' ? word.armenian : word.russian;
            const options = generateOptions(correct, currentMode, currentMode === 'RUS_ARM' ? word.russian : word.armenian);
            return { id: currentMode === 'RUS_ARM' ? word.russian : word.armenian, question, correctAnswer: correct, options };
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
        document.getElementById('show-results-btn').style.display = 'none';
        loadQuestion();
    }

    function loadQuestion() {
        if (!gameActive) return;
        const q = currentQuestions[currentQuestionIndex];
        document.getElementById('question-text').innerHTML = currentMode === 'RUS_ARM' ? `Как перевести "${q.question}" на армянский?` : `Как перевести "${q.question}" на русский?`;
        document.getElementById('current-q').textContent = currentQuestionIndex + 1;
        const container = document.getElementById('answers-container');
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

    function generateOptions(correctAnswer, mode, currentWordId) {
        let candidates = [];
        if (mode === 'RUS_ARM') {
            candidates = wordsDatabase.filter(w => w.russian !== currentWordId).map(w => w.armenian);
        } else {
            candidates = wordsDatabase.filter(w => w.armenian !== currentWordId).map(w => w.russian);
        }
        const shuffled = shuffleArray([...candidates]);
        const wrong = [];
        for (let i = 0; i < shuffled.length && wrong.length < 3; i++) {
            if (shuffled[i] !== correctAnswer) wrong.push(shuffled[i]);
        }
        while (wrong.length < 3) wrong.push(`Вариант ${wrong.length + 1}`);
        return shuffleArray([correctAnswer, ...wrong]);
    }

    async function saveLearnedWord(word, translation) {
        const user = auth.currentUser;
        if (!user) return;
        try {
            const userRef = db.collection('users').doc(user.uid);
            const doc = await userRef.get();
            if (doc.exists) {
                let learned = doc.data().learnedWords || [];
                const key = `${currentMode}_${word}`;
                if (!learned.some(w => w.key === key)) {
                    learned.push({ key, mode: currentMode, word, translation, learnedAt: new Date() });
                    await userRef.update({ learnedWords: learned });
                }
            }
        } catch (e) { console.error('Ошибка сохранения слова:', e); }
    }

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
            gameActive = false;
            document.getElementById('next-btn').style.display = 'none';
            document.getElementById('show-results-btn').style.display = 'block';
        }
    }

    // ===== ALPHABET MODE =====
    async function startAlphabetMode() {
        if (alphabetData.length === 0) {
            const modeDiv = document.getElementById('mode-selection');
            if (modeDiv) modeDiv.innerHTML = `<div class="loading-container"><p>📥 Загрузка алфавита...</p></div>`;
            await loadAlphabet();
            if (alphabetData.length === 0) {
                alert('Не удалось загрузить алфавит. Проверьте лист "Alphabet".');
                // Восстанавливаем меню
                if (modeDiv) {
                    modeDiv.innerHTML = `
                        <h2>Выберите режим тренировки</h2>
                        <div class="mode-cards">
                    <div class="mode-card" data-mode="RUS_ARM"><div class="mode-icon">${SVG_RUS_ARM}</div><h3>Русский → Армянский</h3><p>Вам показывают русское слово, нужно выбрать армянский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ARM_RUS"><div class="mode-icon">${SVG_ARM_RUS}</div><h3>Армянский → Русский</h3><p>Вам показывают армянское слово, нужно выбрать русский перевод</p><button class="mode-btn">Выбрать</button></div>
                    <div class="mode-card" data-mode="ALPHABET"><div class="mode-icon">${SVG_ALPHABET}</div><h3>Тренировка алфавита</h3><p>Изучайте армянские буквы и их названия</p><button class="mode-btn">Выбрать</button></div>
                </div>
                    `;
                    attachModeButtons();
                }
                return;
            }
        }

        isAlphabetMode = true;
        document.getElementById('alphabet-direction-switch').style.display = 'flex';
        currentMode = 'ALPHABET';
        document.getElementById('mode-selection').style.display = 'none';
        document.getElementById('game-area').style.display = 'block';
        document.getElementById('mode-badge').innerHTML = '🔤 ТРЕНИРОВКА АЛФАВИТА';
        alphabetCorrect = 0;
        alphabetWrong = 0;
        document.getElementById('score').textContent = '0';
        document.getElementById('game-message').innerHTML = '';
        document.getElementById('next-btn').style.display = 'none';
        document.getElementById('show-results-btn').style.display = 'none';
        setAlphabetDirection('letter-to-name');
        startAlphabetGame();
    }

    function setAlphabetDirection(dir) {
        alphabetDirection = dir;
        document.querySelectorAll('#alphabet-direction-switch .mode-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(dir === 'letter-to-name' ? 'dir-letter-to-name' : 'dir-name-to-letter').classList.add('active');
        if (alphabetActive) startAlphabetGame();
    }

    function startAlphabetGame() {
        if (!alphabetData.length) {
            document.getElementById('question-text').innerHTML = '⚠️ Алфавит не загружен.';
            return;
        }
        const shuffled = shuffleArray([...alphabetData]);
        alphabetQuestions = shuffled.slice(0, Math.min(shuffled.length, 20));
        alphabetIndex = 0;
        alphabetActive = true;
        gameActive = true;
        currentScore = 0;
        correctAnswers = 0;
        document.getElementById('score').textContent = '0';
        document.getElementById('total-q').textContent = alphabetQuestions.length;
        document.getElementById('current-q').textContent = '1';
        document.getElementById('game-message').innerHTML = '';
        document.getElementById('next-btn').style.display = 'none';
        document.getElementById('show-results-btn').style.display = 'none';
        loadAlphabetQuestion();
    }

    function loadAlphabetQuestion() {
        if (!alphabetActive) return;
        if (alphabetIndex >= alphabetQuestions.length) {
            alphabetActive = false;
            gameActive = false;
            document.getElementById('next-btn').style.display = 'none';
            document.getElementById('show-results-btn').style.display = 'block';
            document.getElementById('question-text').innerHTML = '🏆 Тренировка завершена!';
            document.getElementById('answers-container').innerHTML = '';
            document.getElementById('game-message').innerHTML = 'Нажмите "Показать результаты"';
            return;
        }

        const item = alphabetQuestions[alphabetIndex];
        const qEl = document.getElementById('question-text');
        const optContainer = document.getElementById('answers-container');
        let correctAnswer, displayText, options;
        if (alphabetDirection === 'letter-to-name') {
            displayText = item.letter;
            correctAnswer = item.name;
            const allNames = alphabetData.map(i => i.name);
            const wrong = shuffleArray(allNames.filter(n => n !== correctAnswer)).slice(0, 3);
            options = shuffleArray([correctAnswer, ...wrong]);
        } else {
            displayText = item.name;
            correctAnswer = item.letter;
            const allLetters = alphabetData.map(i => i.letter);
            const wrong = shuffleArray(allLetters.filter(l => l !== correctAnswer)).slice(0, 3);
            options = shuffleArray([correctAnswer, ...wrong]);
        }

        qEl.textContent = displayText;
        optContainer.innerHTML = '';
        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.classList.add('answer-btn');
            btn.addEventListener('click', () => checkAlphabetAnswer(btn, opt, correctAnswer));
            optContainer.appendChild(btn);
        });
        document.getElementById('current-q').textContent = alphabetIndex + 1;
        document.getElementById('game-message').innerHTML = '';
        document.getElementById('next-btn').style.display = 'none';
    }

    async function checkAlphabetAnswer(btn, selected, correct) {
        if (!alphabetActive) return;
        const allBtns = document.querySelectorAll('.answer-btn');
        if (Array.from(allBtns).some(b => b.disabled)) return;
        const isCorrect = (selected === correct);
        if (isCorrect) {
            btn.classList.add('correct');
            currentScore += ALPHABET_POINTS.correct;
            correctAnswers++;
            document.getElementById('score').textContent = currentScore;
            document.getElementById('game-message').innerHTML = `✅ Правильно! +${ALPHABET_POINTS.correct} очков`;
            document.getElementById('game-message').style.color = '#48bb78';
        } else {
            btn.classList.add('wrong');
            currentScore = Math.max(0, currentScore - ALPHABET_POINTS.wrong);
            document.getElementById('score').textContent = currentScore;
            document.getElementById('game-message').innerHTML = `❌ Неправильно! Правильно: ${correct} ( -${ALPHABET_POINTS.wrong} очко )`;
            document.getElementById('game-message').style.color = '#f56565';
            allBtns.forEach(b => { if (b.innerText === correct) b.classList.add('correct'); });
        }
        allBtns.forEach(b => b.disabled = true);
        alphabetIndex++;
        if (alphabetIndex < alphabetQuestions.length) {
            document.getElementById('next-btn').style.display = 'block';
            document.getElementById('next-btn').textContent = '➡ Следующая буква';
        } else {
            alphabetActive = false;
            gameActive = false;
            document.getElementById('next-btn').style.display = 'none';
            document.getElementById('show-results-btn').style.display = 'block';
            document.getElementById('question-text').innerHTML = '🏆 Тренировка завершена!';
            document.getElementById('answers-container').innerHTML = '';
            document.getElementById('game-message').innerHTML = 'Нажмите "Показать результаты"';
        }
    }

    // ===== COMMON ENDGAME =====
    async function endGame() {
        const user = auth.currentUser;
        if (user) {
            const userRef = db.collection('users').doc(user.uid);
            const doc = await userRef.get();
            if (doc.exists) {
                const data = doc.data();
                const update = {
                    totalScore: (data.totalScore || 0) + currentScore,
                    totalCorrect: (data.totalCorrect || 0) + correctAnswers,
                    gamesPlayed: (data.gamesPlayed || 0) + 1
                };
                if (!isAlphabetMode && currentMode && currentMode !== 'ALPHABET') {
                    if (currentMode === 'RUS_ARM') {
                        update.rusArmStats = {
                            score: (data.rusArmStats?.score || 0) + currentScore,
                            correct: (data.rusArmStats?.correct || 0) + correctAnswers,
                            games: (data.rusArmStats?.games || 0) + 1
                        };
                    } else if (currentMode === 'ARM_RUS') {
                        update.armRusStats = {
                            score: (data.armRusStats?.score || 0) + currentScore,
                            correct: (data.armRusStats?.correct || 0) + correctAnswers,
                            games: (data.armRusStats?.games || 0) + 1
                        };
                    }
                }
                await userRef.update(update);
            }
        }

        const modeText = isAlphabetMode ? '🔤 Тренировка алфавита' : (currentMode === 'RUS_ARM' ? '🇷🇺 Русский → Армянский' : '🇦🇲 Армянский → Русский');
        document.getElementById('result-mode-text').innerHTML = modeText;
        document.getElementById('result-correct').textContent = correctAnswers;
        document.getElementById('result-total').textContent = (isAlphabetMode ? alphabetQuestions.length : currentQuestions.length);
        document.getElementById('result-score').textContent = currentScore;
        document.getElementById('result-modal').style.display = 'flex';

        document.getElementById('restart-game').onclick = () => {
            document.getElementById('result-modal').style.display = 'none';
            if (isAlphabetMode) startAlphabetGame();
            else startNewGame();
        };
        document.getElementById('change-mode').onclick = () => {
            document.getElementById('result-modal').style.display = 'none';
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'block';
            currentMode = null;
            isAlphabetMode = false;
            document.getElementById('alphabet-direction-switch').style.display = 'none';
        };
    }

    // ===== EVENT LISTENERS =====
    document.getElementById('dir-letter-to-name')?.addEventListener('click', () => setAlphabetDirection('letter-to-name'));
    document.getElementById('dir-name-to-letter')?.addEventListener('click', () => setAlphabetDirection('name-to-letter'));

    document.getElementById('next-btn')?.addEventListener('click', () => {
        if (isAlphabetMode && alphabetActive) loadAlphabetQuestion();
        else if (!isAlphabetMode && gameActive) loadQuestion();
    });
    document.getElementById('show-results-btn')?.addEventListener('click', async () => {
        document.getElementById('show-results-btn').style.display = 'none';
        await endGame();
    });
    document.getElementById('back-to-menu')?.addEventListener('click', () => {
        if (confirm('Выйти в меню?')) {
            document.getElementById('game-area').style.display = 'none';
            document.getElementById('mode-selection').style.display = 'block';
            currentMode = null;
            isAlphabetMode = false;
            document.getElementById('alphabet-direction-switch').style.display = 'none';
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(user => { if (user) initGame(); else window.location.href = 'index.html'; });
    });
}

// ========== PAGE: ALPHABET (view only) ==========
if (window.location.pathname.includes('alphabet.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) return window.location.href = 'index.html';
            const grid = document.getElementById('alphabet-grid');
            if (!grid) return;
            grid.innerHTML = '<p class="loading">Загрузка алфавита...</p>';
            await loadAlphabet();
            if (!alphabetData.length) {
                grid.innerHTML = '<p class="placeholder">Не удалось загрузить алфавит. Проверьте лист "Alphabet".</p>';
                return;
            }
            let html = '';
            alphabetData.forEach(item => {
                html += `
                    <div class="alphabet-card">
                        <div class="alphabet-letter">${escapeHtml(item.letter)}</div>
                        <div class="alphabet-name">${escapeHtml(item.name)}</div>
                    </div>
                `;
            });
            grid.innerHTML = html;
            initLogout();
        });
    });
}

// ========== PAGE: PROFILE ==========
if (window.location.pathname.includes('profile.html')) {
    document.addEventListener('DOMContentLoaded', () => {
        auth.onAuthStateChanged(async (user) => {
            if (!user) return window.location.href = 'index.html';
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('profile-name').textContent = data.name || 'Ученик';
                document.getElementById('profile-email').textContent = user.email;
                document.getElementById('total-score').textContent = data.totalScore || 0;
                document.getElementById('total-answers').textContent = data.totalCorrect || 0;
                document.getElementById('games-played').textContent = data.gamesPlayed || 0;

                const rusArm = data.rusArmStats || { score: 0, correct: 0, games: 0 };
                const armRus = data.armRusStats || { score: 0, correct: 0, games: 0 };
                document.getElementById('mode-stats').innerHTML = `
                    <div class="stats-mode"><h4>🇷🇺 Русский → Армянский 🇦🇲</h4><p>🎯 Очки: ${rusArm.score} | ✅ Правильно: ${rusArm.correct} | 🎮 Игр: ${rusArm.games}</p></div>
                    <div class="stats-mode"><h4>🇦🇲 Армянский → Русский 🇷🇺</h4><p>🎯 Очки: ${armRus.score} | ✅ Правильно: ${armRus.correct} | 🎮 Игр: ${armRus.games}</p></div>
                `;

                const wordsList = document.getElementById('words-list');
                const learned = data.learnedWords || [];
                if (!learned.length) {
                    wordsList.innerHTML = '<p class="placeholder">Пройдите игру, чтобы изучать слова</p>';
                } else {
                    wordsList.innerHTML = '';
                    learned.forEach(w => {
                        const div = document.createElement('div');
                        div.className = 'word-item';
                        div.innerHTML = `${w.mode === 'RUS_ARM' ? '🇷🇺➡️🇦🇲' : '🇦🇲➡️🇷🇺'} <span><strong>${escapeHtml(w.word)}</strong> → ${escapeHtml(w.translation)}</span>`;
                        wordsList.appendChild(div);
                    });
                }
            }
            await loadLeaderboard();
            initLogout();
        });
    });
}