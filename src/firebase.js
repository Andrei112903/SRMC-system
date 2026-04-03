import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB301C3CRgSe4E8OJBI-KPkmJ9wngEkqjI",
  authDomain: "srmc-cd099.firebaseapp.com",
  projectId: "srmc-cd099",
  storageBucket: "srmc-cd099.firebasestorage.app",
  messagingSenderId: "81018684769",
  appId: "1:81018684769:web:40bd0425646acd076f3120",
  measurementId: "G-VTZ69WCEB6"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Secondary app used ONLY for creating new users without signing out the current admin.
// getApps() guards against double-initialization (e.g. HMR in Vite dev mode).
const secondaryAppName = 'auth-secondary';
const secondaryApp = getApps().find(a => a.name === secondaryAppName)
  ?? initializeApp(firebaseConfig, secondaryAppName);
export const authSecondary = getAuth(secondaryApp);
