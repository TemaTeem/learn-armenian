// ===== Навигация и выход =====
import { auth } from './firebase-init.js';

export function initLogout() {
  const btn = document.getElementById('logout-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      auth.signOut();
      window.location.href = 'index.html';
    });
  }
  // Также для кнопки выхода на странице профиля (если есть)
  const logoutProfile = document.getElementById('logout-btn-profile');
  if (logoutProfile) {
    logoutProfile.addEventListener('click', () => {
      auth.signOut();
      window.location.href = 'index.html';
    });
  }
}