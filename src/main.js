import './style.css';
import { db, auth, authSecondary } from './firebase.js';
import { seedDatabase } from './seed.js';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "firebase/auth";

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
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if(sidebarName) sidebarName.innerText = userName;
        if(sidebarRole) sidebarRole.innerText = userRole;
        if(sidebarAvatar) {
          const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
          sidebarAvatar.innerText = initials;
        }

        // Handle RBAC View Permissions
        const accountsTabDesktop = document.getElementById('nav-accounts-tab');
        const accountsTabMobile = document.getElementById('mobile-nav-accounts');
        
        // Accounts tab is now visible to all users
        if(accountsTabDesktop) {
          accountsTabDesktop.classList.remove('hidden');
          accountsTabDesktop.classList.add('flex');
        }
        if(accountsTabMobile) {
          accountsTabMobile.classList.remove('hidden');
          accountsTabMobile.classList.add('flex');
        }

        // --- INVITE USER RBAC ---
        const inviteBtn = document.getElementById('btn-invite-user');
        if (inviteBtn) {
          if (userRole === 'Administrator' || userRole === 'Staff') {
            inviteBtn.classList.remove('hidden');
          } else {
            inviteBtn.classList.add('hidden');
          }
        }
      } catch (e) {
         console.warn("RBAC processing bypassed", e);
      }
      
      // Load Initial Dashboard View
      initializeRoute();
      loadDocuments();
      loadStats();
      loadSchedule();
      loadAccounts();
      
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

  // Core view switching logic
  function switchView(target) {
    if (!target) target = 'home';
    console.log("[Router] Switching view to:", target);

    const sections = document.querySelectorAll('.view-section');
    const links = document.querySelectorAll('.nav-link');

    if (sections.length === 0) {
      console.warn("[Router] No view sections found in DOM.");
      return;
    }

    let foundView = false;
    sections.forEach(section => {
      // Show matching view, hide others
      if (section.id === `view-${target}`) {
        section.classList.remove('hidden');
        section.classList.add('block');
        foundView = true;
      } else {
        section.classList.add('hidden');
        section.classList.remove('block');
      }
    });

    // Final fallback: if target view not found, force show home view
    if (!foundView && target !== 'home') {
      console.warn(`[Router] View 'view-${target}' missing, falling back to 'home'`);
      return switchView('home');
    }

    // Update Sidebar/Nav Links active states
    links.forEach(link => {
      const isDesktop = link.closest('aside') !== null;
      const href = link.getAttribute('href') || '';
      
      // Smart matching for Home vs Category pages
      const isHome = target === 'home' && (href.includes('index.html') || href === '/' || href === './');
      const isCategory = target !== 'home' && href.toLowerCase().includes(target.toLowerCase());
      const isMatch = isHome || isCategory;

      if (isDesktop) {
        if (isMatch) {
          link.classList.add('bg-primary-900', 'text-white');
          link.classList.remove('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');
        } else {
          link.classList.remove('bg-primary-900', 'text-white');
          link.classList.add('text-slate-300', 'hover:bg-slate-700', 'hover:text-white');
        }
      } else {
        if (isMatch) {
          link.classList.add('text-primary-600');
          link.classList.remove('text-slate-400', 'hover:text-primary-500');
        } else {
          link.classList.remove('text-primary-600');
          link.classList.add('text-slate-400', 'hover:text-primary-500');
        }
      }
    });
  }

  // Intercept Navigation Clicks
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    
    const href = link.getAttribute('href');
    // Only intercept local dashboard links
    if (href && (href.endsWith('.html') || href === '/' || href === 'index.html')) {
      e.preventDefault();
      
      let target = 'home';
      if (href.includes('documents')) target = 'documents';
      else if (href.includes('schedule')) target = 'schedule';
      else if (href.includes('accounts')) target = 'accounts';
      
      history.pushState(null, '', href);
      switchView(target);
    }
  });

  window.addEventListener('popstate', initializeRoute);

  function initializeRoute() {
    const path = window.location.pathname.toLowerCase();
    console.log("[Router] Current pathname:", path);

    let target = 'home';
    if (path.includes('documents')) target = 'documents';
    else if (path.includes('schedule')) target = 'schedule';
    else if (path.includes('accounts')) target = 'accounts';
    else if (path.includes('login')) target = 'login';
    
    switchView(target);
  }

  // Immediate check to fix refresh white-screen
  initializeRoute();

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
        // Stats are stored as a flat object on the first document
        const data = querySnapshot.docs[0].data();
        const delegates = document.getElementById('stat-delegates');
        const sessions = document.getElementById('stat-sessions');
        const approvals = document.getElementById('stat-approvals');
        const docsCount = document.getElementById('stat-documents');
        if (delegates && data.delegates != null) delegates.innerText = Number(data.delegates).toLocaleString();
        if (sessions && data.activeSessions != null) sessions.innerText = Number(data.activeSessions).toLocaleString();
        if (approvals && data.pendingApprovals != null) approvals.innerText = Number(data.pendingApprovals).toLocaleString();
        if (docsCount && data.docsProcessed != null) docsCount.innerText = Number(data.docsProcessed).toLocaleString();
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

  // Invite User Modal Logic
  const inviteModal = document.getElementById('modal-invite-user');
  const closeInviteModalBtn = document.getElementById('btn-close-invite-modal');
  const cancelInviteBtn = document.getElementById('btn-cancel-invite');
  const formInviteUser = document.getElementById('form-invite-user');
  const inviteError = document.getElementById('invite-error');
  const submitInviteBtn = document.getElementById('btn-submit-invite');

  function closeInviteModal() {
    if (inviteModal) {
      inviteModal.classList.add('hidden');
      if (formInviteUser) formInviteUser.reset();
      if (inviteError) inviteError.classList.add('hidden');
    }
  }

  if (inviteModal) {
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btn-invite-user')) {
        inviteModal.classList.remove('hidden');
      }
    });

    if (closeInviteModalBtn) closeInviteModalBtn.addEventListener('click', closeInviteModal);
    if (cancelInviteBtn) cancelInviteBtn.addEventListener('click', closeInviteModal);

    if (formInviteUser) {
      formInviteUser.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name     = document.getElementById('invite-name').value.trim();
        const email    = document.getElementById('invite-email').value.trim();
        const org      = document.getElementById('invite-org').value.trim();
        const role     = document.getElementById('invite-role').value;
        const password = document.getElementById('invite-password').value;

        if (password.length < 6) {
          if (inviteError) {
            inviteError.innerText = 'Password must be at least 6 characters.';
            inviteError.classList.remove('hidden');
          }
          return;
        }

        if (submitInviteBtn) {
          submitInviteBtn.disabled = true;
          submitInviteBtn.innerText = 'Creating account...';
        }
        if (inviteError) inviteError.classList.add('hidden');

        try {
          // Step 1: Create Firebase Auth account using the SECONDARY auth instance
          // so the Admin's current session is NOT displaced.
          const userCredential = await createUserWithEmailAndPassword(authSecondary, email, password);
          const uid = userCredential.user.uid;
          // Sign out from secondary so it stays clean
          await signOut(authSecondary);

          // Step 2: Save profile to Firestore
          const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().substring(0, 2);
          await addDoc(collection(db, 'accounts'), {
            uid,
            name,
            email,
            org,
            role,
            initials,
            date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          });

          closeInviteModal();
          loadAccounts();
          showToast(`✅ ${name} invited successfully!`, 'success');
        } catch (error) {
          console.error('Error creating account:', error);
          let msg = 'Failed to create account. Please try again.';
          if (error.code === 'auth/email-already-in-use') msg = 'This email is already registered.';
          else if (error.code === 'auth/invalid-email')   msg = 'Please enter a valid email address.';
          if (inviteError) {
            inviteError.innerText = msg;
            inviteError.classList.remove('hidden');
          }
        } finally {
          if (submitInviteBtn) {
            submitInviteBtn.disabled = false;
            submitInviteBtn.innerText = 'Invite User';
          }
        }
      });
    }
  }

  // --- Toast Notification System ---
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-emerald-600' : 'bg-red-600';
    toast.className = `fixed bottom-24 md:bottom-6 right-6 z-[200] ${bgColor} text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium animate-fade-in flex items-center gap-2`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // --- Edit Role Modal ---
  const editRoleModal = document.createElement('div');
  editRoleModal.id = 'modal-edit-role';
  editRoleModal.className = 'hidden fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center px-4';
  editRoleModal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <h3 class="text-lg font-bold text-slate-900">Edit Role</h3>
        <button id="btn-close-edit-role" class="text-slate-400 hover:text-slate-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="p-6 space-y-4">
        <p id="edit-role-username" class="text-slate-600 text-sm font-medium"></p>
        <input type="hidden" id="edit-role-docid">
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">New Role</label>
          <select id="edit-role-select" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-slate-900">
            <option value="Delegate">Delegate</option>
            <option value="Speaker">Speaker</option>
            <option value="Staff">Staff</option>
            <option value="Administrator">Administrator</option>
          </select>
        </div>
        <div class="pt-2 flex justify-end gap-3">
          <button id="btn-cancel-edit-role" class="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button id="btn-save-edit-role" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(editRoleModal);

  document.getElementById('btn-close-edit-role').addEventListener('click', () => editRoleModal.classList.add('hidden'));
  document.getElementById('btn-cancel-edit-role').addEventListener('click', () => editRoleModal.classList.add('hidden'));
  document.getElementById('btn-save-edit-role').addEventListener('click', async () => {
    const docId = document.getElementById('edit-role-docid').value;
    const newRole = document.getElementById('edit-role-select').value;
    const saveBtn = document.getElementById('btn-save-edit-role');
    saveBtn.disabled = true;
    saveBtn.innerText = 'Saving...';
    try {
      await updateDoc(doc(db, 'accounts', docId), { role: newRole });
      editRoleModal.classList.add('hidden');
      loadAccounts();
      showToast('Role updated successfully!', 'success');
    } catch(err) {
      console.error('Error updating role:', err);
      showToast('Failed to update role.', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerText = 'Save';
    }
  });

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

      // Group events by date, then sort each day's sessions by start time
      const eventsByDate = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!eventsByDate[data.date]) {
          eventsByDate[data.date] = [];
        }
        eventsByDate[data.date].push(data);
      });

      // Sort each day's events chronologically (08:00 AM < 10:00 AM < 01:00 PM)
      const toMins = t => {
        if (!t) return 0;
        const parts = t.trim().split(' ');
        const period = parts[1];
        const [h, m] = parts[0].split(':').map(Number);
        let hours = h;
        if (period === 'PM' && h !== 12) hours += 12;
        if (period === 'AM' && h === 12) hours = 0;
        return hours * 60 + m;
      };
      Object.keys(eventsByDate).forEach(d => {
        eventsByDate[d].sort((a, b) => toMins(a.time) - toMins(b.time));
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

  // Fetch and Render Accounts from Firebase
  let allAccountsData = []; // cache for search

  async function loadAccounts() {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;

    listEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500"><div class="flex items-center justify-center gap-2"><svg class="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading accounts...</div></td></tr>`;

    try {
      const querySnapshot = await getDocs(collection(db, 'accounts'));
      allAccountsData = [];
      querySnapshot.forEach(d => allAccountsData.push({ id: d.id, ...d.data() }));
      renderAccountsTable(allAccountsData);

      // Wire up search using the dedicated ID
      const searchInput = document.getElementById('accounts-search');
      if (searchInput) {
        searchInput.oninput = () => {
          const q = searchInput.value.toLowerCase();
          const filtered = allAccountsData.filter(a =>
            (a.name  || '').toLowerCase().includes(q) ||
            (a.email || '').toLowerCase().includes(q) ||
            (a.org   || '').toLowerCase().includes(q) ||
            (a.role  || '').toLowerCase().includes(q)
          );
          renderAccountsTable(filtered);
        };
      }
    } catch (e) {
      console.error('Error fetching accounts:', e);
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Failed to load accounts. (${e.code || e.message})</td></tr>`;
    }
  }

  function renderAccountsTable(accounts) {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;

    if (accounts.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500">No accounts match your search.</td></tr>`;
      return;
    }

    const avatarColors = {
      'Administrator': 'bg-red-100 text-red-700',
      'Staff': 'bg-emerald-100 text-emerald-700',
      'Speaker': 'bg-indigo-100 text-indigo-700',
      'Delegate': 'bg-amber-100 text-amber-700',
    };
    const badgeColors = {
      'Administrator': 'bg-red-100 text-red-800 border-red-200',
      'Staff': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'Speaker': 'bg-indigo-100 text-indigo-800 border-indigo-200',
      'Delegate': 'bg-gray-100 text-gray-800 border-gray-200',
    };

    listEl.innerHTML = accounts.map(a => {
      const avatarBg = avatarColors[a.role] || 'bg-slate-200 text-slate-600';
      const badgeCls = badgeColors[a.role] || 'bg-gray-100 text-gray-800 border-gray-200';
      return `
        <tr class="bg-white hover:bg-slate-50 transition-colors group">
          <td class="px-6 py-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center font-bold uppercase flex-shrink-0 text-sm">${a.initials || '??'}</div>
              <div>
                <div class="font-semibold text-slate-900">${a.name || '—'}</div>
                <div class="text-slate-500 text-xs">${a.email || '—'}</div>
              </div>
            </div>
          </td>
          <td class="px-6 py-4 text-slate-600 font-medium">${a.org || '—'}</td>
          <td class="px-6 py-4 text-slate-500 whitespace-nowrap text-sm">${a.date || '—'}</td>
          <td class="px-6 py-4">
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeCls}">${a.role || '—'}</span>
          </td>
          <td class="px-6 py-4 text-right whitespace-nowrap">
            <button class="btn-edit-role text-blue-600 hover:text-blue-900 font-medium text-sm mr-2" data-docid="${a.id}" data-name="${a.name}" data-role="${a.role}">Edit Role</button>
            <button class="btn-delete-account text-red-500 hover:text-red-700 font-medium text-sm" data-docid="${a.id}" data-name="${a.name}">Delete</button>
          </td>
        </tr>`;
    }).join('');

    // Update count info
    const countEl = document.getElementById('accounts-count-info');
    if (countEl) {
      countEl.innerHTML = `Showing <span class="font-medium text-slate-900">${accounts.length}</span> of <span class="font-medium text-slate-900">${allAccountsData.length}</span> accounts`;
    }

    // Bind Edit Role buttons
    listEl.querySelectorAll('.btn-edit-role').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('edit-role-docid').value = btn.dataset.docid;
        document.getElementById('edit-role-username').innerText = `Editing role for: ${btn.dataset.name}`;
        document.getElementById('edit-role-select').value = btn.dataset.role;
        document.getElementById('modal-edit-role').classList.remove('hidden');
      });
    });

    // Bind Delete buttons
    listEl.querySelectorAll('.btn-delete-account').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Are you sure you want to delete "${btn.dataset.name}"? This cannot be undone.`)) return;
        try {
          await deleteDoc(doc(db, 'accounts', btn.dataset.docid));
          showToast(`"${btn.dataset.name}" deleted.`, 'success');
          loadAccounts();
        } catch(err) {
          console.error('Delete failed:', err);
          showToast('Failed to delete account.', 'error');
        }
      });
    });
  }

});
