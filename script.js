/**
 * TestCase Buddy — script.js
 * Rule-based test case generator for a chat UI.
 * No external libraries or frameworks used.
 */

'use strict';

// ── DOM References ──────────────────────────────────────────
const chatArea     = document.getElementById('chatArea');
const inputForm    = document.getElementById('inputForm');
const featureInput = document.getElementById('featureInput');
const sendButton   = document.getElementById('sendButton');
const quickButtons = document.querySelectorAll('.btn-quick');

// ── Security: HTML Escape ────────────────────────────────────

/**
 * Escapes a plain-text string so it is safe to embed inside innerHTML.
 * All five HTML-significant characters are replaced with named entities.
 * This prevents XSS: user input and any data-uji strings (including
 * SQL injection payloads and script tags) are rendered as visible text.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Helpers ─────────────────────────────────────────────────

/** Returns current time as HH:MM string */
function getCurrentTime() {
  const now = new Date();
  return now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Scrolls the chat area to the very bottom.
 * Uses a short delay so the DOM has time to paint the new bubble first.
 */
function scrollToBottom() {
  setTimeout(() => {
    chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
  }, 50);
}

/**
 * Appends a message bubble to the chat area.
 * @param {'agent'|'user'} role  - Who is speaking.
 * @param {string}         html  - Inner HTML for the bubble body (agent: trusted static HTML;
 *                                  user: already-escaped text from handleUserSubmit).
 */
function appendMessage(role, html) {
  const msgEl = document.createElement('div');
  msgEl.classList.add('message', `message--${role}`);

  const avatarHTML = role === 'agent'
    ? `<div class="message__avatar" aria-hidden="true">🧪</div>`
    : '';

  const timeAlign = role === 'user' ? 'style="text-align:right"' : '';

  msgEl.innerHTML = `
    ${avatarHTML}
    <div class="message__content">
      <div class="message__bubble">${html}</div>
      <div class="message__time" ${timeAlign}>${getCurrentTime()}</div>
    </div>
  `;

  chatArea.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

/**
 * Shows an animated typing indicator from the agent, then removes it
 * and appends the real reply.
 * @param {string} replyHTML - HTML to show after the delay.
 */
function showTypingThenReply(replyHTML) {
  // Lock input while agent is "typing"
  sendButton.disabled = true;
  featureInput.disabled = true;

  // Create typing bubble
  const typingEl = document.createElement('div');
  typingEl.classList.add('message', 'message--agent');
  typingEl.setAttribute('aria-label', 'Agen sedang mengetik');
  typingEl.innerHTML = `
    <div class="message__avatar" aria-hidden="true">🧪</div>
    <div class="message__content">
      <div class="message__bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  chatArea.appendChild(typingEl);
  scrollToBottom();

  // Simulate processing delay (700–1100 ms)
  const delay = 700 + Math.random() * 400;
  setTimeout(() => {
    chatArea.removeChild(typingEl);
    appendMessage('agent', replyHTML);
    sendButton.disabled = false;
    featureInput.disabled = false;
    featureInput.focus();
  }, delay);
}

// ── Constraint Parser ────────────────────────────────────────

/**
 * Extracts numeric constraints and rules from the user's description.
 * Returns an object with any values found; callers use fallbacks when absent.
 *
 * Patterns extracted:
 *   - passwordMin  : minimal N karakter (for password)
 *   - maxFileMB    : ukuran/batas N MB
 *   - maxFileSuffix: the unit string found, e.g. "MB"
 *   - failLimit    : N kali gagal
 *   - lockMinutes  : N menit (kunci / terkunci)
 *   - maxNominal   : Rp N.NNN / Rp NNN.NNN (nominal maks)
 *   - formats      : array of explicitly mentioned file formats (JPG, PNG, etc.)
 *
 * @param {string} desc
 * @returns {Object}
 */
function parseConstraints(desc) {
  const result = {};

  // Password minimum character count: "minimal 8 karakter", "minimum 12 karakter"
  const pwMin = desc.match(/(?:minimal|minimum|min\.?)\s+(\d+)\s+karakter/i);
  if (pwMin) result.passwordMin = parseInt(pwMin[1], 10);

  // File size limit: "maksimal 2 MB", "batas 5 MB", "maksimum 10mb"
  const fileSz = desc.match(/(?:maksimal|maksimum|maks\.?|batas|ukuran maks(?:imum|imal)?)\s+([\d,\.]+)\s*(MB|KB|GB)/i);
  if (fileSz) {
    result.maxFileMB    = fileSz[1].replace(',', '.');
    result.maxFileSuffix = fileSz[2].toUpperCase();
  }

  // Brute-force attempt limit: "5 kali gagal", "3 kali percobaan"
  const failLim = desc.match(/(\d+)\s*kali\s*(?:gagal|percobaan|login|salah)/i);
  if (failLim) result.failLimit = parseInt(failLim[1], 10);

  // Lock duration: "dikunci 15 menit", "15 menit"
  const lockMins = desc.match(/(\d+)\s*menit/i);
  if (lockMins) result.lockMinutes = parseInt(lockMins[1], 10);

  // Maximum nominal: "Rp 50.000.000" or "50000" next to maks/maksimal
  const nomMax = desc.match(/(?:maks(?:imal|imum)?|batas)\s*(?:nominal|transaksi|transfer)?\s*Rp\s*([\d.,]+)/i)
               || desc.match(/Rp\s*([\d.,]+)\s*(?:per\s*transaksi|maks(?:imal|imum)?)/i);
  if (nomMax) result.maxNominal = nomMax[1];

  // Allowed file formats: collect all uppercase format mentions
  const formatMatches = desc.match(/\b(JPG|JPEG|PNG|GIF|WEBP|PDF|DOC|DOCX|MP4|SVG)\b/gi);
  if (formatMatches) {
    result.formats = [...new Set(formatMatches.map(f => f.toUpperCase()))];
  }

  return result;
}

// ── Test Case Table Builder ──────────────────────────────────

/**
 * Returns HTML for a coloured type badge.  Type values are internal constants.
 * @param {'Positif'|'Negatif'|'Edge'} type
 */
function typeBadge(type) {
  const cls = { Positif: 'type-positif', Negatif: 'type-negatif', Edge: 'type-edge' }[type] || '';
  return `<span class="type-badge ${cls}">${escapeHTML(type)}</span>`;
}

/**
 * Returns HTML for a coloured priority badge.  Priority values are internal constants.
 * @param {'Tinggi'|'Sedang'|'Rendah'} priority
 */
function priorityBadge(priority) {
  const cls = {
    Tinggi: 'priority-tinggi',
    Sedang: 'priority-sedang',
    Rendah: 'priority-rendah',
  }[priority] || '';
  return `<span class="priority-badge ${cls}">${escapeHTML(priority)}</span>`;
}

/**
 * Converts an array of test-case objects into an HTML table string.
 * All free-text fields are passed through escapeHTML to prevent XSS.
 * @param {Array<Object>} testCases
 * @returns {string} HTML string
 */
function buildTableHTML(testCases) {
  const rows = testCases.map(tc => `
    <tr>
      <td>${escapeHTML(tc.id)}</td>
      <td>${escapeHTML(tc.scenario)}</td>
      <td>${typeBadge(tc.type)}</td>
      <td>${escapeHTML(tc.precondition)}</td>
      <td>${escapeHTML(tc.steps)}</td>
      <td>${escapeHTML(tc.testData)}</td>
      <td>${escapeHTML(tc.expected)}</td>
      <td>${priorityBadge(tc.priority)}</td>
    </tr>
  `).join('');

  return `
    <div class="table-wrapper" role="region" aria-label="Tabel test case" tabindex="0">
      <table class="tc-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Skenario</th>
            <th>Tipe</th>
            <th>Pra-kondisi</th>
            <th>Langkah</th>
            <th>Data Uji</th>
            <th>Hasil yang Diharapkan</th>
            <th>Prioritas</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// ── Test Case Definitions ────────────────────────────────────

/**
 * Universal test cases appended to every feature's test suite.
 * The XSS/SQL data strings contain literal < > ' characters — these are
 * treated as plain text and rendered safely via escapeHTML in buildTableHTML.
 * @param {number} startIndex - Numeric index to continue ID numbering.
 * @returns {Array<Object>}
 */
function getUniversalTestCases(startIndex) {
  return [
    {
      id: `TC-${String(startIndex).padStart(3, '0')}`,
      scenario: 'Semua field dibiarkan kosong',
      type: 'Negatif',
      precondition: 'Pengguna membuka halaman fitur',
      steps: '1. Biarkan semua field kosong. 2. Klik tombol aksi utama.',
      testData: '(semua field kosong)',
      expected: 'Sistem menampilkan pesan validasi "Field tidak boleh kosong" dan mencegah proses berlanjut.',
      priority: 'Tinggi',
    },
    {
      id: `TC-${String(startIndex + 1).padStart(3, '0')}`,
      scenario: 'Input mengandung karakter khusus / SQL injection / XSS',
      type: 'Edge',
      precondition: 'Pengguna membuka halaman fitur',
      steps: "1. Masukkan string berbahaya di field teks. 2. Klik tombol aksi utama.",
      // These literal characters are intentionally included — escapeHTML renders them as text
      testData: "'; DROP TABLE users; -- | <script>alert(1)</script> | ../../etc/passwd",
      expected: 'Sistem menolak atau menyanitasi input; tidak terjadi error fatal, eksekusi skrip, maupun kebocoran data.',
      priority: 'Tinggi',
    },
  ];
}

// ── Login ────────────────────────────────────────────────────

/**
 * Generates test cases for login-related features.
 * Extracts passwordMin and failLimit from the description when present.
 * If a password minimum length is found, adds two boundary-value test cases.
 * @param {string} desc
 * @returns {{ featureType: string, testCases: Array<Object> }}
 */
function generateLoginTestCases(desc) {
  const c = parseConstraints(desc);
  const failLimit   = c.failLimit   || 5;
  const lockMinutes = c.lockMinutes || null;

  // Lockout expected result: if duration is known, state it precisely;
  // otherwise use a generic "sementara". Never append "atau CAPTCHA" when
  // a concrete duration is mentioned.
  const lockExpected = lockMinutes
    ? `Akun terkunci selama ${lockMinutes} menit; percobaan login lebih lanjut ditolak.`
    : 'Akun terkunci sementara atau CAPTCHA muncul; percobaan lebih lanjut dicegah.';

  const baseTC = [
    {
      id: 'TC-001',
      scenario: 'Login berhasil dengan kredensial valid',
      type: 'Positif',
      precondition: 'Akun terdaftar di sistem; halaman login terbuka',
      steps: '1. Masukkan email valid. 2. Masukkan password benar. 3. Klik tombol Masuk.',
      testData: 'Email: user@example.com | Password: P@ssw0rd!',
      expected: 'Pengguna diarahkan ke halaman dashboard; sesi berhasil dibuat.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-002',
      scenario: 'Login gagal dengan password yang salah',
      type: 'Negatif',
      precondition: 'Akun terdaftar di sistem; halaman login terbuka',
      steps: '1. Masukkan email valid. 2. Masukkan password salah. 3. Klik tombol Masuk.',
      testData: 'Email: user@example.com | Password: WrongPass99',
      expected: 'Sistem menampilkan pesan error "Email atau password salah"; pengguna tetap di halaman login.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-003',
      scenario: 'Login dengan email yang tidak terdaftar',
      type: 'Negatif',
      precondition: 'Email tidak ada di database; halaman login terbuka',
      steps: '1. Masukkan email yang tidak terdaftar. 2. Masukkan password sembarang. 3. Klik Masuk.',
      testData: 'Email: unknown@test.com | Password: AnyPass123',
      expected: 'Sistem menampilkan pesan error; tidak mengungkap apakah email terdaftar atau tidak.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-004',
      scenario: 'Login dengan format email tidak valid',
      type: 'Negatif',
      precondition: 'Halaman login terbuka',
      steps: '1. Masukkan string bukan format email. 2. Masukkan password. 3. Klik Masuk.',
      testData: 'Email: bukan-email | Password: P@ssw0rd!',
      expected: 'Sistem menampilkan validasi "Format email tidak valid" sebelum request dikirim.',
      priority: 'Sedang',
    },
    {
      id: 'TC-005',
      scenario: `Login gagal ${failLimit} kali berturut-turut (batas percobaan)`,
      type: 'Edge',
      precondition: `Akun terdaftar; sistem membatasi percobaan login maksimal ${failLimit} kali`,
      steps: `1. Lakukan ${failLimit} kali login dengan password salah berturut-turut. 2. Amati respons sistem.`,
      testData: `Password salah × ${failLimit}: WrongPass1 s.d. WrongPass${failLimit}`,
      expected: lockExpected,
      priority: 'Sedang',
    },
    {
      id: 'TC-006',
      // Verify that a failed attempt count below the limit does NOT lock the account
      scenario: `Login ${failLimit - 1} kali gagal lalu berhasil (di bawah batas penguncian)`,
      type: 'Positif',
      precondition: `Akun terdaftar; batas penguncian ${failLimit} kali gagal berturut-turut`,
      steps: `1. Lakukan ${failLimit - 1} kali login dengan password salah. 2. Masukkan password benar. 3. Klik Masuk.`,
      testData: `Password salah × ${failLimit - 1}: WrongPass1 s.d. WrongPass${failLimit - 1} | lalu password benar: P@ssw0rd!`,
      expected: 'Akun tidak terkunci; login dengan password benar berhasil dan pengguna masuk ke dashboard.',
      priority: 'Sedang',
    },
    {
      id: 'TC-007',
      scenario: lockMinutes
        ? `Login berhasil setelah masa penguncian ${lockMinutes} menit selesai`
        : 'Login berhasil setelah masa penguncian selesai',
      type: 'Positif',
      precondition: lockMinutes
        ? `Akun terkunci setelah ${failLimit} kali gagal; masa kunci ${lockMinutes} menit telah berlalu`
        : `Akun terkunci setelah ${failLimit} kali gagal; masa kunci telah berlalu`,
      steps: lockMinutes
        ? `1. Tunggu ${lockMinutes} menit sejak penguncian. 2. Masukkan kredensial valid. 3. Klik Masuk.`
        : '1. Tunggu hingga masa penguncian berakhir. 2. Masukkan kredensial valid. 3. Klik Masuk.',
      testData: 'Email: user@example.com | Password: P@ssw0rd!',
      expected: 'Akun tidak lagi terkunci; login berhasil dan pengguna diarahkan ke dashboard.',
      priority: 'Sedang',
    },
    {
      id: 'TC-008',
      scenario: 'Login berhasil setelah sesi sebelumnya berakhir (expired)',
      type: 'Edge',
      precondition: 'Pengguna pernah login; sesi sudah expired',
      steps: '1. Buka halaman login setelah sesi expired. 2. Masukkan kredensial valid. 3. Klik Masuk.',
      testData: 'Email: user@example.com | Password: P@ssw0rd!',
      expected: 'Sesi baru berhasil dibuat; pengguna diarahkan ke dashboard tanpa error.',
      priority: 'Sedang',
    },
  ];

  // ── Password boundary-value test cases ──────────────────────
  // Built via a helper so the string lengths are always mathematically correct.
  // makePassword(n) returns a string of exactly n characters.
  if (c.passwordMin) {
    const min = c.passwordMin;

    /**
     * Returns a password string of exactly `len` characters.
     * Uses uppercase letters filled with 'A', then ends with '@' to
     * satisfy common "must contain special char" policies.
     * len must be >= 1.
     */
    function makePassword(len) {
      if (len <= 0) return '';
      if (len === 1) return '@';
      // Fill (len - 1) slots with 'A', close with '@'
      return 'A'.repeat(len - 1) + '@';
    }

    const pwExact = makePassword(min);       // exactly min chars
    const pwBelow = makePassword(min - 1);   // exactly min−1 chars

    baseTC.push({
      id: `TC-${String(baseTC.length + 1).padStart(3, '0')}`,
      scenario: `Password tepat di batas minimum (${min} karakter)`,
      type: 'Edge',
      precondition: `Halaman login terbuka; kebijakan password: minimal ${min} karakter`,
      steps: `1. Masukkan password dengan tepat ${min} karakter. 2. Klik Masuk.`,
      testData: `Password: ${pwExact} (${pwExact.length} karakter)`,
      expected: 'Sistem menerima password; proses login berlanjut.',
      priority: 'Sedang',
    });
    baseTC.push({
      id: `TC-${String(baseTC.length + 1).padStart(3, '0')}`,
      scenario: `Password satu karakter di bawah batas minimum (${min - 1} karakter)`,
      type: 'Negatif',
      precondition: `Halaman login terbuka; kebijakan password: minimal ${min} karakter`,
      steps: `1. Masukkan password dengan ${min - 1} karakter. 2. Klik Masuk.`,
      testData: `Password: ${pwBelow} (${pwBelow.length} karakter)`,
      expected: `Sistem menampilkan validasi "Password minimal ${min} karakter"; proses dihentikan.`,
      priority: 'Tinggi',
    });
  }

  // Re-number IDs sequentially after all optional additions
  baseTC.forEach((tc, i) => { tc.id = `TC-${String(i + 1).padStart(3, '0')}`; });

  const universals = getUniversalTestCases(baseTC.length + 1);
  return { featureType: 'Login / Autentikasi', testCases: [...baseTC, ...universals] };
}

// ── Form Pendaftaran ─────────────────────────────────────────

/**
 * Generates test cases for registration / form features.
 * Extracts passwordMin from the description when present.
 * @param {string} desc
 * @returns {{ featureType: string, testCases: Array<Object> }}
 */
function generateFormTestCases(desc) {
  const c = parseConstraints(desc);

  const baseTC = [
    {
      id: 'TC-001',
      scenario: 'Pendaftaran berhasil dengan semua data valid',
      type: 'Positif',
      precondition: 'Halaman registrasi terbuka; email belum terdaftar',
      steps: '1. Isi seluruh field dengan data valid. 2. Klik tombol Daftar.',
      testData: 'Nama: Budi Santoso | Email: budi@test.com | Password: Secure#123',
      expected: 'Akun berhasil dibuat; pengguna menerima email konfirmasi dan diarahkan ke halaman sukses.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-002',
      scenario: 'Pendaftaran gagal karena email sudah digunakan',
      type: 'Negatif',
      precondition: 'Email sudah terdaftar di sistem',
      steps: '1. Isi semua field dengan email yang sudah ada. 2. Klik tombol Daftar.',
      testData: 'Email: existing@test.com | Password: Secure#123',
      expected: 'Sistem menampilkan pesan "Email sudah digunakan"; formulir tidak terkirim.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-003',
      scenario: c.passwordMin
        ? `Password tidak memenuhi batas minimum (${c.passwordMin} karakter)`
        : 'Password tidak memenuhi syarat minimum',
      type: 'Negatif',
      precondition: c.passwordMin
        ? `Halaman registrasi terbuka; kebijakan password: minimal ${c.passwordMin} karakter`
        : 'Halaman registrasi terbuka; kebijakan password minimal aktif',
      steps: '1. Isi field password dengan string terlalu pendek. 2. Klik Daftar.',
      testData: c.passwordMin
        ? `Password: ${'x'.repeat(c.passwordMin - 2)} (${c.passwordMin - 2} karakter)`
        : 'Password: abc (3 karakter)',
      expected: c.passwordMin
        ? `Sistem menampilkan validasi "Password minimal ${c.passwordMin} karakter".`
        : 'Sistem menampilkan validasi "Password terlalu pendek/tidak memenuhi syarat".',
      priority: 'Tinggi',
    },
    {
      id: 'TC-004',
      scenario: 'Konfirmasi password tidak cocok dengan password',
      type: 'Negatif',
      precondition: 'Halaman registrasi terbuka; terdapat field konfirmasi password',
      steps: '1. Isi password dan konfirmasi password dengan nilai berbeda. 2. Klik Daftar.',
      testData: 'Password: Secure#123 | Konfirmasi: Different#456',
      expected: 'Sistem menampilkan validasi "Password tidak cocok" sebelum data dikirim.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-005',
      scenario: 'Format email tidak valid pada form pendaftaran',
      type: 'Negatif',
      precondition: 'Halaman registrasi terbuka',
      steps: '1. Masukkan format email tidak valid. 2. Klik Daftar.',
      testData: 'Email: bukan_email_valid',
      expected: 'Sistem menampilkan pesan validasi format email.',
      priority: 'Sedang',
    },
    {
      id: 'TC-006',
      scenario: 'Nama pengguna melebihi batas panjang karakter',
      type: 'Edge',
      precondition: 'Halaman registrasi terbuka',
      steps: '1. Masukkan nama dengan 256 karakter atau lebih. 2. Klik Daftar.',
      testData: 'Nama: A × 256 karakter',
      expected: 'Sistem memotong atau menolak input melebihi batas; tidak terjadi crash atau data truncation diam-diam.',
      priority: 'Rendah',
    },
  ];

  // ── Password boundary-value test cases ──────────────────────
  // makePassword(len) produces a string of exactly `len` characters.
  if (c.passwordMin) {
    const min = c.passwordMin;

    function makePassword(len) {
      if (len <= 0) return '';
      if (len === 1) return '@';
      return 'A'.repeat(len - 1) + '@';
    }

    const pwExact = makePassword(min);       // exactly min chars
    const pwBelow = makePassword(min - 1);   // exactly min−1 chars

    baseTC.push({
      id: `TC-${String(baseTC.length + 1).padStart(3, '0')}`,
      scenario: `Password tepat di batas minimum (${min} karakter)`,
      type: 'Edge',
      precondition: `Halaman registrasi terbuka; kebijakan password: minimal ${min} karakter`,
      steps: `1. Masukkan password dengan tepat ${min} karakter. 2. Klik Daftar.`,
      testData: `Password: ${pwExact} (${pwExact.length} karakter)`,
      expected: 'Sistem menerima password; proses pendaftaran berlanjut.',
      priority: 'Sedang',
    });
    baseTC.push({
      id: `TC-${String(baseTC.length + 1).padStart(3, '0')}`,
      scenario: `Password satu karakter di bawah batas minimum (${min - 1} karakter)`,
      type: 'Negatif',
      precondition: `Halaman registrasi terbuka; kebijakan password: minimal ${min} karakter`,
      steps: `1. Masukkan password dengan ${min - 1} karakter. 2. Klik Daftar.`,
      testData: `Password: ${pwBelow} (${pwBelow.length} karakter)`,
      expected: `Sistem menampilkan validasi "Password minimal ${min} karakter"; pendaftaran dihentikan.`,
      priority: 'Tinggi',
    });
  }

  baseTC.forEach((tc, i) => { tc.id = `TC-${String(i + 1).padStart(3, '0')}`; });

  const universals = getUniversalTestCases(baseTC.length + 1);
  return { featureType: 'Form Pendaftaran / Registrasi', testCases: [...baseTC, ...universals] };
}

// ── Upload File ──────────────────────────────────────────────

/**
 * Generates test cases for file/photo upload features.
 * Extracts maxFileMB and formats from the description when present.
 * @param {string} desc
 * @returns {{ featureType: string, testCases: Array<Object> }}
 */
function generateUploadTestCases(desc) {
  const c = parseConstraints(desc);
  const maxSize    = c.maxFileMB    ? `${c.maxFileMB} ${c.maxFileSuffix}` : '2 MB';
  const maxNum     = c.maxFileMB    || '2';
  const maxSuffix  = c.maxFileSuffix || 'MB';
  const fmtList    = c.formats      ? c.formats.join('/') : 'JPG/PNG/GIF';
  const overSize   = c.maxFileMB    ? `${parseFloat(c.maxFileMB) * 2} ${maxSuffix}` : '5 MB';

  const baseTC = [
    {
      id: 'TC-001',
      scenario: `Upload berhasil dengan format ${fmtList} dan ukuran di bawah ${maxSize}`,
      type: 'Positif',
      precondition: `Pengguna sudah login; format yang diterima: ${fmtList}; batas ukuran ${maxSize}`,
      steps: `1. Pilih file berformat ${fmtList.split('/')[0]}. 2. Pastikan ukuran di bawah ${maxSize}. 3. Klik Unggah.`,
      testData: `File: photo.jpg (${parseFloat(maxNum) * 0.6} ${maxSuffix})`,
      expected: 'File berhasil diunggah; preview/thumbnail ditampilkan; pesan sukses muncul.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-002',
      scenario: 'Upload gagal karena format file tidak didukung',
      type: 'Negatif',
      precondition: `Pengguna sudah login; hanya format ${fmtList} yang diizinkan`,
      steps: '1. Pilih file berformat .exe atau .pdf. 2. Klik Unggah.',
      testData: 'File: document.exe',
      expected: `Sistem menampilkan pesan error "Format file tidak didukung"; hanya ${fmtList} yang diterima.`,
      priority: 'Tinggi',
    },
    {
      id: 'TC-003',
      scenario: `Upload gagal karena ukuran file melebihi batas ${maxSize}`,
      type: 'Negatif',
      precondition: `Pengguna sudah login; batas ukuran file ${maxSize}`,
      steps: `1. Pilih file berukuran lebih dari ${maxSize}. 2. Klik Unggah.`,
      testData: `File: large_photo.jpg (${overSize})`,
      expected: `Sistem menampilkan pesan error "Ukuran file melebihi ${maxSize}"; upload dibatalkan.`,
      priority: 'Tinggi',
    },
    {
      id: 'TC-004',
      scenario: 'Upload tanpa memilih file',
      type: 'Negatif',
      precondition: 'Pengguna sudah login; halaman upload terbuka',
      steps: '1. Klik tombol Unggah tanpa memilih file apapun.',
      testData: '(tidak ada file dipilih)',
      expected: 'Sistem menampilkan pesan validasi "Pilih file terlebih dahulu".',
      priority: 'Sedang',
    },
    {
      id: 'TC-005',
      scenario: `Upload file dengan ukuran tepat di batas maksimum ${maxSize} (boundary value)`,
      type: 'Edge',
      precondition: `Pengguna sudah login; batas ukuran ${maxSize}`,
      steps: `1. Pilih file berukuran tepat ${maxSize}. 2. Klik Unggah.`,
      testData: `File: exact_limit.jpg (${maxNum} ${maxSuffix} — tepat di batas)`,
      expected: 'File berhasil diunggah (batas inklusif) atau ditolak dengan pesan jelas (batas eksklusif).',
      priority: 'Sedang',
    },
    {
      id: 'TC-006',
      scenario: 'Upload file dengan nama mengandung karakter spesial',
      type: 'Edge',
      precondition: 'Pengguna sudah login',
      steps: '1. Pilih file dengan nama seperti "foto #1 (copy).jpg". 2. Klik Unggah.',
      testData: 'File: foto #1 (copy).jpg',
      expected: 'Sistem menerima atau menyanitasi nama file; tidak terjadi error server.',
      priority: 'Rendah',
    },
  ];

  baseTC.forEach((tc, i) => { tc.id = `TC-${String(i + 1).padStart(3, '0')}`; });

  const universals = getUniversalTestCases(baseTC.length + 1);
  return { featureType: 'Upload File / Foto', testCases: [...baseTC, ...universals] };
}

// ── Pembayaran ───────────────────────────────────────────────

/**
 * Generates test cases for payment/transaction features.
 * Extracts maxNominal from the description when present.
 * @param {string} desc
 * @returns {{ featureType: string, testCases: Array<Object> }}
 */
function generatePaymentTestCases(desc) {
  const c = parseConstraints(desc);
  const maxNominal = c.maxNominal ? `Rp ${c.maxNominal}` : 'Rp 50.000.000';

  const baseTC = [
    {
      id: 'TC-001',
      scenario: 'Pembayaran berhasil dengan saldo mencukupi dan nominal valid',
      type: 'Positif',
      precondition: 'Pengguna sudah login; saldo/kartu valid dan mencukupi',
      steps: '1. Masukkan nominal transaksi valid. 2. Pilih metode pembayaran. 3. Konfirmasi transaksi.',
      testData: 'Nominal: Rp 50.000 | Metode: Transfer Bank',
      expected: 'Transaksi berhasil; saldo berkurang sesuai nominal; bukti pembayaran ditampilkan.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-002',
      scenario: 'Pembayaran gagal karena saldo tidak mencukupi',
      type: 'Negatif',
      precondition: 'Pengguna sudah login; saldo kurang dari nominal transaksi',
      steps: '1. Masukkan nominal melebihi saldo. 2. Konfirmasi transaksi.',
      testData: 'Nominal: Rp 500.000 | Saldo tersedia: Rp 10.000',
      expected: 'Sistem menampilkan pesan error "Saldo tidak mencukupi"; transaksi dibatalkan.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-003',
      scenario: 'Pembayaran dengan nominal nol atau bernilai negatif',
      type: 'Negatif',
      precondition: 'Pengguna sudah login; halaman pembayaran terbuka',
      steps: '1. Masukkan nominal Rp 0 atau nominal negatif. 2. Konfirmasi transaksi.',
      testData: 'Nominal: Rp 0 | Nominal: -Rp 10.000',
      expected: 'Sistem menampilkan validasi "Nominal harus lebih dari nol"; transaksi tidak diproses.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-004',
      scenario: 'Pembayaran ke nomor rekening/tujuan tidak valid',
      type: 'Negatif',
      precondition: 'Pengguna sudah login; field nomor rekening tujuan tersedia',
      steps: '1. Masukkan nomor rekening tujuan yang tidak terdaftar. 2. Konfirmasi transaksi.',
      testData: 'Rekening tujuan: 0000000000',
      expected: 'Sistem menampilkan pesan "Rekening tujuan tidak ditemukan"; transaksi dibatalkan.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-005',
      scenario: 'Pembayaran duplikat dalam waktu singkat (double-submit)',
      type: 'Edge',
      precondition: 'Pengguna sudah login; saldo mencukupi',
      steps: '1. Klik tombol Bayar dua kali secara cepat (double-click atau double-submit).',
      testData: 'Nominal: Rp 50.000 (dua kali submit berturut-turut)',
      expected: 'Sistem memproses hanya satu transaksi; transaksi duplikat ditolak atau diabaikan.',
      priority: 'Sedang',
    },
    {
      id: 'TC-006',
      scenario: `Pembayaran tepat di batas nominal maksimum (${maxNominal})`,
      type: 'Edge',
      precondition: `Pengguna sudah login; batas nominal maksimum per transaksi ${maxNominal}`,
      steps: `1. Masukkan nominal tepat ${maxNominal}. 2. Konfirmasi transaksi.`,
      testData: `Nominal: ${maxNominal} (tepat di batas maksimum)`,
      expected: 'Transaksi berhasil diproses atau ditolak dengan pesan jelas sesuai kebijakan batas.',
      priority: 'Sedang',
    },
  ];

  baseTC.forEach((tc, i) => { tc.id = `TC-${String(i + 1).padStart(3, '0')}`; });

  const universals = getUniversalTestCases(baseTC.length + 1);
  return { featureType: 'Pembayaran / Transaksi', testCases: [...baseTC, ...universals] };
}

// ── Generic / Unknown ────────────────────────────────────────

/**
 * Generates a generic set of test cases when no keyword is matched.
 * @returns {{ featureType: string, testCases: Array<Object> }}
 */
function generateGenericTestCases() {
  const baseTC = [
    {
      id: 'TC-001',
      scenario: 'Operasi utama berhasil dengan input valid',
      type: 'Positif',
      precondition: 'Sistem dalam kondisi normal; pengguna memiliki akses yang diperlukan',
      steps: '1. Buka fitur yang dimaksud. 2. Masukkan semua data yang valid. 3. Eksekusi aksi utama.',
      testData: 'Data valid sesuai kebutuhan fitur',
      expected: 'Operasi berhasil; sistem memberikan respons positif / data tersimpan / tujuan tercapai.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-002',
      scenario: 'Aksi tanpa memenuhi pra-kondisi yang diperlukan',
      type: 'Negatif',
      precondition: 'Pengguna tidak memiliki hak akses atau pra-kondisi tidak terpenuhi',
      steps: '1. Coba akses atau eksekusi fitur tanpa pra-kondisi yang benar.',
      testData: 'Pengguna tidak terautentikasi / data tidak lengkap',
      expected: 'Sistem menolak aksi; menampilkan pesan error yang sesuai.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-003',
      scenario: 'Field wajib tidak diisi saat submit',
      type: 'Negatif',
      precondition: 'Fitur memiliki setidaknya satu field input wajib',
      steps: '1. Biarkan field wajib kosong. 2. Coba submit/eksekusi.',
      testData: '(field wajib: kosong)',
      expected: 'Sistem menampilkan pesan validasi untuk setiap field wajib yang kosong.',
      priority: 'Tinggi',
    },
    {
      id: 'TC-004',
      scenario: 'Input melebihi panjang maksimum yang diizinkan',
      type: 'Edge',
      precondition: 'Fitur memiliki field teks dengan batasan panjang karakter',
      steps: '1. Masukkan teks melebihi batas karakter yang ditetapkan. 2. Submit.',
      testData: 'String 500 karakter pada field dengan batas 255',
      expected: 'Sistem memotong input atau menampilkan pesan validasi batas karakter.',
      priority: 'Sedang',
    },
  ];

  const universals = getUniversalTestCases(baseTC.length + 1);
  return { featureType: 'Umum (tidak terdeteksi)', testCases: [...baseTC, ...universals] };
}

// ── Keyword Detector ─────────────────────────────────────────

/**
 * Detects which feature type the user description belongs to, then
 * delegates to the appropriate generator function.
 * @param {string} description - Raw input from the user.
 * @returns {{ featureType: string, testCases: Array<Object>, isGeneric: boolean }}
 */
function detectAndGenerate(description) {
  const lower = description.toLowerCase();

  // Keyword groups per feature type
  const keywords = {
    login   : ['login', 'masuk', 'password', 'kata sandi', 'signin', 'sign in', 'autentikasi', 'kredensial'],
    form    : ['daftar', 'registrasi', 'register', 'signup', 'sign up', 'pendaftaran', 'formulir', 'form'],
    upload  : ['upload', 'unggah', 'foto', 'file', 'gambar', 'image', 'attachment', 'lampiran'],
    payment : ['bayar', 'pembayaran', 'transfer', 'transaksi', 'checkout', 'cicilan', 'tagihan', 'saldo'],
  };

  const matched = Object.keys(keywords).find(key =>
    keywords[key].some(kw => lower.includes(kw))
  );

  switch (matched) {
    case 'login'   : return { ...generateLoginTestCases(description),   isGeneric: false };
    case 'form'    : return { ...generateFormTestCases(description),    isGeneric: false };
    case 'upload'  : return { ...generateUploadTestCases(description),  isGeneric: false };
    case 'payment' : return { ...generatePaymentTestCases(description), isGeneric: false };
    default        : return { ...generateGenericTestCases(),            isGeneric: true  };
  }
}

// ── Response Builder ─────────────────────────────────────────

/**
 * Builds the full agent reply HTML from a generation result.
 * featureType is a trusted internal constant — no escaping needed there.
 * @param {{ featureType: string, testCases: Array, isGeneric: boolean }} result
 * @returns {string} HTML
 */
function buildAgentReplyHTML(result) {
  const { featureType, testCases, isGeneric } = result;
  const count = testCases.length;

  const genericNote = isGeneric
    ? `<br><small style="color:#F97316;">&#9888;&#65039; Tidak ada kata kunci spesifik yang terdeteksi. Template umum digunakan — coba tambahkan kata seperti <em>login</em>, <em>daftar</em>, <em>upload</em>, atau <em>pembayaran</em> untuk hasil yang lebih spesifik.</small>`
    : '';

  const summary = `
    <p class="summary-text">
      Terdeteksi sebagai fitur <span class="badge-feature">${escapeHTML(featureType)}</span>
      — berhasil dibuat <span class="badge-count">${count} test case</span>.
      ${genericNote}
    </p>
  `;

  const table = buildTableHTML(testCases);
  return summary + table;
}

// ── Event Handlers ───────────────────────────────────────────

/**
 * Handles a submitted user message:
 * 1. Validates input is not empty.
 * 2. Escapes the raw text before inserting it into the user bubble.
 * 3. Generates the agent reply and shows it after the typing delay.
 */
function handleUserSubmit() {
  const rawText = featureInput.value.trim();
  if (!rawText) return;

  // Escape user text before inserting into innerHTML — prevents XSS in user bubble
  const safeText = escapeHTML(rawText).replace(/\n/g, '<br>');
  appendMessage('user', safeText);

  // Clear & reset textarea height
  featureInput.value = '';
  featureInput.style.height = 'auto';

  // Generate and display agent reply
  const result    = detectAndGenerate(rawText);
  const replyHTML = buildAgentReplyHTML(result);
  showTypingThenReply(replyHTML);
}

// Form submit (button click)
inputForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleUserSubmit();
});

// Enter to send; Shift+Enter for new line
featureInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleUserSubmit();
  }
});

// Auto-grow textarea as the user types
featureInput.addEventListener('input', () => {
  featureInput.style.height = 'auto';
  featureInput.style.height = `${featureInput.scrollHeight}px`;
});

// Quick example buttons — fill the textarea with preset text
quickButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    featureInput.value = btn.dataset.example;
    featureInput.style.height = 'auto';
    featureInput.style.height = `${featureInput.scrollHeight}px`;
    featureInput.focus();
  });
});

// ── Initial Agent Greeting ───────────────────────────────────

/**
 * Renders the first message from the agent on page load.
 * This HTML is a trusted static string — no user input involved.
 */
function showGreeting() {
  const greetingHTML = `
    <p>Halo! &#128075; Saya <strong>TestCase Buddy</strong>, asisten AI untuk membantu Anda membuat test case dari deskripsi fitur.</p>
    <br>
    <p>Cukup ketikkan deskripsi fitur yang ingin diuji, contohnya:</p>
    <br>
    <p style="background:#EFF6FF;border-left:3px solid #2563EB;padding:8px 12px;border-radius:0 6px 6px 0;font-size:0.85rem;color:#1E40AF;">
      <em>"Fitur login menggunakan email dan password. Pengguna harus bisa masuk ke akun dengan kredensial yang benar. Sistem harus menolak login jika password salah. Password minimal 8 karakter."</em>
    </p>
    <br>
    <p>Saya mendukung deteksi otomatis untuk fitur: <strong>Login</strong>, <strong>Pendaftaran</strong>, <strong>Upload File</strong>, dan <strong>Pembayaran</strong>. Jika deskripsi menyebut aturan seperti <em>"minimal 8 karakter"</em> atau <em>"batas 2 MB"</em>, aturan tersebut akan otomatis masuk ke test case! &#128640;</p>
  `;
  appendMessage('agent', greetingHTML);
}

// Kick things off
showGreeting();
