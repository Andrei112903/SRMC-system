import './style.css';
import { db, auth } from './firebase.js';
import { seedDatabase } from './seed.js';
import { collection, getDocs, query, where, addDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

// Force clean legacy Service Workers to break faulty MPA caching
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister().then(() => {
         console.log("Service Worker forcefully unregistered to clear routing cache.");
      });
    }
  });
}

// Seed database on load (runs once if empty)
seedDatabase();

async function ensureAdminExists() {
  try {
    const q = query(collection(db, "accounts"), where("email", "==", "admin@test.com"));
    const snap = await getDocs(q);
    if (snap.empty) {
      await addDoc(collection(db, "accounts"), { name: "Admin User", email: "admin@test.com", org: "Admin Setup", date: new Date().toLocaleDateString(), role: "Administrator", initials: "AU" });
    }
  } catch (e) {
    console.warn("Could not ensure admin exists", e);
  }
}
ensureAdminExists();

console.log("Firebase loaded:", db ? "Yes" : "No");

document.addEventListener('DOMContentLoaded', () => {
  const viewLogin = document.getElementById('view-login');
  const appDashboard = document.getElementById('app-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const logoutBtn = document.getElementById('logout-btn');

  // Handle Auth State
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("User logged in:", user.email);
      if (viewLogin) viewLogin.classList.add('hidden');
      
      // INSTANT MPA REDIRECT: If on login page, blast them to index.html immediately!
      if (window.location.pathname.includes('login.html')) {
          window.location.replace('index.html');
          return; // Stop evaluating dashboard data
      }

      if (appDashboard) {
        appDashboard.classList.remove('hidden');
        appDashboard.classList.add('flex');
      }

      try {
        // Fetch user role for RBAC
        const q = query(collection(db, "accounts"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        
        let userRole = 'User';
        let userName = user.email.split('@')[0];
        
        if (!querySnapshot.empty) {
          const accountData = querySnapshot.docs[0].data();
          userRole = accountData.role;
          userName = accountData.name;
        }

        // Update Sidebar
        const sidebarName = document.getElementById('sidebar-user-name');
        const sidebarRole = document.getElementById('sidebar-user-role');
        if(sidebarName) sidebarName.innerText = userName;
        if(sidebarRole) sidebarRole.innerText = userRole;

        // Handle RBAC View Permissions
        const accountsTabDesktop = document.getElementById('nav-accounts-tab');
        const accountsTabMobile = document.getElementById('mobile-nav-accounts');
        
        if (userRole === 'Administrator' || userRole === 'Staff') {
          if(accountsTabDesktop) accountsTabDesktop.classList.remove('hidden');
          if(accountsTabDesktop) accountsTabDesktop.classList.add('flex');
          if(accountsTabMobile) accountsTabMobile.classList.remove('hidden');
          if(accountsTabMobile) accountsTabMobile.classList.add('flex');
        } else {
          if(accountsTabDesktop) { accountsTabDesktop.classList.add('hidden'); accountsTabDesktop.classList.remove('flex'); }
          if(accountsTabMobile) { accountsTabMobile.classList.add('hidden'); accountsTabMobile.classList.remove('flex'); }
        }
      } catch (e) {
         console.warn("RBAC processing bypassed", e);
      }
      
      // Load Initial Dashboard View
      initializeRoute();
      loadDocuments();
      loadStats();
      loadSchedule();
      
    } else {
      console.log("No user logged in.");
      if (viewLogin) viewLogin.classList.remove('hidden');
      if (appDashboard) {
        appDashboard.classList.add('hidden');
        appDashboard.classList.remove('flex');
      }
      
      // If we are on ANY dashboard page, redirect to login
      if (!window.location.pathname.includes('login.html')) {
          window.location.replace('login.html');
      }
    }
  });

  // Handle Login Form
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.innerText = "Signing in...";
      if(loginError) loginError.classList.add('hidden');

      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (error) {
        console.error("Login failed:", error);
        if(loginError) {
          loginError.innerText = "Invalid credentials. Please try again.";
          loginError.classList.remove('hidden');
        }
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerText = "Sign In";
      }
    });
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await signOut(auth);
      // Let onAuthStateChanged handle UI reload
      window.location.reload(); 
    });
  }

  const navLinks = document.querySelectorAll('.nav-link');
  const viewSections = document.querySelectorAll('.view-section');

  function switchView(target) {
    if (!target) return;
    
    // Toggle Views (Safely if they exist)
    viewSections.forEach(section => {
      if (section.id === `view-${target}`) {
        section.classList.remove('hidden');
        section.classList.add('block');
      } else {
        section.classList.add('hidden');
        section.classList.remove('block');
      }
    });

    // Update active states on Links
    navLinks.forEach(link => {
      const isDesktop = link.closest('aside') !== null;
      const targetHref = link.getAttribute('href');
      if (!targetHref) return;
      
      const isActive = targetHref.includes(target) || (target === 'home' && targetHref.includes('index.html'));

      if (isDesktop) {
        if (isActive) {
          link.classList.add('bg-primary-900', 'text-white');
          link.classList.remove('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');
        } else {
          link.classList.add('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');
          link.classList.remove('bg-primary-900', 'text-white');
        }
      } else {
        if (isActive) {
          link.classList.add('text-primary-600');
          link.classList.remove('text-slate-400', 'hover:text-primary-500');
        } else {
          link.classList.add('text-slate-400', 'hover:text-primary-500');
          link.classList.remove('text-primary-600');
        }
      }
    });
  }

  // MPA Route Handling
  function initializeRoute() {
    const pathStr = window.location.pathname.replace(/^\/+/, '').split('/')[0] || 'index.html';
    
    let targetView = 'home';
    if (pathStr.includes('documents')) targetView = 'documents';
    if (pathStr.includes('schedule')) targetView = 'schedule';
    if (pathStr.includes('accounts')) targetView = 'accounts';
    if (pathStr.includes('login')) targetView = 'login';
    
    switchView(targetView);
  }

  // Native HTML <a> tags will now handle all routing natively. No Javascript click interception is required for MPA

  // File Upload Logic
  const uploadBtn = document.getElementById('upload-document-btn');
  const uploadInput = document.getElementById('upload-document-input');

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click', () => {
      uploadInput.click();
    });

    uploadInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="animate-pulse">Uploading...</span>';
        
        try {
          for (const file of files) {
            // Determine size format
            const sizeInMB = file.size / (1024 * 1024);
            const sizeStr = sizeInMB > 1 ? `${sizeInMB.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
            
            // Format today's date
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            await addDoc(collection(db, "documents"), {
              name: file.name,
              uploadDate: today,
              size: sizeStr,
              status: "Reviewing" // Default status
            });
          }
          
          alert(`Successfully uploaded ${files.length} document(s)!`);
          loadDocuments(); // Refresh the documents table dynamically
        } catch (error) {
          console.error("Error uploading documents: ", error);
          alert("Failed to upload documents. Please try again.");
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
            Upload Document
          `;
          uploadInput.value = ''; // Reset input to allow selecting the same file again
        }
      }
    });
  }

  // Fetch and Render Documents from Firebase
  async function loadDocuments() {
    const listEl = document.getElementById('documents-list');
    if (!listEl) return;

    listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">Loading documents...</td></tr>`;

    try {
      const querySnapshot = await getDocs(collection(db, "documents"));
      listEl.innerHTML = ''; // clear loading state
      
      if (querySnapshot.empty) {
        listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No documents found.</td></tr>`;
        const countInfo = document.getElementById('documents-count-info');
        if (countInfo) countInfo.innerHTML = `No results found`;
        return;
      }

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        let iconColor = 'text-slate-500';
        if (data.name.endsWith('.pdf')) iconColor = 'text-red-500';
        else if (data.name.endsWith('.docx')) iconColor = 'text-blue-500';
        else if (data.name.endsWith('.xlsx')) iconColor = 'text-emerald-500';

        let statusClass = 'bg-slate-100 text-slate-800 border-slate-200';
        if (data.status === 'Approved') statusClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
        else if (data.status === 'Draft') statusClass = 'bg-slate-100 text-slate-800 border-slate-200';
        else if (data.status === 'Reviewing') statusClass = 'bg-amber-100 text-amber-800 border-amber-200';

        listEl.innerHTML += `
          <tr class="bg-white hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4 font-medium text-slate-900 whitespace-nowrap flex items-center gap-3">
              <svg class="w-6 h-6 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
              ${data.name}
            </td>
            <td class="px-6 py-4">${data.uploadDate}</td>
            <td class="px-6 py-4">${data.size}</td>
            <td class="px-6 py-4">
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                ${data.status}
              </span>
            </td>
            <td class="px-6 py-4 text-right">
              <button class="text-primary-600 hover:text-primary-900 font-medium">Download</button>
            </td>
          </tr>
        `;
      });

      const countInfo = document.getElementById('documents-count-info');
      if (countInfo) {
        const count = querySnapshot.size;
        countInfo.innerHTML = `Showing <span class="font-medium text-slate-900">1</span> to <span class="font-medium text-slate-900">${count}</span> of <span class="font-medium text-slate-900">${count}</span> results`;
      }
    } catch (e) {
      console.error("Error fetching documents: ", e);
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Failed to load documents.</td></tr>`;
    }
  }

  // Fetch and Render Dashboard Stats from Firebase
  async function loadStats() {
    try {
      const querySnapshot = await getDocs(collection(db, "stats"));
      if (!querySnapshot.empty) {
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          let elementId = null;
          
          if (data.title === "Delegates") elementId = "stat-delegates";
          else if (data.title === "Sessions") elementId = "stat-sessions";
          else if (data.title === "Pending") elementId = "stat-approvals";
          else if (data.title === "Processed") elementId = "stat-documents";

          if (elementId) {
            const el = document.getElementById(elementId);
            if (el) {
              // format number with commas
              el.innerText = data.value.toLocaleString();
            }
          }
        });
      }
    } catch (e) {
      console.error("Error fetching stats: ", e);
    }
  }

  // Add Session Modal Logic
  const openSessionModalBtn = document.getElementById('btn-open-session-modal');
  const sessionModal = document.getElementById('modal-add-session');
  const closeSessionModalBtn = document.getElementById('btn-close-session-modal');
  const cancelSessionBtn = document.getElementById('btn-cancel-session');
  const formAddSession = document.getElementById('form-add-session');
  const sessionError = document.getElementById('session-error');
  const submitSessionBtn = document.getElementById('btn-submit-session');

  function closeSessionModal() {
    if (sessionModal) {
      sessionModal.classList.add('hidden');
      formAddSession.reset();
      sessionError.classList.add('hidden');
    }
  }

  if (openSessionModalBtn && sessionModal) {
    openSessionModalBtn.addEventListener('click', () => {
      sessionModal.classList.remove('hidden');
    });

    closeSessionModalBtn.addEventListener('click', closeSessionModal);
    cancelSessionBtn.addEventListener('click', closeSessionModal);

    formAddSession.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const title = document.getElementById('session-title').value;
      const speaker = document.getElementById('session-speaker').value;
      const date = document.getElementById('session-date').value;
      const status = document.getElementById('session-status').value;
      const time = document.getElementById('session-start').value;
      const endTime = document.getElementById('session-end').value;
      const location = document.getElementById('session-location').value;

      submitSessionBtn.disabled = true;
      submitSessionBtn.innerText = 'Saving...';
      sessionError.classList.add('hidden');

      try {
        await addDoc(collection(db, "schedule_events"), {
          title,
          speaker,
          date,
          status,
          time,
          endTime,
          location
        });
        
        closeSessionModal();
        loadSchedule(); // Refresh the schedule dynamically
      } catch (error) {
        console.error("Error adding session:", error);
        sessionError.innerText = "Failed to save session. Please try again.";
        sessionError.classList.remove('hidden');
      } finally {
        submitSessionBtn.disabled = false;
        submitSessionBtn.innerText = 'Save Session';
      }
    });
  }

  // Fetch and Render Schedule from Firebase
  async function loadSchedule() {
    const tabsContainer = document.getElementById('schedule-tabs-container');
    const contentContainer = document.getElementById('schedule-content-container');
    if (!tabsContainer || !contentContainer) return;

    try {
      const querySnapshot = await getDocs(collection(db, "schedule_events"));
      
      if (querySnapshot.empty) {
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No sessions found.</div>';
        return;
      }

      // Group events by date
      const eventsByDate = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!eventsByDate[data.date]) {
          eventsByDate[data.date] = [];
        }
        eventsByDate[data.date].push(data);
      });

      // Sort dates
      const sortedDates = Object.keys(eventsByDate).sort();

      // Build tabs and containers
      tabsContainer.innerHTML = '';
      contentContainer.innerHTML = '';

      sortedDates.forEach((dateStr, index) => {
        // Create tab
        const dObj = new Date(dateStr);
        // Adjust for timezone offset to prevent off-by-one date rendering
        const adjustedDate = new Date(dObj.getTime() + Math.abs(dObj.getTimezoneOffset() * 60000));
        const dayName = adjustedDate.toLocaleDateString('en-US', { weekday: 'short' });
        const monthDay = adjustedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const tabBtn = document.createElement('button');
        tabBtn.className = index === 0 
          ? "day-tab border-blue-600 text-blue-600 whitespace-nowrap py-4 px-2 border-b-2 font-medium text-sm sm:text-base transition-colors flex-1 sm:flex-none text-center"
          : "day-tab border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 whitespace-nowrap py-4 px-2 border-b-2 font-medium text-sm sm:text-base transition-colors flex-1 sm:flex-none text-center";
        tabBtn.dataset.targetId = `day-${dateStr}`;
        tabBtn.innerHTML = `${dayName} <span class="hidden sm:inline">(${monthDay})</span>`;
        tabsContainer.appendChild(tabBtn);

        // Create container
        const dayContainer = document.createElement('div');
        dayContainer.id = `day-${dateStr}`;
        dayContainer.className = index === 0 ? "day-content block space-y-4" : "day-content hidden space-y-4";

        const events = eventsByDate[dateStr];
        events.forEach(data => {
          let statusClass = '';
          let accentColor = '';
          
          if (data.status === 'Finished') {
            statusClass = 'bg-gray-100 text-gray-800 border-gray-200';
            accentColor = 'bg-slate-300';
          } else if (data.status === 'Ongoing') {
            statusClass = 'bg-green-100 text-green-700 border-green-200';
            accentColor = 'bg-green-500';
          } else {
            statusClass = 'bg-blue-50 text-blue-700 border-blue-200';
            accentColor = 'bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity';
          }

          const statusBadge = data.status === 'Ongoing' 
            ? `<span class="inline-flex self-start sm:self-auto items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">
                 <span class="w-2 h-2 rounded-full bg-green-500 mr-1.5 animate-pulse"></span>
                 Ongoing
               </span>`
            : `<span class="inline-flex self-start sm:self-auto items-center px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">
                 ${data.status}
               </span>`;

          dayContainer.innerHTML += `
            <div class="bg-white border text-left ${data.status === 'Ongoing' ? 'ring-1 ring-green-500/50' : 'border-slate-200'} shadow-sm rounded-xl p-5 flex flex-col md:flex-row gap-4 md:items-start group hover:${data.status === 'Ongoing' ? 'shadow-lg' : 'shadow-md'} transition-shadow relative overflow-hidden">
              <div class="absolute left-0 top-0 bottom-0 w-1 ${accentColor}"></div>
              <div class="md:w-32 flex-shrink-0 mt-1">
                <p class="text-lg font-bold ${data.status === 'Ongoing' ? 'text-green-700' : 'text-slate-900'}">${data.time}</p>
                <p class="text-sm text-slate-500">${data.endTime}</p>
              </div>
              <div class="flex-1">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <h3 class="text-xl font-bold text-slate-900 tracking-tight">${data.title}</h3>
                  ${statusBadge}
                </div>
                <p class="text-slate-600 flex items-center gap-2 mb-3 text-sm sm:text-base">
                  <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                  ${data.speaker}
                </p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                  <div class="flex items-center gap-1.5 cursor-pointer hover:text-blue-600 transition-colors">
                    <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    ${data.location}
                  </div>
                  ${data.status !== 'Finished' ? `
                  <button class="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-medium">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Add to Calendar
                  </button>
                  ` : ''}
                </div>
              </div>
            </div>
          `;
        });
        contentContainer.appendChild(dayContainer);
      });

      // Bind Tab clicking functionality
      const allTabs = tabsContainer.querySelectorAll('.day-tab');
      const allContents = contentContainer.querySelectorAll('.day-content');

      allTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const targetId = tab.dataset.targetId;
          
          allTabs.forEach(t => {
            if (t === tab) {
              t.classList.add('border-blue-600', 'text-blue-600');
              t.classList.remove('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300');
            } else {
              t.classList.remove('border-blue-600', 'text-blue-600');
              t.classList.add('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300');
            }
          });

          allContents.forEach(content => {
            if (content.id === targetId) {
              content.classList.remove('hidden');
              content.classList.add('block');
            } else {
              content.classList.add('hidden');
              content.classList.remove('block');
            }
          });
        });
      });

    } catch (e) {
      console.error("Error fetching schedule: ", e);
      contentContainer.innerHTML = '<div class="text-center py-8 text-red-500">Failed to load schedule.</div>';
    }
  }

});
