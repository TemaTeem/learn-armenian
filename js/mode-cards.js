// ===== Единственный источник разметки карточек режимов =====
console.log('mode-cards.js загружен');
import { SVG_RUS_ARM, SVG_ARM_RUS, SVG_ALPHABET } from './config.js';

export function getMainMenuHTML() {
  return `
    <h2>Выберите режим тренировки</h2>
    <div class="mode-cards">
      <div class="mode-card" data-mode="WORDS">
        <div class="mode-icon"> 📚 </div>
        <h3>Слова</h3>
      </div>
     
     <div class="mode-card" data-mode="SENTENCES">
        <div class="mode-icon">📝</div>
        <h3>Предложения</h3>
        <p>Скоро появится</p>
      </div>

      <div class="mode-card" data-mode="ALPHABET">
        <div class="mode-icon">${SVG_ALPHABET}</div>
        <h3>Тренировка алфавита</h3>
      </div>
    </div>
  `;
}

export function getWordsSubmenuHTML() {
  return `
    <h2>Выберите направление</h2>
    <div class="mode-cards">
      <div class="mode-card" data-mode="RUS_ARM">
        <div class="mode-icon">${SVG_RUS_ARM}</div>
        <h3>Русский → Армянский</h3>
        <p>Вам показывают русское слово, нужно выбрать армянский перевод</p>
      </div>
      <div class="mode-card" data-mode="ARM_RUS">
        <div class="mode-icon">${SVG_ARM_RUS}</div>
        <h3>Армянский → Русский</h3>
        <p>Вам показывают армянское слово, нужно выбрать русский перевод</p>
      </div>
    </div>
    <button id="back-to-main-menu" class="back-btn">← Назад</button>
  `;
}


 // <div class="mode-card" data-mode="RUS_ARM">
 //        <div class="mode-icon">${SVG_RUS_ARM}</div>
 //        <h3>Русский → Армянский</h3>
        
 //        <button class="mode-btn">Выбрать</button>
 //      </div>
 //      <div class="mode-card" data-mode="ARM_RUS">
 //        <div class="mode-icon">${SVG_ARM_RUS}</div>
 //        <h3>Армянский → Русский</h3>
        
 //        <button class="mode-btn">Выбрать</button>
 //      </div>