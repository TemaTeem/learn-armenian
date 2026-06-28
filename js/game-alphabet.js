// ===== Логика тренировки алфавита =====
// import { auth } from './firebase-init.js';
// import { getAlphabet, loadAlphabet } from './data-loader.js';
// import { ALPHABET_POINTS } from './config.js';
// import { shuffleArray, showElement, hideElement } from './ui-helpers.js';
// import { getModeCardsHTML } from './mode-cards.js';
// import { renderMainMenu } from './menu.js';

// ===== Логика тренировки алфавита =====
import { auth, db } from './firebase-init.js';
import { getAlphabet, loadAlphabet } from './data-loader.js';
import { ALPHABET_POINTS } from './config.js';
import { shuffleArray, showElement, hideElement } from './ui-helpers.js';
import { renderMainMenu } from './menu.js';

// Состояние
let alphabetDirection = 'letter-to-name'; // 'letter-to-name' или 'name-to-letter'
let alphabetQuestions = [];
let alphabetIndex = 0;
let alphabetActive = false;
let currentScore = 0;
let correctAnswers = 0;

// DOM-элементы (получаем один раз)
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

// Переключатели направления
const dirSwitch = document.getElementById('alphabet-direction-switch');
const dirLetterToName = document.getElementById('dir-letter-to-name');
const dirNameToLetter = document.getElementById('dir-name-to-letter');

export async function startAlphabetMode() {
  if (getAlphabet().length === 0) {
    if (modeSelection) modeSelection.innerHTML = `<div class="loading-container"><p>📥 Загрузка алфавита...</p></div>`;
    await loadAlphabet();
    if (getAlphabet().length === 0) {
      alert('Не удалось загрузить алфавит. Проверьте лист "Alphabet".');
      renderMainMenu();
      return;
    }
  }

  // Показываем переключатель направления
  if (dirSwitch) showElement(dirSwitch);

  hideElement(modeSelection);
  showElement(gameArea);
  // modeBadge.innerHTML = '🔤 ТРЕНИРОВКА АЛФАВИТА';
  currentScore = 0;
  correctAnswers = 0;
  scoreEl.textContent = '0';
  gameMessage.innerHTML = '';
  hideElement(nextBtn);
  hideElement(showResultsBtn);
  setAlphabetDirection(alphabetDirection); // применим текущее направление
  startAlphabetGame();
}

function setAlphabetDirection(dir) {
  alphabetDirection = dir;
  if (dirLetterToName && dirNameToLetter) {
    dirLetterToName.classList.toggle('active', dir === 'letter-to-name');
    dirNameToLetter.classList.toggle('active', dir === 'name-to-letter');
  }
  if (alphabetActive) startAlphabetGame();
}

function startAlphabetGame() {
  const data = getAlphabet();
  if (!data.length) {
    questionText.innerHTML = '⚠️ Алфавит не загружен.';
    return;
  }
  const shuffled = shuffleArray([...data]);
  alphabetQuestions = shuffled.slice(0, Math.min(shuffled.length, 20));
  alphabetIndex = 0;
  alphabetActive = true;
  currentScore = 0;
  correctAnswers = 0;
  scoreEl.textContent = '0';
  totalQEl.textContent = alphabetQuestions.length;
  currentQEl.textContent = '1';
  gameMessage.innerHTML = '';
  hideElement(nextBtn);
  hideElement(showResultsBtn);
  loadAlphabetQuestion();
}

function loadAlphabetQuestion() {
  if (!alphabetActive) return;
  if (alphabetIndex >= alphabetQuestions.length) {
    alphabetActive = false;
    hideElement(nextBtn);
    showElement(showResultsBtn);
    questionText.innerHTML = '🏆 Тренировка завершена!';
    answersContainer.innerHTML = '';
    gameMessage.innerHTML = 'Нажмите "Показать результаты"';
    return;
  }

  const item = alphabetQuestions[alphabetIndex];
  let correctAnswer, displayText, options;
  if (alphabetDirection === 'letter-to-name') {
    displayText = item.letter;
    correctAnswer = item.name;
    const allNames = getAlphabet().map(i => i.name);
    const wrong = shuffleArray(allNames.filter(n => n !== correctAnswer)).slice(0, 3);
    options = shuffleArray([correctAnswer, ...wrong]);
  } else {
    displayText = item.name;
    correctAnswer = item.letter;
    const allLetters = getAlphabet().map(i => i.letter);
    const wrong = shuffleArray(allLetters.filter(l => l !== correctAnswer)).slice(0, 3);
    options = shuffleArray([correctAnswer, ...wrong]);
  }

  questionText.textContent = displayText;
  answersContainer.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.classList.add('answer-btn');
    btn.addEventListener('click', () => checkAlphabetAnswer(btn, opt, correctAnswer));
    answersContainer.appendChild(btn);
  });
  currentQEl.textContent = alphabetIndex + 1;
  gameMessage.innerHTML = '';
  hideElement(nextBtn);
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
    scoreEl.textContent = currentScore;
    gameMessage.innerHTML = `✅ Правильно! +${ALPHABET_POINTS.correct} очков`;
    gameMessage.style.color = '#48bb78';
  } else {
    btn.classList.add('wrong');
    currentScore = Math.max(0, currentScore - ALPHABET_POINTS.wrong);
    scoreEl.textContent = currentScore;
    gameMessage.innerHTML = `❌ Неправильно! Правильно: ${correct} ( -${ALPHABET_POINTS.wrong} очко )`;
    gameMessage.style.color = '#f56565';
    allBtns.forEach(b => { if (b.innerText === correct) b.classList.add('correct'); });
  }
  allBtns.forEach(b => b.disabled = true);
  alphabetIndex++;
  if (alphabetIndex < alphabetQuestions.length) {
    showElement(nextBtn);
    nextBtn.textContent = '➡ Следующая буква';
  } else {
    alphabetActive = false;
    hideElement(nextBtn);
    showElement(showResultsBtn);
    questionText.innerHTML = '🏆 Тренировка завершена!';
    answersContainer.innerHTML = '';
    gameMessage.innerHTML = 'Нажмите "Показать результаты"';
  }
}

// Завершение игры
async function endAlphabetGame() {
  const user = auth.currentUser;
  if (user) {
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      await userRef.update({
        totalScore: (data.totalScore || 0) + currentScore,
        totalCorrect: (data.totalCorrect || 0) + correctAnswers,
        gamesPlayed: (data.gamesPlayed || 0) + 1,
      });
    }
  }
  resultModeText.innerHTML = '🔤 Тренировка алфавита';
  resultCorrect.textContent = correctAnswers;
  resultTotal.textContent = alphabetQuestions.length;
  resultScore.textContent = currentScore;
  showElement(resultModal);

  restartGameBtn.onclick = () => {
    hideElement(resultModal);
    startAlphabetGame();
  };
  changeModeBtn.onclick = () => {
    hideElement(resultModal);
    hideElement(gameArea);
    showElement(modeSelection);
    if (dirSwitch) hideElement(dirSwitch);
    alphabetActive = false;
  };
}

// Обработчики для переключателей направления и кнопок
export function initAlphabetControls() {
  if (dirLetterToName) {
    dirLetterToName.addEventListener('click', () => {
      if (alphabetActive || getAlphabet().length) {
        setAlphabetDirection('letter-to-name');
      }
    });
  }
  if (dirNameToLetter) {
    dirNameToLetter.addEventListener('click', () => {
      if (alphabetActive || getAlphabet().length) {
        setAlphabetDirection('name-to-letter');
      }
    });
  }

  nextBtn.addEventListener('click', () => {
    if (alphabetActive) loadAlphabetQuestion();
  });

  showResultsBtn.addEventListener('click', async () => {
    hideElement(showResultsBtn);
    await endAlphabetGame();
  });

  // Кнопка "Выйти в меню" – единый обработчик
  backToMenuBtn.addEventListener('click', () => {
    if (confirm('Выйти в меню?')) {
      hideElement(gameArea);
      showElement(modeSelection);
      if (dirSwitch) hideElement(dirSwitch);
      alphabetActive = false;
    }
  });
}