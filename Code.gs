/*******************************************************
 * SISTEM DAFTAR HADIR KAMPUS - GOOGLE APPS SCRIPT
 * Backend: Code.gs
 *
 * Cara kerja:
 * 1. Script ini dipasang sebagai Apps Script yang TERIKAT
 *    (bound) pada Google Spreadsheet.
 * 2. Jalankan setupDatabase() sekali dari editor Apps Script.
 * 3. Deploy > New deployment > Web app.
 * 4. Execute as: Me
 * 5. Who has access: Anyone / Anyone with Google account
 *    sesuai kebutuhan kampus.
 *******************************************************/

const APP = {
  SHEETS: {
    USERS: 'Users',
    ATTENDANCE: 'Attendance',
    SETTINGS: 'Settings',
    POSITIONS: 'Positions',
    LOGS: 'Logs'
  },
  DRIVE_FOLDER: 'Daftar Hadir - Bukti Selfie',
  SESSION_SECONDS: 21600 // 6 jam
};

/* =========================
   WEB APP
========================= */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Sistem Daftar Hadir Kampus')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* =========================
   DATABASE SETUP
========================= */

function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Buka Apps Script dari Google Spreadsheet kampus.');

  const definitions = {
    [APP.SHEETS.USERS]: [
      'ID', 'PasswordHash', 'Nama', 'Email', 'Role',
      'Jabatan', 'SubUnit', 'Status', 'CreatedAt', 'UpdatedAt'
    ],
    [APP.SHEETS.ATTENDANCE]: [
      'ID', 'Tanggal', 'Waktu', 'UserID', 'Nama', 'Role',
      'Jabatan', 'SubUnit', 'Jenis', 'Status', 'Latitude',
      'Longitude', 'MapsURL', 'SelfieURL', 'Keterangan', 'CreatedAt'
    ],
    [APP.SHEETS.SETTINGS]: [
      'Key', 'Value', 'UpdatedAt'
    ],
    [APP.SHEETS.POSITIONS]: [
      'Jabatan', 'SubUnit', 'Aktif', 'Urutan'
    ],
    [APP.SHEETS.LOGS]: [
      'Timestamp', 'UserID', 'Nama', 'Action', 'Detail'
    ]
  };

  Object.keys(definitions).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);

    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, definitions[name].length)
        .setValues([definitions[name]]);
      formatHeader_(sh, definitions[name].length);
    }
  });

  seedSettings_();
  seedPositions_();
  seedAdmin_();

  SpreadsheetApp.flush();
  return {
    ok: true,
    message: 'Database berhasil dibuat/diperiksa.',
    spreadsheetId: ss.getId()
  };
}

function formatHeader_(sh, cols) {
  sh.getRange(1, 1, 1, cols)
    .setFontWeight('bold')
    .setBackground('#0B5ED7')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, cols);
}

function seedSettings_() {
  const sh = getSheet_(APP.SHEETS.SETTINGS);
  const existing = getRecords_(sh);

  const defaults = [
    ['campus_name', 'Institut / Sekolah Tinggi Anda'],
    ['campus_logo', ''],
    ['campus_address', ''],
    ['work_start', '08:00'],
    ['work_end', '16:00']
  ];

  defaults.forEach(([key, value]) => {
    if (!existing.some(r => r.Key === key)) {
      sh.appendRow([key, value, now_()]);
    }
  });
}

function seedPositions_() {
  const sh = getSheet_(APP.SHEETS.POSITIONS);
  if (sh.getLastRow() > 1) return;

  const rows = [
    ['Pimpinan', 'Rektor', true, 1],
    ['Pimpinan', 'Warek I', true, 2],
    ['Pimpinan', 'Warek II', true, 3],
    ['Pimpinan', 'Warek III', true, 4],
    ['Dosen', '', true, 5],
    ['Staf', 'Cleaning Service', true, 6],
    ['Staf', 'IT Center', true, 7],
    ['Staf', 'Keuangan', true, 8]
  ];
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
}

function seedAdmin_() {
  const sh = getSheet_(APP.SHEETS.USERS);
  const values = sh.getDataRange().getValues();
  const hasAdmin = values.slice(1).some(r => String(r[4]).toLowerCase() === 'admin');
  if (hasAdmin) return;

  sh.appendRow([
    'admin',
    hashPassword_('admin'),
    'Administrator',
    '',
    'admin',
    'Administrator',
    '',
    'Aktif',
    now_(),
    now_()
  ]);
}

/* =========================
   AUTHENTICATION
========================= */

function login(payload) {
  payload = payload || {};
  const id = clean_(payload.id);
  const password = String(payload.password || '');
  const selectedRole = clean_(payload.role).toLowerCase();

  if (!id || !password) throw new Error('ID dan password wajib diisi.');

  const user = findUser_(id);
  if (!user) throw new Error('ID atau password tidak sesuai.');

  if (String(user.Status).toLowerCase() !== 'aktif') {
    throw new Error('Akun tidak aktif. Hubungi administrator.');
  }

  if (!['user', 'admin'].includes(selectedRole)) {
    throw new Error('Tipe akses login tidak valid.');
  }

  if (String(user.Role).toLowerCase() !== selectedRole) {
    throw new Error('Tipe akses tidak sesuai dengan akun.');
  }

  if (hashPassword_(password) !== String(user.PasswordHash)) {
    throw new Error('ID atau password tidak sesuai.');
  }

  const token = createSession_(user);
  logAction_(user.ID, user.Nama, 'LOGIN', 'Login berhasil');

  return {
    ok: true,
    token,
    user: sanitizeUser_(user),
    settings: getSettings_(),
    positions: getPositions_()
  };
}

function registerUser(payload) {
  payload = payload || {};

  const id = clean_(payload.id);
  const password = String(payload.password || '');
  const name = clean_(payload.name);
  const email = clean_(payload.email);
  const jabatan = clean_(payload.jabatan);
  const subUnit = clean_(payload.subUnit);

  if (!id || !password || !name || !jabatan) {
    throw new Error('ID, password, nama, dan jabatan wajib diisi.');
  }

  if (id.toLowerCase() === 'admin') {
    throw new Error('ID admin sudah digunakan.');
  }

  if (password.length < 4) {
    throw new Error('Password minimal 4 karakter.');
  }

  if (findUser_(id)) throw new Error('ID sudah terdaftar.');

  if (jabatan === 'Pimpinan' && !['Rektor', 'Warek I', 'Warek II', 'Warek III'].includes(subUnit)) {
    throw new Error('Sub-unit Pimpinan tidak valid.');
  }

  const sh = getSheet_(APP.SHEETS.USERS);
  sh.appendRow([
    id,
    hashPassword_(password),
    name,
    email,
    'user',
    jabatan,
    jabatan === 'Pimpinan' ? subUnit : subUnit,
    'Aktif',
    now_(),
    now_()
  ]);

  logAction_(id, name, 'REGISTER', 'Registrasi akun baru');

  return { ok: true, message: 'Registrasi berhasil. Silakan login.' };
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('SESSION_' + token);
  return { ok: true };
}

function getSession_(token) {
  if (!token) throw new Error('Sesi tidak ditemukan.');
  const raw = CacheService.getScriptCache().get('SESSION_' + token);
  if (!raw) throw new Error('Sesi berakhir. Silakan login kembali.');
  return JSON.parse(raw);
}

function createSession_(user) {
  const token = Utilities.getUuid();
  const session = {
    id: user.ID,
    role: user.Role,
    name: user.Nama,
    exp: Date.now() + APP.SESSION_SECONDS * 1000
  };

  CacheService.getScriptCache()
    .put('SESSION_' + token, JSON.stringify(session), APP.SESSION_SECONDS);

  return token;
}

/* =========================
   DASHBOARD / APP DATA
========================= */

function getAppData(token) {
  const session = getSession_(token);
  return {
    user: session,
    settings: getSettings_(),
    positions: getPositions_(),
    users: session.role === 'admin' ? getUsersForAdmin_() : [],
    attendance: getAttendance_(session.role === 'admin' ? null : session.id)
  };
}

function getSettings() {
  return getSettings_();
}

function getSettings_() {
  const sh = getSheet_(APP.SHEETS.SETTINGS);
  const rows = getRecords_(sh);
  const out = {};
  rows.forEach(r => out[r.Key] = r.Value);
  return out;
}

function getPositions_() {
  const sh = getSheet_(APP.SHEETS.POSITIONS);
  return getRecords_(sh)
    .filter(r => String(r.Aktif).toLowerCase() !== 'false')
    .sort((a, b) => Number(a.Urutan) - Number(b.Urutan));
}

function getUsersForAdmin_() {
  return getRecords_(getSheet_(APP.SHEETS.USERS)).map(sanitizeUser_);
}

function saveSettings(token, payload) {
  const session = getSession_(token);
  requireAdmin_(session);

  payload = payload || {};
  const allowed = ['campus_name', 'campus_logo', 'campus_address', 'work_start', 'work_end'];
  const sh = getSheet_(APP.SHEETS.SETTINGS);
  const data = sh.getDataRange().getValues();

  allowed.forEach(key => {
    if (!(key in payload)) return;
    let found = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === key) {
        sh.getRange(i + 1, 2, 1, 2).setValues([[String(payload[key] || ''), now_()]]);
        found = true;
        break;
      }
    }
    if (!found) sh.appendRow([key, String(payload[key] || ''), now_()]);
  });

  logAction_(session.id, session.name, 'SETTINGS_UPDATE', 'Pengaturan kampus diperbarui');
  return { ok: true, settings: getSettings_() };
}

/* =========================
   CHECK-IN / CHECK-OUT
========================= */

function checkIn(token, payload) {
  const session = getSession_(token);
  payload = payload || {};

  return recordPresence_(session, 'CHECK-IN', payload);
}

function checkOut(token, payload) {
  const session = getSession_(token);
  payload = payload || {};

  return recordPresence_(session, 'CHECK-OUT', payload);
}

function recordPresence_(session, type, payload) {
  const date = formatDate_(new Date());
  const existing = findTodayAttendance_(session.id);

  if (type === 'CHECK-IN' && existing.some(r => r.Jenis === 'CHECK-IN')) {
    throw new Error('Anda sudah melakukan check-in hari ini.');
  }

  if (type === 'CHECK-OUT' && !existing.some(r => r.Jenis === 'CHECK-IN')) {
    throw new Error('Lakukan check-in terlebih dahulu.');
  }

  if (type === 'CHECK-OUT' && existing.some(r => r.Jenis === 'CHECK-OUT')) {
    throw new Error('Anda sudah melakukan check-out hari ini.');
  }

  const selfieUrl = saveSelfie_(payload.selfie, session.id, session.name, type);

  const user = findUser_(session.id);
  const lat = Number(payload.latitude || 0);
  const lng = Number(payload.longitude || 0);

  const row = [
    Utilities.getUuid(),
    date,
    formatTime_(new Date()),
    session.id,
    session.name,
    session.role,
    user ? user.Jabatan : '',
    user ? user.SubUnit : '',
    'Kehadiran',
    type === 'CHECK-IN' ? 'Hadir' : 'Pulang',
    lat || '',
    lng || '',
    lat && lng ? 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng) : '',
    selfieUrl,
    clean_(payload.note),
    now_()
  ];

  getSheet_(APP.SHEETS.ATTENDANCE).appendRow(row);

  logAction_(session.id, session.name, type, 'Absensi dengan selfie');

  return {
    ok: true,
    message: type === 'CHECK-IN' ? 'Check-in berhasil.' : 'Check-out berhasil.',
    record: {
      date,
      time: row[2],
      type,
      status: row[9],
      latitude: lat || null,
      longitude: lng || null,
      mapsUrl: row[12],
      selfieUrl
    }
  };
}

/* =========================
   STATUS H / I / S / A
========================= */

function saveAttendanceStatus(token, payload) {
  const session = getSession_(token);
  requireAdmin_(session);

  payload = payload || {};
  const userId = clean_(payload.userId);
  const status = clean_(payload.status).toUpperCase();
  const note = clean_(payload.note);

  if (!userId) throw new Error('User wajib dipilih.');
  if (!['H', 'I', 'S', 'A'].includes(status)) {
    throw new Error('Status hanya H, I, S, atau A.');
  }

  const user = findUser_(userId);
  if (!user) throw new Error('User tidak ditemukan.');

  const date = payload.date ? parseDate_(payload.date) : new Date();
  const dateStr = formatDate_(date);

  // Remove previous manual status for the same user/date.
  removeManualStatus_(userId, dateStr);

  getSheet_(APP.SHEETS.ATTENDANCE).appendRow([
    Utilities.getUuid(),
    dateStr,
    formatTime_(new Date()),
    user.ID,
    user.Nama,
    user.Role,
    user.Jabatan,
    user.SubUnit,
    'Manual',
    status,
    '',
    '',
    '',
    '',
    note,
    now_()
  ]);

  logAction_(session.id, session.name, 'ATTENDANCE_STATUS',
    user.ID + ' => ' + status + ' (' + dateStr + ')');

  return { ok: true, message: 'Status absensi disimpan.' };
}

function removeManualStatus_(userId, dateStr) {
  const sh = getSheet_(APP.SHEETS.ATTENDANCE);
  const values = sh.getDataRange().getValues();

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    if (
      String(row[3]) === userId &&
      String(row[1]) === dateStr &&
      String(row[8]) === 'Manual'
    ) {
      sh.deleteRow(i + 1);
    }
  }
}

/* =========================
   REKAP
========================= */

function getReport(token, payload) {
  const session = getSession_(token);
  requireAdmin_(session);

  payload = payload || {};
  const mode = payload.mode === 'monthly' ? 'monthly' : 'daily';
  const date = payload.date ? parseDate_(payload.date) : new Date();

  let rows;
  if (mode === 'monthly') {
    const month = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
    rows = getAttendance_(null).filter(r => String(r.Tanggal).indexOf(month) === 0);
  } else {
    const day = formatDate_(date);
    rows = getAttendance_(null).filter(r => String(r.Tanggal) === day);
  }

  const users = getUsersForAdmin_();

  // Build a report row per user. Priority:
  // manual H/I/S/A > check-in/out evidence > A.
  const report = users
    .filter(u => u.role !== 'admin')
    .map(u => {
      const userRows = rows.filter(r => r.UserID === u.id);
      const manual = userRows.find(r => r.Jenis === 'Manual');

      let status = 'A';
      if (manual) status = manual.Status;
      else if (userRows.some(r => r.Status === 'Hadir')) status = 'H';

      return {
        id: u.id,
        nama: u.nama,
        jabatan: u.jabatan,
        subUnit: u.subUnit,
        status,
        checkIn: (userRows.find(r => r.Jenis === 'CHECK-IN') || {}).Waktu || '',
        checkOut: (userRows.find(r => r.Jenis === 'CHECK-OUT') || {}).Waktu || '',
        lokasi: (userRows.find(r => r.Jenis === 'CHECK-IN') || {}).MapsURL || '',
        selfie: (userRows.find(r => r.Jenis === 'CHECK-IN') || {}).SelfieURL || '',
        keterangan: manual ? manual.Keterangan : ''
      };
    });

  const summary = { H: 0, I: 0, S: 0, A: 0 };
  report.forEach(r => summary[r.status] = (summary[r.status] || 0) + 1);

  return {
    ok: true,
    mode,
    period: mode === 'monthly'
      ? Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMMM yyyy')
      : formatDate_(date),
    campus: getSettings_().campus_name || 'Kampus',
    summary,
    rows: report
  };
}

/* =========================
   ATTENDANCE QUERY
========================= */

function getAttendance_(userId) {
  const sh = getSheet_(APP.SHEETS.ATTENDANCE);
  const rows = getRecords_(sh);

  return rows
    .filter(r => !userId || r.UserID === userId)
    .sort((a, b) => String(b.Tanggal + b.Waktu).localeCompare(String(a.Tanggal + a.Waktu)));
}

function findTodayAttendance_(userId) {
  const today = formatDate_(new Date());
  return getAttendance_(userId).filter(r => String(r.Tanggal) === today);
}

/* =========================
   SELFIE / DRIVE
========================= */

function saveSelfie_(dataUrl, userId, name, type) {
  if (!dataUrl) return '';

  if (String(dataUrl).length > 7 * 1024 * 1024) {
    throw new Error('Foto terlalu besar. Gunakan foto maksimal sekitar 5 MB.');
  }

  const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Format selfie tidak valid.');

  const mime = match[1];
  const bytes = Utilities.base64Decode(match[2]);
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');

  const folder = getOrCreateDriveFolder_();
  const fileName = [
    formatDate_(new Date()),
    formatTime_(new Date()).replace(/:/g, '-'),
    userId,
    type
  ].join('_') + '.' + ext;

  const blob = Utilities.newBlob(bytes, mime, fileName);
  const file = folder.createFile(blob);

  // Link can be opened by people who have access to the Drive file.
  return file.getUrl();
}

function getOrCreateDriveFolder_() {
  const folders = DriveApp.getFoldersByName(APP.DRIVE_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(APP.DRIVE_FOLDER);
}

/* =========================
   USER ADMIN
========================= */

function updateUser(token, payload) {
  const session = getSession_(token);
  requireAdmin_(session);

  payload = payload || {};
  const userId = clean_(payload.id);
  const sh = getSheet_(APP.SHEETS.USERS);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === userId) {
      const row = i + 1;
      if (payload.nama != null) sh.getRange(row, 3).setValue(clean_(payload.nama));
      if (payload.email != null) sh.getRange(row, 4).setValue(clean_(payload.email));
      if (payload.jabatan != null) sh.getRange(row, 6).setValue(clean_(payload.jabatan));
      if (payload.subUnit != null) sh.getRange(row, 7).setValue(clean_(payload.subUnit));
      if (payload.status != null) sh.getRange(row, 8).setValue(clean_(payload.status));
      if (payload.password) sh.getRange(row, 2).setValue(hashPassword_(String(payload.password)));
      sh.getRange(row, 10).setValue(now_());

      logAction_(session.id, session.name, 'USER_UPDATE', 'Update user ' + userId);
      return { ok: true, message: 'Data pengguna diperbarui.' };
    }
  }

  throw new Error('Pengguna tidak ditemukan.');
}

function deleteUser(token, userId) {
  const session = getSession_(token);
  requireAdmin_(session);

  userId = clean_(userId);
  if (userId.toLowerCase() === 'admin') throw new Error('Akun admin tidak boleh dihapus.');

  const sh = getSheet_(APP.SHEETS.USERS);
  const values = sh.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === userId) {
      sh.deleteRow(i + 1);
      logAction_(session.id, session.name, 'USER_DELETE', 'Hapus user ' + userId);
      return { ok: true };
    }
  }

  throw new Error('Pengguna tidak ditemukan.');
}

/* =========================
   HELPERS
========================= */

function getSheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" belum ada. Jalankan setupDatabase().');
  return sh;
}

function getRecords_(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(String);
  return values.slice(1)
    .filter(row => row.some(v => v !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = normalizeCell_(row[i]));
      return obj;
    });
}

function normalizeCell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return v;
}

function findUser_(id) {
  const rows = getRecords_(getSheet_(APP.SHEETS.USERS));
  return rows.find(r => String(r.ID).toLowerCase() === String(id).toLowerCase()) || null;
}

function sanitizeUser_(u) {
  return {
    id: u.ID,
    nama: u.Nama,
    email: u.Email,
    role: u.Role,
    jabatan: u.Jabatan,
    subUnit: u.SubUnit,
    status: u.Status
  };
}

function requireAdmin_(session) {
  if (String(session.role).toLowerCase() !== 'admin') {
    throw new Error('Akses administrator diperlukan.');
  }
}

function hashPassword_(password) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );

  return digest.map(b => {
    const v = b < 0 ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function now_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTime_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm:ss');
}

function parseDate_(value) {
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) throw new Error('Tanggal tidak valid.');
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function logAction_(userId, name, action, detail) {
  try {
    getSheet_(APP.SHEETS.LOGS).appendRow([now_(), userId, name, action, detail]);
  } catch (e) {
    // Logging must not block the main operation.
  }
}
