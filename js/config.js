// ===== Константы и настройки =====
export const WEIGHT_SETTINGS = {
  DEFAULT_WEIGHT: 1.0,
  CORRECT_DECREASE: 0.3,
  WRONG_INCREASE: 0.5,
  MIN_WEIGHT: 0.1,
  MAX_WEIGHT: 3.0,
  RESET_AFTER_GAMES: 5,
};

export const QUESTIONS_PER_GAME = 10;
export const ALPHABET_POINTS = { correct: 5, wrong: 1 };

export const SHEET_URL_BASE =
  'https://script.google.com/macros/s/AKfycby29REM7ykGovhBuNb755KGIwR6Swi_vdH9oPE1oVV2MO74azqtf74UpkTitYbZKoAM/exec';

// SVG-иконки (используются в карточках режимов)
  // трелка РУ АРМ
export const SVG_RUS_ARM = `<svg width="40" height="24" viewBox="0 0 40 24"><use href="#icon-rus-arm"/></svg>`;
  // Стрелка АРМ РУ
export const SVG_ARM_RUS = `<svg width="40" height="24" viewBox="0 0 40 24"><use href="#icon-arm-rus"/></svg>`;
  // Символ алфавита
export const SVG_ALPHABET = `<svg width="40" height="40" viewBox="0 0 40 40"><use href="#icon-alphabet"/></svg>`;
// SVG для раздела "Слова" (книга с буквами Ա и Բ)
// export const SVG_WORDS = `
//   <svg viewBox="0 0 40 40" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
//     <rect x="6" y="6" width="28" height="28" rx="4" fill="#667eea" opacity="0.1"/>
//     <path d="M10 10 L20 10 L20 30 L10 30 Z" fill="none" stroke="#667eea" stroke-width="1.5"/>
//     <path d="M20 10 L30 10 L30 30 L20 30 Z" fill="none" stroke="#667eea" stroke-width="1.5"/>
//     <line x1="20" y1="10" x2="20" y2="30" stroke="#667eea" stroke-width="2"/>
//     <text x="15" y="24" font-family="Arial" font-size="12" fill="#667eea" text-anchor="middle" font-weight="bold">Ա</text>
//     <text x="25" y="24" font-family="Arial" font-size="12" fill="#667eea" text-anchor="middle" font-weight="bold">Բ</text>
//   </svg>
// `;