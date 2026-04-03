import { db } from './firebase.js';
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";

export async function seedDatabase() {
  try {
    const q = query(collection(db, "stats"));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("Seeding initial stats...");
      await addDoc(collection(db, "stats"), {
        delegates: 1250,
        activeSessions: 8,
        pendingApprovals: 24,
        docsProcessed: 450
      });
    }
  } catch (e) {
    console.warn("Seeding failed", e);
  }
}

export async function ensureAdminExists() {
  try {
    const q = query(collection(db, "accounts"), where("email", "==", "admin@test.com"));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("Creating default admin account...");
      await addDoc(collection(db, "accounts"), { 
        name: "Admin User", 
        email: "admin@test.com", 
        org: "Admin Setup", 
        date: new Date().toLocaleDateString(), 
        role: "Administrator", 
        initials: "AU" 
      });
    }
  } catch (e) {
    console.warn("Could not ensure admin exists", e);
  }
}

// To run this, you can temporarily import it in main.js
// or run it from the console if you expose it.
// window.runSeed = () => { seedDatabase(); ensureAdminExists(); };
