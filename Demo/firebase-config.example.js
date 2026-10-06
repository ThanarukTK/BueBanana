/**
 * OPTIONAL Firebase config for the demo's realtime sync backend.
 *
 * The demo works with no config at all: `Demo/sync.js` then talks to the *local* Firebase
 * emulator suite (`firebase emulators:start --project demo-nfc-cafe`), which keeps all data on
 * your machine — the cheapest way to honour the `rule.md` PDPA rule that tests and development
 * use synthetic or anonymised data only.
 *
 * TO USE A REAL (DEMO-ONLY) FIREBASE PROJECT
 *   1. cp Demo/firebase-config.example.js Demo/firebase-config.js   # firebase-config.js is gitignored
 *   2. Fill in the web app config from Firebase console → Project settings → Your apps.
 *   3. Enable Authentication → Sign-in method → Anonymous.
 *   4. Deploy the rules:  firebase deploy --only firestore:rules
 *   5. Set `useEmulator: false` below.
 *
 * NOTES
 *  - These values are public by design (a Firebase web config is not a secret), but this repo
 *    keeps them out of git anyway, so the demo never ships someone's project id by accident
 *    (`AGENTS.md` §5: no secrets in the repo).
 *  - Never put a service-account key or an Admin SDK credential here. A browser bundle cannot
 *    keep a secret, and the demo only ever needs anonymous access.
 *  - Use a throwaway project: the demo writes synthetic check-in/billing data and must never
 *    point at anything holding real customer data (PDPA: data minimisation, purpose limitation).
 */
export default {
  apiKey: 'YOUR_WEB_API_KEY',
  authDomain: 'your-demo-project.firebaseapp.com',
  projectId: 'your-demo-project',
  storageBucket: 'your-demo-project.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000',
  // Leave true to keep using the local emulator even though a project is configured.
  useEmulator: false,
};
