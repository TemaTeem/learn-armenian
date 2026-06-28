// ===== Страница профиля и лидерборд =====
import { auth, db } from './firebase-init.js';
import { escapeHtml } from './ui-helpers.js';

export async function loadProfile() {
  const user = auth.currentUser;
  if (!user) return;
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
}

export async function loadLeaderboard() {
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