import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
    getDatabase,
    ref,
    get,
    set,
    onValue,
    push,
    remove,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCto4mDkE1M40yPoeXO-s-VabQ2s_HIuYU",
    authDomain: "ffxiv-mh-bingo.firebaseapp.com",
    databaseURL: "https://ffxiv-mh-bingo-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ffxiv-mh-bingo",
    storageBucket: "ffxiv-mh-bingo.firebasestorage.app",
    messagingSenderId: "260112953760",
    appId: "1:260112953760:web:67c35cb9e295fca5e574c5",
    measurementId: "G-H4F7ZVP5FD"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

window.FirebaseApp = app;
window.FirebaseDb = db;
window.FirebaseAuth = auth;

window.FirebaseDbApi = {
    ref,
    get,
    set,
    onValue,
    push,
    remove,
    runTransaction
};

window.FirebaseAdmin = {
    uid: "T9XOzzfNS3UKr6rzoGMn4PuYiGn1"
};

window.FirebaseAuthApi = {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
};