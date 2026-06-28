import { SHEET_URL_BASE } from './config.js';
import { parseCSVLine } from './ui-helpers.js';

let wordsDatabase = [];
let alphabetData = [];

export function getWords() {
  return wordsDatabase;
}

export function getAlphabet() {
  return alphabetData;
}

// Вспомогательная функция загрузки листа
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

// Парсер слов
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

// Парсер алфавита
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

export async function loadWords() {
  wordsDatabase = await loadSheetData('Words', parseWordsCSV);
}

export async function loadAlphabet() {
  alphabetData = await loadSheetData('Alphabet', parseAlphabetCSV);
}