const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');

// Extraction RegExp
const extractBlock = (id) => {
  const startStr = `<div id="${id}"`;
  const startIndex = html.indexOf(startStr);
  if (startIndex === -1) return '';
  
  let stack = 0;
  let endIndex = -1;
  const len = html.length;
  
  for (let i = startIndex; i < len; i++) {
    if (html.startsWith('<div', i)) stack++;
    if (html.startsWith('</div', i)) stack--;
    if (stack === 0) {
      endIndex = html.indexOf('>', i) + 1;
      break;
    }
  }
  
  return html.substring(startIndex, endIndex);
};

const headAndBody = html.substring(0, html.indexOf('<!-- LOGIN SCREEN -->'));
const loginScreen = extractBlock('view-login');
const appDashboardStart = html.substring(html.indexOf('<!-- DASHBOARD WRAPPER -->'), html.indexOf('<!-- MAIN CONTENT -->'));
const mainContentStart = html.substring(html.indexOf('<!-- MAIN CONTENT -->'), html.indexOf('<!-- ======================= -->'));

const viewHome = extractBlock('view-home');
const viewDocs = extractBlock('view-documents');
const viewSchedule = extractBlock('view-schedule');
const viewAccs = extractBlock('view-accounts');

// Find Mobile Nav start
const mobileNavStartStr = '<!-- MOBILE BOTTOM NAVIGATION (Hidden on Desktop) -->';
const mobileNavStart = html.indexOf(mobileNavStartStr);

const mobileNavEnd = html.substring(mobileNavStart);
// But we need to replace links!

function replaceLinks(str, activePage) {
  let res = str.replace(/href="#" data-target="home"/g, `href="index.html"`);
  res = res.replace(/href="#" data-target="documents"/g, `href="documents.html"`);
  res = res.replace(/href="#" data-target="schedule"/g, `href="schedule.html"`);
  res = res.replace(/href="#" id="nav-accounts-tab" data-target="accounts"/g, `href="accounts.html" id="nav-accounts-tab"`);
  res = res.replace(/href="#" id="mobile-nav-accounts" data-target="accounts"/g, `href="accounts.html" id="mobile-nav-accounts"`);
  
  // Set active classes statically if we want, or rely on JS.
  // Actually JS will handle styling them on load based on pathname. It's safer to leave classes alone.
  return res;
}

function processPage(viewContent, extraHtml = '') {
  let pageHtml = headAndBody + '\n' + 
                 appDashboardStart.replace('class="hidden h-full', 'class="flex h-full') + '\n' +
                 mainContentStart + '\n' +
                 viewContent + '\n' +
                 '      </div>\n    </main>\n' +
                 mobileNavEnd;
  
  // Expose views by removing 'hidden' if present
  pageHtml = pageHtml.replace(/class="view-section hidden(.*?)"/, 'class="view-section block$1"');
  
  // Add Session modal if schedule
  if (extraHtml) {
    pageHtml = pageHtml.replace('<!-- App entry point scripts -->', extraHtml + '\n    <!-- App entry point scripts -->');
  }
  
  return replaceLinks(pageHtml);
}

// 1. login.html
fs.writeFileSync('login.html', headAndBody + '\n' + loginScreen.replace('inset-0', 'inset-0') + '\n\n' + '    <script type="module" src="/src/main.js"></script>\n  </body>\n</html>');

// 2. index.html (Home)
fs.writeFileSync('index.html', processPage(viewHome));

// 3. documents.html
fs.writeFileSync('documents.html', processPage(viewDocs));

// 4. schedule.html
const modalAddSessionHTML = html.substring(html.indexOf('<!-- Add Session Modal -->'), html.indexOf('<!-- App entry point scripts -->'));
fs.writeFileSync('schedule.html', processPage(viewSchedule, modalAddSessionHTML));

// 5. accounts.html
fs.writeFileSync('accounts.html', processPage(viewAccs));

console.log('Successfully generated HTML pages');
