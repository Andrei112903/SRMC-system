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

        // Global role for RBAC logic elsewhere
        window.currentUserRole = userRole;

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
        
        // Accounts tab visibility
        if(accountsTabDesktop) {
          accountsTabDesktop.classList.remove('hidden');
          accountsTabDesktop.classList.add('flex');
        }
        if(accountsTabMobile) {
          accountsTabMobile.classList.remove('hidden');
          accountsTabMobile.classList.add('flex');
        }

        // --- Handle Upload Document Visibility RMAC ---
        const uploadArea = document.getElementById('upload-document-btn');
        if (uploadArea) {
          // Wrapped in container to hide entire block
          const container = uploadArea.parentElement;
          if (userRole === 'Administrator') {
            container.classList.remove('hidden');
          } else {
            container.classList.add('hidden');
          }
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
      if (section.id === `view-${target}`) {
        section.classList.remove('hidden');
        section.classList.add('block');
        foundView = true;
      } else {
        section.classList.add('hidden');
        section.classList.remove('block');
      }
    });

    if (!foundView && target !== 'home') {
      return switchView('home');
    }

    links.forEach(link => {
      const isDesktop = link.closest('aside') !== null;
      const href = link.getAttribute('href') || '';
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

  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    const href = link.getAttribute('href');
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
    let target = 'home';
    if (path.includes('documents')) target = 'documents';
    else if (path.includes('schedule')) target = 'schedule';
    else if (path.includes('accounts')) target = 'accounts';
    else if (path.includes('login')) target = 'login';
    switchView(target);
  }

  initializeRoute();

  // --- Document Logic ---
  const uploadBtn = document.getElementById('upload-document-btn');
  const uploadInput = document.getElementById('upload-document-input');

  if (uploadBtn && uploadInput) {
    uploadBtn.addEventListener('click', () => uploadInput.click());
    uploadInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        const files = Array.from(e.target.files);
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="animate-pulse">Uploading...</span>';
        try {
          for (const file of files) {
            const sizeInMB = file.size / (1024 * 1024);
            const sizeStr = sizeInMB > 1 ? `${sizeInMB.toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
            const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            await addDoc(collection(db, "documents"), {
              name: file.name,
              uploadDate: today,
              size: sizeStr,
              status: "Reviewing"
            });
          }
          alert(`Successfully uploaded ${files.length} document(s)!`);
          loadDocuments();
        } catch (error) {
          console.error("Error uploading documents: ", error);
          alert("Failed to upload documents.");
        } finally {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Upload Document`;
          uploadInput.value = '';
        }
      }
    });
  }

  async function loadDocuments() {
    const listEl = document.getElementById('documents-list');
    if (!listEl) return;
    listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">Loading documents...</td></tr>`;
    try {
      const querySnapshot = await getDocs(collection(db, "documents"));
      listEl.innerHTML = '';
      if (querySnapshot.empty) {
        listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No documents found.</td></tr>`;
        return;
      }
      querySnapshot.forEach((documentSnap) => {
        const data = documentSnap.data();
        let iconColor = 'text-slate-500';
        if (data.name.endsWith('.pdf')) iconColor = 'text-red-500';
        else if (data.name.endsWith('.docx')) iconColor = 'text-blue-500';
        else if (data.name.endsWith('.xlsx')) iconColor = 'text-emerald-500';

        let statusClass = 'bg-slate-100 text-slate-800 border-slate-200';
        if (data.status === 'Approved') statusClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
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
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">${data.status}</span>
            </td>
            <td class="px-6 py-4 text-right">
              <div class="flex justify-end gap-3 text-sm">
                <button class="text-primary-600 hover:text-primary-900 font-medium">Download</button>
                ${window.currentUserRole === 'Administrator' ? `<button class="btn-delete-doc text-red-500 hover:text-red-700 font-medium" data-docid="${documentSnap.id}" data-name="${data.name}">Delete</button>` : ''}
              </div>
            </td>
          </tr>`;
      });
      listEl.querySelectorAll('.btn-delete-doc').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Delete ${btn.dataset.name}?`)) return;
          try {
            await deleteDoc(doc(db, "documents", btn.dataset.docid));
            showToast(`Document deleted.`, 'success');
            loadDocuments();
          } catch (err) {
            console.error(err);
            showToast("Failed to delete document.", 'error');
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Failed to load documents.</td></tr>`;
    }
  }

  async function loadStats() {
    try {
      const querySnapshot = await getDocs(collection(db, "stats"));
      if (!querySnapshot.empty) {
        const data = querySnapshot.docs[0].data();
        const d = document.getElementById('stat-delegates');
        const s = document.getElementById('stat-sessions');
        const a = document.getElementById('stat-approvals');
        const docC = document.getElementById('stat-documents');
        if (d) d.innerText = (data.delegates || 0).toLocaleString();
        if (s) s.innerText = (data.activeSessions || 0).toLocaleString();
        if (a) a.innerText = (data.pendingApprovals || 0).toLocaleString();
        if (docC) docC.innerText = (data.docsProcessed || 0).toLocaleString();
      }
    } catch (e) { console.error("Stats fail", e); }
  }

  // --- Schedule Logic ---
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
      const eventsByDate = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (!eventsByDate[data.date]) eventsByDate[data.date] = [];
        eventsByDate[data.date].push(data);
      });
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
      Object.keys(eventsByDate).forEach(d => eventsByDate[d].sort((a,b) => toMins(a.time) - toMins(b.time)));
      const sortedDates = Object.keys(eventsByDate).sort();
      tabsContainer.innerHTML = '';
      contentContainer.innerHTML = '';
      sortedDates.forEach((dateStr, index) => {
        const dObj = new Date(dateStr);
        const adjustedDate = new Date(dObj.getTime() + Math.abs(dObj.getTimezoneOffset() * 60000));
        const dayName = adjustedDate.toLocaleDateString('en-US', { weekday: 'short' });
        const monthDay = adjustedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tabBtn = document.createElement('button');
        tabBtn.className = index === 0 ? "day-tab border-blue-600 text-blue-600 whitespace-nowrap py-4 px-2 border-b-2 font-medium text-sm transition-colors flex-1 text-center" : "day-tab border-transparent text-slate-500 hover:text-slate-700 whitespace-nowrap py-4 px-2 border-b-2 font-medium text-sm transition-colors flex-1 text-center";
        tabBtn.dataset.targetId = `day-${dateStr}`;
        tabBtn.innerHTML = `${dayName} <span class="hidden sm:inline">(${monthDay})</span>`;
        tabsContainer.appendChild(tabBtn);
        const dayContainer = document.createElement('div');
        dayContainer.id = `day-${dateStr}`;
        dayContainer.className = index === 0 ? "day-content block space-y-4" : "day-content hidden space-y-4";
        eventsByDate[dateStr].forEach(data => {
          let statusClass = data.status === 'Ongoing' ? 'bg-green-100 text-green-700 border-green-200' : (data.status === 'Finished' ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-blue-50 text-blue-700 border-blue-200');
          dayContainer.innerHTML += `
            <div class="bg-white border rounded-xl p-5 flex gap-4 items-start hover:shadow-md transition-shadow relative overflow-hidden">
               <div class="absolute left-0 top-0 bottom-0 w-1 ${data.status === 'Ongoing' ? 'bg-green-500' : 'bg-blue-500'}"></div>
               <div class="w-32 flex-shrink-0"><p class="text-lg font-bold text-slate-900">${data.time}</p><p class="text-xs text-slate-500">${data.endTime}</p></div>
               <div class="flex-1">
                 <h3 class="text-lg font-bold text-slate-900">${data.title}</h3>
                 <p class="text-sm text-slate-600 mb-2">${data.speaker}</p>
                 <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusClass}">${data.status}</span>
               </div>
            </div>`;
        });
        contentContainer.appendChild(dayContainer);
      });
      tabsContainer.querySelectorAll('.day-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const tid = tab.dataset.targetId;
          tabsContainer.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('text-blue-600', t===tab));
          contentContainer.querySelectorAll('.day-content').forEach(c => c.classList.toggle('hidden', c.id!==tid));
        });
      });
    } catch(e) { console.error(e); }
  }

  // --- Accounts Logic ---
  let allAccountsData = [];
  async function loadAccounts() {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;
    // Clear hardcoded rows immediately
    listEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500"><div class="flex items-center justify-center gap-2"><svg class="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading accounts...</div></td></tr>`;
    try {
      const qs = await getDocs(collection(db, 'accounts'));
      allAccountsData = qs.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAccountsTable(allAccountsData);
      const search = document.getElementById('accounts-search');
      if (search) {
        search.oninput = () => {
          const q = search.value.toLowerCase();
          renderAccountsTable(allAccountsData.filter(a => (a.name||'').toLowerCase().includes(q) || (a.email||'').toLowerCase().includes(q) || (a.role||'').toLowerCase().includes(q)));
        };
      }
    } catch (e) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-red-500">Failed to load accounts.</td></tr>`;
    }
  }

  function renderAccountsTable(accounts) {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;
    if (accounts.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500">No accounts match your search.</td></tr>`;
      return;
    }
    const avatarColors = { 'Administrator': 'bg-red-100 text-red-700', 'Staff': 'bg-emerald-100 text-emerald-700', 'Speaker': 'bg-indigo-100 text-indigo-700', 'Delegate': 'bg-amber-100 text-amber-700' };
    listEl.innerHTML = accounts.map(a => {
      const avatarBg = avatarColors[a.role] || 'bg-slate-200 text-slate-600';
      return `
        <tr class="bg-white hover:bg-slate-50 transition-colors group">
          <td class="px-6 py-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center font-bold text-sm">${a.initials || '??'}</div><div><div class="font-semibold text-slate-900">${a.name || '—'}</div><div class="text-slate-500 text-xs">${a.email || '—'}</div></div></div></td>
          <td class="px-6 py-4 text-slate-600 font-medium">${a.org || '—'}</td>
          <td class="px-6 py-4 text-slate-500 text-sm">${a.date || '—'}</td>
          <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200">${a.role || '—'}</span></td>
          <td class="px-6 py-4 text-right">
            <button class="btn-view-details text-blue-600 hover:text-blue-900 font-medium text-sm mr-3" data-name="${a.name}" data-email="${a.email}" data-org="${a.org}" data-role="${a.role}" data-initials="${a.initials}">View Details</button>
            <button class="btn-edit-role text-slate-600 hover:text-slate-900 font-medium text-sm mr-3" data-docid="${a.id}" data-name="${a.name}" data-role="${a.role}" data-initials="${a.initials}">Edit Role</button>
            <button class="btn-delete-account text-red-500 hover:text-red-700 font-medium text-sm" data-docid="${a.id}" data-name="${a.name}">Delete</button>
          </td>
        </tr>`;
    }).join('');
    
    // Bind listeners
    listEl.querySelectorAll('.btn-view-details').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modal-view-details');
        if (!modal) return;
        document.getElementById('details-name').innerText = btn.dataset.name;
        document.getElementById('details-email').innerText = btn.dataset.email;
        document.getElementById('details-org').innerText = btn.dataset.org;
        document.getElementById('details-role-badge').innerText = btn.dataset.role;
        document.getElementById('details-avatar').innerText = btn.dataset.initials || '??';
        modal.classList.remove('hidden');
      });
    });

    listEl.querySelectorAll('.btn-edit-role').forEach(btn => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modal-edit-role');
        if (!modal) return;
        document.getElementById('edit-role-docid').value = btn.dataset.docid;
        document.getElementById('edit-role-username').innerText = btn.dataset.name;
        document.getElementById('edit-role-avatar').innerText = btn.dataset.initials || '??';
        document.getElementById('edit-role-select').value = btn.dataset.role;
        modal.classList.remove('hidden');
      });
    });
    listEl.querySelectorAll('.btn-delete-account').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm(`Delete ${btn.dataset.name}?`)) return;
      try { await deleteDoc(doc(db, 'accounts', btn.dataset.docid)); showToast(`Deleted`, 'success'); loadAccounts(); } catch(err) { showToast('Fail', 'error'); }
    }));
    const countEl = document.getElementById('accounts-count-info');
    if (countEl) countEl.innerHTML = `Showing <span class="font-medium text-slate-900">${accounts.length}</span> of <span class="font-medium text-slate-900">${allAccountsData.length}</span> accounts`;
  }

  // --- Other Logic ---
  const inviteModal = document.getElementById('modal-invite-user');
  const formInviteUser = document.getElementById('form-invite-user');

  if (inviteModal && formInviteUser) {
    document.addEventListener('click', (e) => { if (e.target.closest('#btn-invite-user')) inviteModal.classList.remove('hidden'); });
    document.getElementById('btn-close-invite-modal').addEventListener('click', () => inviteModal.classList.add('hidden'));
    document.getElementById('btn-cancel-invite').addEventListener('click', () => inviteModal.classList.add('hidden'));
    formInviteUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = document.getElementById('invite-name').value, e_ = document.getElementById('invite-email').value, o = document.getElementById('invite-org').value, r = document.getElementById('invite-role').value, p = document.getElementById('invite-password').value;
      const b = document.getElementById('btn-submit-invite'); b.disabled=true; b.innerText='...';
      try {
        const cred = await createUserWithEmailAndPassword(authSecondary, e_, p);
        await signOut(authSecondary);
        await addDoc(collection(db, 'accounts'), { uid: cred.user.uid, name: n, email: e_, org: o, role: r, initials: n.split(' ').map(s=>s[0]).join('').toUpperCase(), date: new Date().toLocaleDateString() });
        inviteModal.classList.add('hidden'); loadAccounts(); showToast('Invited', 'success');
      } catch (err) { alert(err.message); } finally { b.disabled=false; b.innerText='Invite User'; }
    });
  }

  // --- Edit Role Modal Actions ---
  const editRoleModal = document.getElementById('modal-edit-role');
  const viewDetailsModal = document.getElementById('modal-view-details');

  if (editRoleModal) {
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
        saveBtn.innerText = 'Save Changes';
      }
    });
  }

  // --- View Details Modal Actions ---
  if (viewDetailsModal) {
    const closeBtns = ['btn-close-view-details', 'btn-ok-view-details'];
    closeBtns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => viewDetailsModal.classList.add('hidden'));
    });
  }

  function showToast(m, t='success') {
    const d = document.createElement('div'); d.className = `fixed bottom-6 right-6 z-[200] ${t==='success'?'bg-emerald-600':'bg-red-600'} text-white px-5 py-3 rounded-xl animate-fade-in`; d.innerText = m; document.body.appendChild(d); setTimeout(()=>d.remove(), 3000);
  }

});
