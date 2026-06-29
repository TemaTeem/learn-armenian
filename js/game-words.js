// ===== Логика режимов "слово → перевод" =====
import { auth, db } from './firebase-init.js';
import { getWords, loadWords } from './data-loader.js';
import { selectWordsWithWeights, updateWeight, loadWeights } from './weight-system.js';
import { QUESTIONS_PER_GAME } from './config.js';
import { shuffleArray, escapeHtml, showElement, hideElement } from './ui-helpers.js';
import { renderMainMenu } from './menu.js';

// Состояние игры (только для этого модуля)
let currentMode = null;
let currentQuestions = [];
let currentQuestionIndex = 0;
let currentScore = 0;
let correctAnswers = 0;
let gameActive = false;
let currentGameWords = [];

// Ссылки на DOM-элементы (кешируем)
const modeSelection = document.getElementById('mode-selection');
const gameArea = document.getElementById('game-area');
const modeBadge = document.getElementById('mode-badge');
const scoreEl = document.getElementById('score');
const currentQEl = document.getElementById('current-q');
const totalQEl = document.getElementById('total-q');
const questionText = document.getElementById('question-text');
const answersContainer = document.getElementById('answers-container');
const gameMessage = document.getElementById('game-message');
const nextBtn = document.getElementById('next-btn');
const showResultsBtn = document.getElementById('show-results-btn');
const backToMenuBtn = document.getElementById('back-to-menu');
const resultModal = document.getElementById('result-modal');
const resultModeText = document.getElementById('result-mode-text');
const resultCorrect = document.getElementById('result-correct');
const resultTotal = document.getElementById('result-total');
const resultScore = document.getElementById('result-score');
const restartGameBtn = document.getElementById('restart-game');
const changeModeBtn = document.getElementById('change-mode');

// Экспортируем функцию запуска режима
export async function startWordMode(mode) {
  // Если слова ещё не загружены – загружаем
  if (getWords().length === 0) {
    if (modeSelection) modeSelection.innerHTML = `<div class="loading-container"><p>📥 Загрузка слов...</p></div>`;
    await loadWords();
    if (getWords().length < 4) {
      alert('Недостаточно слов для тренировки (минимум 4). Проверьте таблицу.');
      // Восстанавливаем главное меню
      if (modeSelection) {
        renderMainMenu();
      }
      return;
    }
    const user = auth.currentUser;
    if (user) {
      await loadWeights(user.uid, 'RUS_ARM');
      await loadWeights(user.uid, 'ARM_RUS');
    }
  }

  currentMode = mode;
  hideElement(modeSelection);
  showElement(gameArea);
  //modeBadge.innerHTML = mode === 'RUS_ARM' ? '🇷🇺 РУССКИЙ → АРМЯНСКИЙ 🇦🇲' : '🇦🇲 АРМЯНСКИЙ → РУССКИЙ 🇷🇺';
  // Скрыть переключатель направления алфавита (если был виден)
  const alphabetSwitch = document.getElementById('alphabet-direction-switch');
  if (alphabetSwitch) hideElement(alphabetSwitch);
  startNewGame();
}

function startNewGame() {
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
  scoreEl.textContent = '0';
  totalQEl.textContent = currentQuestions.length;
  currentQEl.textContent = '1';
  gameMessage.innerHTML = '';
  hideElement(nextBtn);
  hideElement(showResultsBtn);
  loadQuestion();
}

function loadQuestion() {
  if (!gameActive) return;
  const q = currentQuestions[currentQuestionIndex];
  questionText.innerHTML = currentMode === 'RUS_ARM'
    ? `Как перевести "${q.question}" на армянский?`
    : `Как перевести "${q.question}" на русский?`;
  currentQEl.textContent = currentQuestionIndex + 1;
  answersContainer.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.classList.add('answer-btn');
    btn.addEventListener('click', () => checkAnswer(btn, opt, q.correctAnswer, q.id));
    answersContainer.appendChild(btn);
  });
  hideElement(nextBtn);
}

function generateOptions(correctAnswer, mode, currentWordId) {
  let candidates = [];
  const words = getWords();
  if (mode === 'RUS_ARM') {
    candidates = words.filter(w => w.russian !== currentWordId).map(w => w.armenian);
  } else {
    candidates = words.filter(w => w.armenian !== currentWordId).map(w => w.russian);
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
    scoreEl.textContent = currentScore;
    gameMessage.innerHTML = '✅ Правильно! +10 очков';
    gameMessage.style.color = '#48bb78';
    saveLearnedWord(currentQuestions[currentQuestionIndex].question, correct);
  } else {
    btn.classList.add('wrong');
    currentScore = Math.max(0, currentScore - 3);
    scoreEl.textContent = currentScore;
    gameMessage.innerHTML = `❌ Неправильно! Правильно: ${correct} ( -3 очка )`;
    gameMessage.style.color = '#f56565';
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
    showElement(nextBtn);
  } else {
    gameActive = false;
    hideElement(nextBtn);
    showElement(showResultsBtn);
  }
}

// Функция завершения игры и показа результатов
export async function endWordGame() {
  const user = auth.currentUser;
  if (user) {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      const update = {
        totalScore: (data.totalScore || 0) + currentScore,
        totalCorrect: (data.totalCorrect || 0) + correctAnswers,
        gamesPlayed: (data.gamesPlayed || 0) + 1,
      };
      if (currentMode === 'RUS_ARM') {
        update.rusArmStats = {
          score: (data.rusArmStats?.score || 0) + currentScore,
          correct: (data.rusArmStats?.correct || 0) + correctAnswers,
          games: (data.rusArmStats?.games || 0) + 1,
        };
      } else if (currentMode === 'ARM_RUS') {
        update.armRusStats = {
          score: (data.armRusStats?.score || 0) + currentScore,
          correct: (data.armRusStats?.correct || 0) + correctAnswers,
          games: (data.armRusStats?.games || 0) + 1,
        };
      }
      await userRef.update(update);
    }
  }
  const modeText = currentMode === 'RUS_ARM' ? '🇷🇺 Русский → Армянский' : '🇦🇲 Армянский → Русский';
  resultModeText.innerHTML = modeText;
  resultCorrect.textContent = correctAnswers;
  resultTotal.textContent = currentQuestions.length;
  resultScore.textContent = currentScore;
  showElement(resultModal);

  restartGameBtn.onclick = () => {
    hideElement(resultModal);
    startNewGame();
  };
  changeModeBtn.onclick = () => {
    hideElement(resultModal);
    hideElement(gameArea);
    showElement(modeSelection);
    renderMainMenu(); // перерисовываем главное меню
    currentMode = null;
  };
}

// Экспортируем также функцию для возврата в меню (используется в app.js)
export function goBackToMenu() {
  if (confirm('Выйти в меню?')) {
    hideElement(document.getElementById('game-area'));
    renderMainMenu();
    currentMode = null;
    gameActive = false;
  }
}

// Подключаем обработчики для кнопок внутри этого модуля
export function initWordGameControls() {
  nextBtn.addEventListener('click', () => {
    if (gameActive) loadQuestion();
  });
  showResultsBtn.addEventListener('click', async () => {
    hideElement(showResultsBtn);
    await endWordGame();
  });
  // Убедимся, что кнопка существует и обработчик не дублируется
  if (backToMenuBtn) {
    backToMenuBtn.addEventListener('click', goBackToMenu);
  }
}