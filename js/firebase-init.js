// js/firebase-init.js
const firebaseConfig = {
  apiKey: "AIzaSyDShCzZja-zwwI3hlqY3_XS_4JP1s-cXcw",
  authDomain: "learnam-f5c99.firebaseapp.com",
  projectId: "learnam-f5c99",
  storageBucket: "learnam-f5c99.firebasestorage.app",
  messagingSenderId: "62297810080",
  appId: "1:62297810080:web:1ffc50c5a38d2c907a95c5"
};

// Инициализируем Firebase, если ещё не инициализирован (защита от повторного вызова)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();