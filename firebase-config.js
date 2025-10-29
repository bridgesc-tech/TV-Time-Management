// Firebase Configuration
// You'll need to create a free Firebase project and get these values
// Instructions: https://firebase.google.com/docs/web/setup

// IMPORTANT: Firebase requires HTTP/HTTPS - cannot run from file://
// Use the run-local-server.bat file to start a local server

const firebaseConfig = {
    apiKey: "AIzaSyDK15y-JQrDozJ3aXxFC1XSVuniRjcUL1E",
    authDomain: "tv-time-management.firebaseapp.com",
    projectId: "tv-time-management",
    storageBucket: "tv-time-management.firebasestorage.app",
    messagingSenderId: "836553253045",
    appId: "1:836553253045:web:e93f536adf7afbbced5efc"
};

// Initialize Firebase (only if Firebase scripts are loaded)
// Using compat mode - no import statements needed
let db = null;

function initializeFirebaseIfReady() {
    if (typeof firebase !== 'undefined' && window.location.protocol !== 'file:') {
        try {
            console.log('Initializing Firebase...');
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            console.log('Firebase initialized successfully, db:', db);
            // Dispatch event so main app knows Firebase is ready
            window.dispatchEvent(new CustomEvent('firebaseReady'));
        } catch (error) {
            console.error('Firebase initialization error:', error);
        }
    } else {
        if (window.location.protocol === 'file:') {
            console.log('Running from file:// - Firebase disabled');
        } else {
            // If scripts aren't loaded yet, wait a bit
            if (typeof firebase === 'undefined') {
                setTimeout(initializeFirebaseIfReady, 100);
            }
        }
    }
}

// Try to initialize immediately, or wait for scripts
if (typeof firebase !== 'undefined' && window.location.protocol !== 'file:') {
    initializeFirebaseIfReady();
} else if (window.location.protocol !== 'file:') {
    // Scripts may still be loading, wait a bit
    setTimeout(initializeFirebaseIfReady, 200);
} else {
    console.log('Running from file:// - Firebase disabled');
}
