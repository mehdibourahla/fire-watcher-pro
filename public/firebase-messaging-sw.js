/* global importScripts, firebase */
/* Public Firebase web config — must match src/lib/push.ts. */
const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyA2claby2DpwxxJ4JKZ6TeJSQXAOnpSyCY",
  authDomain: "nadhir-dz.firebaseapp.com",
  projectId: "nadhir-dz",
  messagingSenderId: "1038175256338",
  appId: "1:1038175256338:web:39579a97bd7e255211bdcb",
};

if (FIREBASE_WEB_CONFIG.apiKey) {
  importScripts(
    "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js",
  );
  importScripts(
    "https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js",
  );
  firebase.initializeApp(FIREBASE_WEB_CONFIG);
  // notification payloads render automatically; this keeps the deep link on click
  firebase.messaging();
}
