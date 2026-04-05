import { collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase.js";

export async function seedDatabase() {
  const docsSnapshot = await getDocs(collection(db, "documents"));
  if (!docsSnapshot.empty) {
    console.log("Documents already seeded.");
  } else {
    const documents = [
      { name: "Convention_Schedule_V2.pdf", uploadDate: "Oct 24, 2026", size: "2.4 MB", status: "Approved" },
      { name: "Delegate_Manifest_Final.docx", uploadDate: "Oct 22, 2026", size: "1.1 MB", status: "Draft" },
      { name: "Financial_Report_Q3.xlsx", uploadDate: "Oct 20, 2026", size: "4.8 MB", status: "Reviewing" }
    ];
    for (const doc of documents) {
      await addDoc(collection(db, "documents"), doc);
    }
  }

  const accsSnapshot = await getDocs(collection(db, "accounts"));
  if (accsSnapshot.empty) {
    const accounts = [
      { name: "Admin User", email: "admin@test.com", org: "SMRC Setup", date: "Oct 24, 2026", role: "Administrator", initials: "AU" },
      { name: "Jane Doe", email: "jane.doe@hospital.org", org: "Central City Hospital", date: "Oct 12, 2026", role: "Delegate", initials: "JD" },
      { name: "Dr. Sarah Jenkins", email: "s.jenkins@medresearch.edu", org: "State Medical University", date: "Oct 05, 2026", role: "Speaker", initials: "SJ" },
      { name: "Michael Klein", email: "mklein@smrc.org", org: "SMRC Core Team", date: "Sep 28, 2026", role: "Staff", initials: "MK" }
    ];
    for (const acc of accounts) {
      await addDoc(collection(db, "accounts"), acc);
    }
  }


  console.log("Seeding database with initial data...");

  const eventsSnapshot = await getDocs(collection(db, "schedule_events"));
  if (eventsSnapshot.empty) {
    const scheduleEvents = [
      { time: "08:00 AM", endTime: "09:30 AM", title: "Opening Ceremony & Keynote", status: "Finished", speaker: "Dr. Sarah Jenkins", location: "Main Function Hall A", date: "2026-10-24" },
      { time: "10:00 AM", endTime: "10:45 AM", title: "Advances in Medical Technology", status: "Ongoing", speaker: "Prof. Alistair Webb", location: "Conference Room B", date: "2026-10-24" },
      { time: "11:00 AM", endTime: "12:00 PM", title: "Panel Discussion: Future of SMRC", status: "Upcoming", speaker: "Multiple Speakers", location: "Auditorium C", date: "2026-10-24" },
      { time: "01:00 PM", endTime: "03:00 PM", title: "Interactive Workshop: New Protocols", status: "Upcoming", speaker: "Dr. Emily Chen", location: "Workshop Room 1", date: "2026-10-24" },
      { time: "09:00 AM", endTime: "10:30 AM", title: "Day 2 Kickoff", status: "Upcoming", speaker: "Dr. Alex Rivera", location: "Hall D", date: "2026-10-25" }
    ];
    for (const evt of scheduleEvents) {
      await addDoc(collection(db, "schedule_events"), evt);
    }
  }

  console.log("Database seeded successfully!");
}
