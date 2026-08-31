/* global importScripts, firebase */
/* Public Firebase web config — must match src/lib/push.ts. Empty until the
 * owner registers the web app; the worker stays inert until filled. */
const FIREBASE_WEB_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  messagingSenderId: "",
  appId: "",
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
