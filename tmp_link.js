import fs from 'fs';

const files = ['index.html', 'login.html', 'documents.html', 'schedule.html', 'accounts.html'];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  
  content = content.replace(/href="#" data-target="home"/g, 'href="index.html"');
  content = content.replace(/href="#" data-target="documents"/g, 'href="documents.html"');
  content = content.replace(/href="#" data-target="schedule"/g, 'href="schedule.html"');
  content = content.replace(/href="#" id="nav-accounts-tab" data-target="accounts"/g, 'href="accounts.html" id="nav-accounts-tab"');
  content = content.replace(/href="#" id="mobile-nav-accounts" data-target="accounts"/g, 'href="accounts.html" id="mobile-nav-accounts"');

  if (f === 'login.html') {
    const head = content.substring(0, content.indexOf('<!-- LOGIN SCREEN -->'));
    const login = content.substring(content.indexOf('<!-- LOGIN SCREEN -->'), content.indexOf('<!-- DASHBOARD WRAPPER -->'));
    const scripts = content.substring(content.indexOf('<!-- App entry point scripts -->'));
    fs.writeFileSync(f, head + login + scripts);
  } else {
    // Other pages: Delete login
    const head = content.substring(0, content.indexOf('<!-- LOGIN SCREEN -->'));
    const dashStart = content.indexOf('<!-- DASHBOARD WRAPPER -->');
    let body = content.substring(dashStart);
    body = body.replace('class="hidden h-full', 'class="flex h-full');
    fs.writeFileSync(f, head + body);
  }
});
console.log('Success');
