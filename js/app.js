import { auth, db } from './firebase-init.js';
// import { getModeCardsHTML } from './mode-cards.js';  // больше не используется
import { renderMainMenu, renderWordsSubmenu } from './menu.js';
import { startWordMode, initWordGameControls } from './game-words.js';
import { startAlphabetMode, initAlphabetControls } from './game-alphabet.js';
import { loadProfile, loadLeaderboard } from './profile.js';
import { initLogout } from './navigation.js';

const path = window.location.pathname;

if (path.includes('game.html')) {
  auth.onAuthStateChanged(user => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    // Рендерим главное меню (разделы: Алфавит, Слова, Предложения)
    renderMainMenu();
    initAlphabetControls();
    initWordGameControls();
    initLogout();
  });
} else if (path.includes('profile.html')) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    await loadProfile();
    await loadLeaderboard();
    initLogout();
  });
} else if (path.includes('alphabet.html')) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }
    const { loadAlphabet, getAlphabet } = await import('./data-loader.js');
    const { escapeHtml } = await import('./ui-helpers.js');
    await loadAlphabet();
    const grid = document.getElementById('alphabet-grid');
    if (grid) {
      const data = getAlphabet();
      if (!data.length) {
        grid.innerHTML = '<p class="placeholder">Не удалось загрузить алфавит. Проверьте лист "Alphabet".</p>';
      } else {
        let html = '';
        data.forEach(item => {
          html += `
            <div class="alphabet-card">
              <div class="alphabet-letter">${escapeHtml(item.letter)}</div>
              <div class="alphabet-name">${escapeHtml(item.name)}</div>
            </div>
          `;
        });
        grid.innerHTML = html;
      }
    }
    initLogout();
  });
} else {
  // === СТРАНИЦА index.html (корень) ===
  console.log('index.html: инициализация');

  function initIndexPage() {
    // Переключение вкладок
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        const formId = tab.dataset.tab + '-form';
        const form = document.getElementById(formId);
        if (form) form.classList.add('active');
      });
    });

    // Вход
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        try {
          await auth.signInWithEmailAndPassword(email, password);
          window.location.href = 'game.html';
        } catch (err) {
          errorDiv.textContent = 'Ошибка: ' + err.message;
        }
      });
    }

    // Регистрация
    const registerForm = document.getElementById('register-form');
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
            name,
            email,
            totalScore: 0,
            totalCorrect: 0,
            gamesPlayed: 0,
            learnedWords: [],
            rusArmStats: { score: 0, correct: 0, games: 0 },
            armRusStats: { score: 0, correct: 0, games: 0 }
          });
          window.location.href = 'game.html';
        } catch (err) {
          errorDiv.textContent = 'Ошибка: ' + err.message;
        }
      });
    }
  }

  // Запуск инициализации
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIndexPage);
  } else {
    initIndexPage();
  }
}