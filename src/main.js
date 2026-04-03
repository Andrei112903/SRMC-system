import './style.css';
import { db, auth, authSecondary } from './firebase.js';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "firebase/auth";

// 🚀 REFRESH-FREE LIVE UPDATES
// (Global unsubscription functions to clean up if needed)
let unsubDocs, unsubStats, unsubSchedule, unsubAccounts;

console.log("SMRC System Main Module Loaded.");

document.addEventListener('DOMContentLoaded', () => {
  const appLoading = document.getElementById('app-loading');
  const appDashboard = document.getElementById('app-dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const logoutBtn = document.getElementById('logout-btn');

  // Handle Auth State
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log("User found:", user.email);
      
      // Prevent reload loops on MPA legacy paths
      if (window.location.pathname.includes('login.html')) {
          window.location.replace('index.html');
          return;
      }

      try {
        // Fetch user role for RBAC
        const q = query(collection(db, "accounts"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);
        
        let userRole = 'User';
        let userName = user.email.split('@')[0];
        let initials = "??";
        
        if (!querySnapshot.empty) {
          const accountData = querySnapshot.docs[0].data();
          userRole = accountData.role;
          userName = accountData.name;
          initials = accountData.initials || userName.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2);
        }

        window.currentUserRole = userRole;

        // UI Updates
        const sidebarName = document.getElementById('sidebar-user-name');
        const sidebarRole = document.getElementById('sidebar-user-role');
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if(sidebarName) sidebarName.innerText = userName;
        if(sidebarRole) sidebarRole.innerText = userRole;
        if(sidebarAvatar) sidebarAvatar.innerText = initials;

        // Section & Tab Visibility based on Role
        const accountsTabDesktop = document.getElementById('nav-accounts-tab');
        const accountsTabMobile = document.getElementById('mobile-nav-accounts');
        const uploadBtnContainer = document.getElementById('upload-document-btn')?.parentElement;
        const inviteBtn = document.getElementById('btn-invite-user');

        if(accountsTabDesktop) accountsTabDesktop.classList.toggle('hidden', userRole !== 'Administrator');
        if(accountsTabMobile) accountsTabMobile.classList.toggle('hidden', userRole !== 'Administrator');
        if(uploadBtnContainer) uploadBtnContainer.classList.toggle('hidden', userRole !== 'Administrator');
        if(inviteBtn) inviteBtn.classList.toggle('hidden', userRole !== 'Administrator' && userRole !== 'Staff');

      } catch (e) {
         console.warn("RBAC error", e);
      }
      
      // Show Dashboard
      if (appDashboard) {
        appDashboard.classList.remove('hidden');
        appDashboard.classList.add('flex');
      }

      // 🔌 INITIALIZE REAL-TIME LISTENERS
      startLiveListeners();
      initializeRouter();

      // ✨ FADE OUT LOADING SCREEN (Once data starts coming in or auth is done)
      setTimeout(() => {
        if (appLoading) {
           appLoading.classList.add('opacity-0', 'pointer-events-none');
           setTimeout(() => appLoading.style.display = 'none', 700);
        }
      }, 1500);
      
    } else {
      if (appDashboard) appDashboard.classList.add('hidden');
      if (!window.location.pathname.includes('login.html')) {
          window.location.replace('login.html');
      }
    }
  });

  // --- Real-Time Listener Logic ---
  function startLiveListeners() {
    // 📄 Live Documents
    if (!unsubDocs) {
      unsubDocs = onSnapshot(collection(db, "documents"), (snapshot) => {
        const listEl = document.getElementById('documents-list');
        if (!listEl) return;
        
        if (snapshot.empty) {
          listEl.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No documents found.</td></tr>`;
          return;
        }

        listEl.innerHTML = '';
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id;
          let iconColor = data.name? (data.name.endsWith('.pdf') ? 'text-red-500' : (data.name.endsWith('.xlsx') ? 'text-emerald-500' : 'text-blue-500')) : 'text-slate-500';
          let statusCls = data.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800';

          listEl.innerHTML += `
            <tr class="bg-white hover:bg-slate-50 transition-colors animate-fade-in">
              <td class="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                <svg class="w-6 h-6 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                ${data.name}
              </td>
              <td class="px-6 py-4 text-sm">${data.uploadDate}</td>
              <td class="px-6 py-4 text-sm">${data.size}</td>
              <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-medium border border-transparent ${statusCls}">${data.status}</span></td>
              <td class="px-6 py-4 text-right">
                <div class="flex justify-end gap-3 text-sm">
                  <button class="text-primary-600 hover:text-primary-900 font-medium">Download</button>
                  ${window.currentUserRole === 'Administrator' ? `<button class="btn-delete-doc text-red-500 hover:text-red-700 font-medium" data-docid="${docId}" data-name="${data.name}">Delete</button>` : ''}
                </div>
              </td>
            </tr>`;
        });
        
        // Re-bind delete actions
        listEl.querySelectorAll('.btn-delete-doc').forEach(btn => btn.onclick = () => deleteDocument(btn.dataset.docid, btn.dataset.name));
      });
    }

    // 📊 Live Stats
    if (!unsubStats) {
      unsubStats = onSnapshot(collection(db, "stats"), (snapshot) => {
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          const d = document.getElementById('stat-delegates'), s = document.getElementById('stat-sessions'), a = document.getElementById('stat-approvals'), docC = document.getElementById('stat-documents');
          if (d) d.innerText = (data.delegates || 0).toLocaleString();
          if (s) s.innerText = (data.activeSessions || 0).toLocaleString();
          if (a) a.innerText = (data.pendingApprovals || 0).toLocaleString();
          if (docC) docC.innerText = (data.docsProcessed || 0).toLocaleString();
        }
      });
    }

    // 📅 Live Schedule
    if (!unsubSchedule) {
      unsubSchedule = onSnapshot(collection(db, "schedule_events"), (snapshot) => {
        renderSchedule(snapshot);
      });
    }

    // 👥 Live Accounts
    if (!unsubAccounts) {
      unsubAccounts = onSnapshot(collection(db, "accounts"), (snapshot) => {
        const accounts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAccountsTable(accounts);
      });
    }
  }

  // --- Router & Navigation ---
  function switchView(target) {
    if (!target) target = 'home';
    console.log("[LIVE Router] View:", target);
    
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.toggle('hidden', sec.id !== `view-${target}`);
      sec.classList.toggle('block', sec.id === `view-${target}`);
    });

    document.querySelectorAll('.nav-link').forEach(link => {
       const href = link.getAttribute('href') || '';
       const isMatch = (target === 'home' && (href === 'index.html' || href === '/')) || href.includes(target);
       link.classList.toggle('bg-primary-900', isMatch && link.closest('aside'));
       link.classList.toggle('text-primary-600', isMatch && !link.closest('aside'));
    });
  }

  function initializeRouter() {
    const path = window.location.pathname;
    let target = 'home';
    if (path.includes('documents')) target = 'documents';
    else if (path.includes('schedule')) target = 'schedule';
    else if (path.includes('accounts')) target = 'accounts';
    switchView(target);
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('.nav-link');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    let target = 'home';
    if (href.includes('documents')) target = 'documents';
    else if (href.includes('schedule')) target = 'schedule';
    else if (href.includes('accounts')) target = 'accounts';
    history.pushState(null, '', href);
    switchView(target);
  });

  window.onpopstate = () => initializeRouter();

  // --- Rendering Helpers ---
  function renderAccountsTable(accounts) {
    const listEl = document.getElementById('accounts-list');
    if (!listEl) return;
    if (accounts.length === 0) {
      listEl.innerHTML = `<tr><td colspan="5" class="text-center py-10 text-slate-500">No accounts found.</td></tr>`;
      return;
    }
    const colors = { 'Administrator': 'bg-red-100 text-red-700', 'Staff': 'bg-emerald-100 text-emerald-700', 'Speaker': 'bg-indigo-100 text-indigo-700', 'Delegate': 'bg-amber-100 text-amber-700' };
    listEl.innerHTML = accounts.map(a => {
      const avatarBg = colors[a.role] || 'bg-slate-200 text-slate-600';
      return `
        <tr class="bg-white hover:bg-slate-50 transition-colors animate-fade-in group">
          <td class="px-6 py-4"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center font-bold text-sm">${a.initials || '??'}</div><div><div class="font-semibold text-slate-900">${a.name || '—'}</div><div class="text-slate-500 text-xs">${a.email || '—'}</div></div></div></td>
          <td class="px-6 py-4 text-slate-600 font-medium">${a.org || '—'}</td>
          <td class="px-6 py-4 text-slate-500 text-sm whitespace-nowrap">${a.date || '—'}</td>
          <td class="px-6 py-4"><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border border-slate-200">${a.role || '—'}</span></td>
          <td class="px-6 py-4 text-right whitespace-nowrap">
            <button class="btn-view-details text-blue-600 hover:text-blue-900 font-medium text-sm mr-3" data-name="${a.name}" data-email="${a.email}" data-org="${a.org}" data-role="${a.role}" data-initials="${a.initials}">View Details</button>
            <button class="btn-edit-role text-slate-600 hover:text-slate-900 font-medium text-sm mr-3" data-docid="${a.id}" data-name="${a.name}" data-role="${a.role}" data-initials="${a.initials}">Edit Role</button>
            <button class="btn-delete-account text-red-500 hover:text-red-700 font-medium text-sm" data-docid="${a.id}" data-name="${a.name}">Delete</button>
          </td>
        </tr>`;
    }).join('');
    bindAccountListeners(listEl);
  }

  function renderSchedule(snapshot) {
    const tabsContainer = document.getElementById('schedule-tabs-container');
    const contentContainer = document.getElementById('schedule-content-container');
    if (!tabsContainer || !contentContainer) return;
    
    if (snapshot.empty) {
      tabsContainer.innerHTML = '';
      contentContainer.innerHTML = '<div class="text-center py-8 text-slate-500">No sessions found.</div>';
      return;
    }

    const eventsByDate = {};
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!eventsByDate[data.date]) eventsByDate[data.date] = [];
      eventsByDate[data.date].push(data);
    });

    const sortedDates = Object.keys(eventsByDate).sort();
    tabsContainer.innerHTML = '';
    contentContainer.innerHTML = '';
    
    sortedDates.forEach((dateStr, index) => {
      const dObj = new Date(dateStr);
      const adj = new Date(dObj.getTime() + Math.abs(dObj.getTimezoneOffset() * 60000));
      const tabBtn = document.createElement('button');
      tabBtn.className = "day-tab border-b-2 py-4 px-2 font-medium text-sm flex-1 text-center " + (index === 0 ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500");
      tabBtn.dataset.targetId = `day-${dateStr}`;
      tabBtn.innerHTML = `${adj.toLocaleDateString('en-US',{weekday:'short'})} (${adj.toLocaleDateString('en-US',{month:'short',day:'numeric'})})`;
      tabsContainer.appendChild(tabBtn);

      const dayDiv = document.createElement('div');
      dayDiv.id = `day-${dateStr}`;
      dayDiv.className = "day-content space-y-4 " + (index === 0 ? "block" : "hidden");
      eventsByDate[dateStr].forEach(ev => {
        dayDiv.innerHTML += `<div class="bg-white border rounded-xl p-5 flex gap-4 border-l-4 ${ev.status==='Ongoing'?'border-l-green-500 shadow-md':'border-l-blue-500'}">
          <div class="w-24 text-sm font-bold text-slate-900">${ev.time}</div>
          <div class="flex-1"><h4 class="font-bold">${ev.title}</h4><p class="text-xs text-slate-500">${ev.speaker}</p></div>
        </div>`;
      });
      contentContainer.appendChild(dayDiv);
    });

    tabsContainer.querySelectorAll('.day-tab').forEach(btn => btn.onclick = () => {
       const tid = btn.dataset.targetId;
       tabsContainer.querySelectorAll('.day-tab').forEach(t => t.classList.toggle('text-blue-600', t===btn));
       contentContainer.querySelectorAll('.day-content').forEach(c => c.classList.toggle('hidden', c.id!==tid));
    });
  }

  // --- Auth Handlers ---
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginSubmitBtn.disabled = true; loginSubmitBtn.innerText = "Authenticating...";
      try {
        await signInWithEmailAndPassword(auth, document.getElementById('email').value, document.getElementById('password').value);
      } catch (err) {
        if(loginError) { loginError.innerText = "Login failed."; loginError.classList.remove('hidden'); }
        loginSubmitBtn.disabled = false; loginSubmitBtn.innerText = "Sign In";
      }
    });
  }

  // --- Add Session Modal & Logic ---
  const sessionModal = document.getElementById('modal-add-session');
  const openSessionBtn = document.getElementById('btn-open-session-modal');
  const sessionForm = document.getElementById('form-add-session');

  if (openSessionBtn && sessionModal) {
    openSessionBtn.onclick = () => {
      sessionForm.reset();
      document.getElementById('session-error').classList.add('hidden');
      sessionModal.classList.remove('hidden');
    };
  }

  document.querySelectorAll('#btn-close-session-modal, #btn-cancel-session').forEach(b => {
    b.onclick = () => sessionModal.classList.add('hidden');
  });

  if (sessionForm) {
    sessionForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('session-title').value;
      const speaker = document.getElementById('session-speaker').value;
      const date = document.getElementById('session-date').value;
      const status = document.getElementById('session-status').value;
      const start = document.getElementById('session-start').value;
      const end = document.getElementById('session-end').value;
      const location = document.getElementById('session-location').value;
      const errEl = document.getElementById('session-error');
      const submitBtn = document.getElementById('btn-submit-session');

      submitBtn.disabled = true;
      submitBtn.innerText = "Saving...";

      try {
        await addDoc(collection(db, "schedule_events"), {
          title, speaker, date, status, location,
          time: `${start} - ${end}`
        });

        sessionModal.classList.add('hidden');
        showToast(`Session "${title}" added!`);
      } catch (err) {
        console.error("Session error:", err);
        errEl.innerText = "Failed to save session.";
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Save Session";
      }
    };
  }

  if (logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth).then(()=>window.location.reload()));

  // --- Invite User Modal & Logic ---
  const inviteModal = document.getElementById('modal-invite-user');
  const inviteBtn = document.getElementById('btn-invite-user');
  const inviteForm = document.getElementById('form-invite-user');

  if (inviteBtn && inviteModal) {
    inviteBtn.onclick = () => {
      inviteForm.reset();
      document.getElementById('invite-error').classList.add('hidden');
      inviteModal.classList.remove('hidden');
    };
  }

  document.querySelectorAll('#btn-close-invite-modal, #btn-cancel-invite').forEach(b => {
    b.onclick = () => inviteModal.classList.add('hidden');
  });

  if (inviteForm) {
    inviteForm.onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('invite-name').value;
      const email = document.getElementById('invite-email').value;
      const org = document.getElementById('invite-org').value;
      const role = document.getElementById('invite-role').value;
      const pass = document.getElementById('invite-password').value;
      const errEl = document.getElementById('invite-error');
      const submitBtn = document.getElementById('btn-submit-invite');

      submitBtn.disabled = true;
      submitBtn.innerText = "Inviting...";
      
      try {
        // 1. Create the user in Auth using secondary auth (prevents logging out the admin)
        await createUserWithEmailAndPassword(authSecondary, email, pass);
        
        // 2. Create the account record in Firestore
        await addDoc(collection(db, "accounts"), {
          name, email, org, role,
          date: new Date().toLocaleDateString(),
          initials: name.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2)
        });

        inviteModal.classList.add('hidden');
        showToast(`User ${name} invited!`);
      } catch (err) {
        console.error("Invite error:", err);
        errEl.innerText = err.message || "Failed to invite user.";
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Invite User";
      }
    };
  }

  // --- Modal Bindings ---
  function bindAccountListeners(list) {
    list.querySelectorAll('.btn-view-details').forEach(btn => btn.onclick = () => {
      const modal = document.getElementById('modal-view-details');
      document.getElementById('details-name').innerText = btn.dataset.name;
      document.getElementById('details-email').innerText = btn.dataset.email;
      document.getElementById('details-org').innerText = btn.dataset.org;
      document.getElementById('details-role-badge').innerText = btn.dataset.role;
      document.getElementById('details-avatar').innerText = btn.dataset.initials;
      modal.classList.remove('hidden');
    });
    list.querySelectorAll('.btn-edit-role').forEach(btn => btn.onclick = () => {
       document.getElementById('edit-role-docid').value = btn.dataset.docid;
       document.getElementById('edit-role-username').innerText = btn.dataset.name;
       document.getElementById('edit-role-avatar').innerText = btn.dataset.initials;
       document.getElementById('edit-role-select').value = btn.dataset.role;
       document.getElementById('modal-edit-role').classList.remove('hidden');
    });
    list.querySelectorAll('.btn-delete-account').forEach(btn => btn.onclick = async () => {
       if(confirm(`Delete ${btn.dataset.name}?`)) {
          await deleteDoc(doc(db, 'accounts', btn.dataset.docid));
          showToast('Account deleted');
       }
    });
  }

  const editRoleSave = document.getElementById('btn-save-edit-role');
  if(editRoleSave) {
    editRoleSave.onclick = async () => {
       const id = document.getElementById('edit-role-docid').value;
       const nr = document.getElementById('edit-role-select').value;
       await updateDoc(doc(db, 'accounts', id), { role: nr });
       document.getElementById('modal-edit-role').classList.add('hidden');
       showToast('Role updated');
    };
  }

  document.querySelectorAll('#btn-close-edit-role, #btn-cancel-edit-role').forEach(b=>b.onclick = () => document.getElementById('modal-edit-role').classList.add('hidden'));
  document.querySelectorAll('#btn-close-view-details, #btn-ok-view-details').forEach(b=>b.onclick = () => document.getElementById('modal-view-details').classList.add('hidden'));

  function showToast(m) {
    const t = document.createElement('div'); t.className = "fixed bottom-6 right-6 bg-emerald-600 text-white px-5 py-3 rounded-xl animate-fade-in z-[300]"; t.innerText = m; document.body.appendChild(t); setTimeout(()=>t.remove(), 3000);
  }

  async function deleteDocument(id, name) {
    if(confirm(`Delete ${name}?`)) {
       await deleteDoc(doc(db, "documents", id));
       showToast('Document deleted');
    }
  }

  // --- Document Upload ---
  const upBtn = document.getElementById('upload-document-btn');
  const upIn = document.getElementById('upload-document-input');
  if(upBtn && upIn) {
    upBtn.onclick = () => upIn.click();
    upIn.onchange = async () => {
      const files = Array.from(upIn.files);
      upBtn.disabled = true; upBtn.innerText = "Uploading...";
      for(const f of files) {
         await addDoc(collection(db, "documents"), { name: f.name, uploadDate: new Date().toLocaleDateString(), size: (f.size/1024).toFixed(0)+' KB', status: "Reviewing" });
      }
      upBtn.disabled = false; upBtn.innerHTML = `<svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg> Upload Document`;
      upIn.value = '';
    };
  }
});
