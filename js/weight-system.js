import { db } from './firebase-init.js';
import { getWords } from './data-loader.js';
import { WEIGHT_SETTINGS } from './config.js';
import { shuffleArray } from './ui-helpers.js';

let wordsWeights = { RUS_ARM: {}, ARM_RUS: {} };
let gamesSinceReset = { RUS_ARM: 0, ARM_RUS: 0 };

function initWeights(mode) {
  wordsWeights[mode] = {};
  getWords().forEach(word => {
    const key = mode === 'RUS_ARM' ? word.russian : word.armenian;
    wordsWeights[mode][key] = WEIGHT_SETTINGS.DEFAULT_WEIGHT;
  });
}

export async function loadWeights(userId, mode) {
  try {
    const doc = await db.collection('wordWeights').doc(userId).get();
    if (doc.exists) {
      const data = doc.data();
      wordsWeights[mode] = data[mode] || {};
      gamesSinceReset[mode] = data.gamesSinceReset?.[mode] || 0;
    } else {
      initWeights(mode);
    }
  } catch (e) {
    console.error('Ошибка весов:', e);
    initWeights(mode);
  }
}

export async function saveWeights(userId) {
  if (!userId) return;
  try {
    await db.collection('wordWeights').doc(userId).set({
      RUS_ARM: wordsWeights.RUS_ARM || {},
      ARM_RUS: wordsWeights.ARM_RUS || {},
      gamesSinceReset,
      lastUpdated: new Date(),
    });
  } catch (e) {
    console.error('Ошибка сохранения весов:', e);
  }
}

export function selectWordsWithWeights(mode, count) {
  const words = getWords();
  if (!words.length) return [];
  const pool = [];
  words.forEach(word => {
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
    const rest = words.filter(w => !used.has(mode === 'RUS_ARM' ? w.russian : w.armenian));
    selected.push(...shuffleArray([...rest]).slice(0, count - selected.length));
  }
  return selected;
}

export async function updateWeight(wordKey, isCorrect, userId, mode) {
  if (!wordsWeights[mode]) wordsWeights[mode] = {};
  const current = wordsWeights[mode][wordKey] || WEIGHT_SETTINGS.DEFAULT_WEIGHT;
  let newWeight = isCorrect
    ? current - WEIGHT_SETTINGS.CORRECT_DECREASE
    : current + WEIGHT_SETTINGS.WRONG_INCREASE;
  newWeight = Math.max(WEIGHT_SETTINGS.MIN_WEIGHT, Math.min(WEIGHT_SETTINGS.MAX_WEIGHT, newWeight));
  wordsWeights[mode][wordKey] = newWeight;
  if (userId) await saveWeights(userId);
}