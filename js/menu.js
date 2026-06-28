import { getMainMenuHTML, getWordsSubmenuHTML } from './mode-cards.js';
import { startAlphabetMode } from './game-alphabet.js';
import { startWordMode } from './game-words.js';

export function renderMainMenu() {
  const container = document.getElementById('mode-selection');
  if (container) {
    container.innerHTML = getMainMenuHTML();
    container.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        if (mode === 'ALPHABET') {
          startAlphabetMode();
        } else if (mode === 'WORDS') {
          renderWordsSubmenu();
        } else if (mode === 'SENTENCES') {
          alert('Раздел "Предложения" в разработке!');
        }
      });
    });
  } else {
    console.error('Контейнер #mode-selection не найден!');
  }
}

export function renderWordsSubmenu() {
  const container = document.getElementById('mode-selection');
  if (container) {
    container.innerHTML = getWordsSubmenuHTML();
    container.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.mode;
        startWordMode(mode);
      });
    });
    const backBtn = document.getElementById('back-to-main-menu');
    if (backBtn) {
      backBtn.addEventListener('click', renderMainMenu);
    }
  }
}