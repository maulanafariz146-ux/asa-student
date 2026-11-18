const DATA_KEY = 'asa_school_demo_v1';
const SESSION_KEY = 'asa_school_demo_session_v1';
const DEMO_TEACHER_EMAIL = 'walas@asa.demo';
const DEMO_PARENT_EMAIL = 'ortu@asa.demo';
const DEMO_TEACHER_NAME = 'Bu Rina Pratiwi';
const DEMO_PARENT_NAME = 'Ibu Sari Wulandari';
const roleNames = { admin: 'Admin sekolah', teacher: 'Guru', parent: 'Wali murid' };
const studentStatuses = ['Hadir di Kelas', 'Istirahat/Kantin', 'Di UKS', 'Izin/Sakit', 'Menunggu Dijemput'];
const diaryCategories = ['Akademik', 'Sikap/Perilaku', 'Kelengkapan Belajar', 'Izin/Kesehatan'];
const leaveReasons = ['Sakit', 'Izin'];
const gradeNumbers = ['1', '2', '3', '4', '5', '6'];
const characterBadges = ['Bintang Literasi', 'Pahlawan Piket', 'Sahabat Baik', 'Penjelajah Sains', 'Berani Mencoba', 'Bintang Disiplin'];
const sectionTitles = {
    dashboard: 'Beranda',
    accounts: 'Akun & hak akses',
    school: 'Data sekolah & kelas',
    classes: 'Informasi kelas',
    importStudents: 'Unggah data siswa',
    diary: 'Buku penghubung',
    chat: 'Ruang chat',
    panduAI: 'ASA AI',
    calendar: 'Kalender akademik',
    child: 'Informasi anak'
};
const navigation = {
    admin: [
        ['dashboard', 'Beranda', 'fa-house'],
        ['accounts', 'Akun & hak akses', 'fa-user-shield'],
        ['school', 'Data sekolah & kelas', 'fa-school'],
        ['importStudents', 'Unggah data siswa', 'fa-file-csv'],
        ['calendar', 'Kalender akademik', 'fa-calendar-days']
    ],
    teacher: [
        ['dashboard', 'Beranda', 'fa-house'],
        ['classes', 'Informasi kelas', 'fa-chalkboard-user'],
        ['diary', 'Buku penghubung', 'fa-book-open'],
        ['chat', 'Ruang chat', 'fa-comments'],
        ['calendar', 'Kalender akademik', 'fa-calendar-days']
    ],
    parent: [
        ['dashboard', 'Beranda', 'fa-house'],
        ['child', 'Informasi anak', 'fa-child'],
        ['diary', 'Buku penghubung', 'fa-book-open'],
        ['chat', 'Ruang chat', 'fa-comments'],
        ['panduAI', 'ASA AI', 'fa-robot'],
        ['calendar', 'Kalender akademik', 'fa-calendar-days']
    ]
};

const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const makeId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dateOffset = offset => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return localDateValue(date);
};
const localDateValue = date => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
const formatDate = value => {
    if (!value) return 'Tanggal belum ditentukan';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const formatDateTime = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const statusFromLegacy = value => {
    if (studentStatuses.includes(value)) return value;
    if (value === 'Izin' || value === 'Sakit' || value === 'Izin/Sakit') return 'Izin/Sakit';
    return 'Hadir di Kelas';
};
const legacyAttendance = status => status === 'Izin/Sakit' ? 'Izin' : 'Hadir';
const statusTone = status => status === 'Hadir di Kelas' ? 'success' : status === 'Izin/Sakit' ? 'danger' : 'warning';
const parentAccountFor = student => data.accounts.find(account => account.role === 'parent' && account.childId === student.id) ||
    data.accounts.find(account => account.role === 'parent' && account.email === student.parentEmail);

function parseSchoolCSV(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '"' && quoted && text[index + 1] === '"') {
            cell += '"';
            index++;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (character === delimiter && !quoted) {
            row.push(cell.trim());
            cell = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && text[index + 1] === '\n') index++;
            row.push(cell.trim());
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += character;
        }
    }
    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
    if (quoted) throw new Error('Tanda kutip pada CSV tidak berpasangan.');
    if (rows.length < 2) throw new Error('CSV harus memiliki judul kolom dan setidaknya satu baris murid.');
    return rows;
}

function normalizeSchoolData(parsed) {
    parsed.permissionRequests = (Array.isArray(parsed.permissionRequests) ? parsed.permissionRequests : []).map(request => ({
        ...request,
        reason: request.reason === 'Sakit' ? 'Sakit' : 'Izin'
    }));
    parsed.messages = parsed.messages.map(message => ({ category: 'Informasi Umum', readAt: null, attachment: null, ...message }));
    parsed.panduChats = parsed.panduChats && typeof parsed.panduChats === 'object' ? parsed.panduChats : {};
    parsed.diary = parsed.diary.map(note => ({ category: 'Akademik', readAt: null, ...note }));
    parsed.events = parsed.events.map(item => ({
        ...item,
        time: item.time || '',
        location: String(item.location || '').replace(/\bKelas\s*([1-6])[A-Z]\b/gi, 'Kelas $1'),
        description: String(item.description || '').replace(/\bKelas\s*([1-6])[A-Z]\b/gi, 'Kelas $1')
    }));
    parsed.classes = parsed.classes.map(classroom => {
        const grade = /^(?:kelas\s*)?([1-6])(?:\s*[a-z])?$/i.exec(String(classroom.level || '')) ||
            /^(?:kelas\s*)?([1-6])(?:\s*[a-z])?$/i.exec(String(classroom.name || ''));
        if (!grade) return classroom;
        const level = `Kelas ${grade[1]}`;
        return { ...classroom, name: level, level };
    });
    parsed.students = parsed.students.map(student => {
        const status = statusFromLegacy(student.status || student.attendance);
        const parentAccount = parsed.accounts.find(account => account.email === student.parentEmail);
        return {
            ...student,
            nisn: student.nisn || student.nis || '',
            parentName: student.parentName || parentAccount?.name || '',
            parentPhone: student.parentPhone || '',
            status,
            attendance: legacyAttendance(status),
            attendanceRate: Number(student.attendanceRate) || (status === 'Hadir di Kelas' ? 100 : 95),
            badges: Array.isArray(student.badges) ? student.badges : []
        };
    });
    return parsed;
}

function createInitialData() {
    return {
        setupVersion: 3,
        school: { name: '', address: '', academicYear: '' },
        accounts: [
            { id: 'user-admin', name: 'Admin Sekolah', email: 'admin@asa.demo', role: 'admin', active: true },
            { id: 'user-demo-teacher', name: DEMO_TEACHER_NAME, email: DEMO_TEACHER_EMAIL, role: 'teacher', active: true },
            { id: 'user-demo-parent', name: DEMO_PARENT_NAME, email: DEMO_PARENT_EMAIL, role: 'parent', active: true }
        ],
        classes: [],
        students: [],
        diary: [],
        events: [],
        messages: [],
        permissionRequests: [],
        panduChats: {}
    };
}

let data;
let sessionUserId = null;
let activeSection = 'dashboard';
let activeRoomStudentId = null;
let chatSearchQuery = '';
let activeClassStudentId = null;
let classSearchQuery = '';
let classStatusFilter = 'all';
let calendarMonthOffset = 0;
let selectedCalendarDate = localDateValue(new Date());
let pendingStudentImport = null;
let importTargetClassId = '';
let editingDiaryId = null;
let storageError = '';
let sidebarCollapsed = false;
let loginError = '';
let showLogin = false;
const app = document.getElementById('app');

function loadData() {
    try {
        const saved = localStorage.getItem(DATA_KEY);
        if (saved === null) {
            data = createInitialData();
            saveData();
            return;
        }
        const parsed = JSON.parse(saved);
        if (![2, 3].includes(parsed?.setupVersion)) {
            data = createInitialData();
            saveData();
            return;
        }
        if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.classes) ||
            !Array.isArray(parsed.students) || !Array.isArray(parsed.diary) ||
            !Array.isArray(parsed.events) || !Array.isArray(parsed.messages) || !parsed.school) {
            throw new Error('Struktur data demo tidak lengkap.');
        }
        data = normalizeSchoolData(parsed);
        const demoTeacher = data.accounts.find(account => account.email.toLowerCase() === DEMO_TEACHER_EMAIL);
        const demoParent = data.accounts.find(account => account.email.toLowerCase() === DEMO_PARENT_EMAIL);
        if (demoTeacher) demoTeacher.name = DEMO_TEACHER_NAME;
        if (demoParent) demoParent.name = DEMO_PARENT_NAME;
        if (data.setupVersion === 2) {
            const demoAccounts = [
                { id: 'user-demo-teacher', name: DEMO_TEACHER_NAME, email: DEMO_TEACHER_EMAIL, role: 'teacher', active: true },
                { id: 'user-demo-parent', name: DEMO_PARENT_NAME, email: DEMO_PARENT_EMAIL, role: 'parent', active: true }
            ];
            demoAccounts.forEach(account => {
                if (!data.accounts.some(existing => existing.email.toLowerCase() === account.email)) data.accounts.push(account);
            });
            data.setupVersion = 3;
        }
        saveData();
    } catch (error) {
        console.error('Data ASA demo tidak dapat dimuat:', error);
        data = createInitialData();
        saveData();
        storageError = 'Data demo sebelumnya tidak dapat dibaca. Data awal ditampilkan; perubahan tersimpan di browser ini.';
    }
}

function saveData() {
    try {
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
        storageError = '';
        return true;
    } catch (error) {
        console.error('Data ASA demo tidak dapat disimpan:', error);
        toast('Penyimpanan browser gagal. Perubahan belum tersimpan.');
        return false;
    }
}

function toast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    container.append(item);
    window.setTimeout(() => item.remove(), 3600);
}

function currentUser() {
    return data.accounts.find(account => account.id === sessionUserId && account.active) || null;
}

function currentClassForTeacher(user) {
    return data.classes.find(item => item.teacherEmail === user.email) || null;
}

function importClassForUser(user) {
    if (user?.role === 'teacher') return currentClassForTeacher(user);
    if (user?.role !== 'admin') return null;
    const classroom = data.classes.find(item => item.id === importTargetClassId) || data.classes[0] || null;
    importTargetClassId = classroom?.id || '';
    return classroom;
}

function studentsForUser(user) {
    if (!user) return [];
    if (user.role === 'parent') return data.students.filter(student => student.id === user.childId);
    const classroom = currentClassForTeacher(user);
    return classroom ? data.students.filter(student => student.classId === classroom.id) : [];
}

function studentById(id) {
    return data.students.find(student => student.id === id) || null;
}

function className(id) {
    return data.classes.find(item => item.id === id)?.name || 'Belum ditempatkan';
}

function gradeFromClass(classroom) {
    const match = /^(?:kelas\s*)?([1-6])(?:\s*[a-z])?$/i.exec(String(classroom.level || '')) ||
        /^(?:kelas\s*)?([1-6])(?:\s*[a-z])?$/i.exec(String(classroom.name || ''));
    return match?.[1] || '';
}

function classGradeOptions(selectedGrade = '', excludeClassId = '') {
    return `<option value="">Pilih tingkat kelas</option>${gradeNumbers.map(grade => {
        const used = data.classes.some(classroom => classroom.id !== excludeClassId && gradeFromClass(classroom) === grade);
        return `<option value="${grade}" ${selectedGrade === grade ? 'selected' : ''} ${used && selectedGrade !== grade ? 'disabled' : ''}>Kelas ${grade}${used && selectedGrade !== grade ? ' · sudah dibuat' : ''}</option>`;
    }).join('')}`;
}

function renderLanding() {
    app.innerHTML = `
        <section class="landing-page">
            <header class="landing-header">
                <a class="landing-brand" href="#" aria-label="ASA - beranda">
                    <span class="landing-brand-mark"><img src="logo2.png.jpeg" alt=""></span>
                    <span class="landing-brand-name"><strong>ACADEMIC</strong><small>SMART ANALYTICS</small></span>
                </a>
                <button class="button landing-login-button" type="button" data-action="show-login">Masuk Sistem</button>
            </header>
            <main class="landing-hero">
                <div class="landing-hero-mark"><img src="logo2.png.jpeg" alt="Logo Academic Smart Analytics"></div>
                <span class="eyebrow">INTELLIGENT ACADEMIC PLATFORM</span>
                <h1>Analitik Akademik untuk<br class="landing-title-break"> Masa Depan <span>Pendidikan yang Lebih Baik</span></h1>
                <p>Platform analitik akademik terintegrasi untuk membantu sekolah memahami perkembangan siswa dan mengenali kebutuhan dukungan belajar lebih dini.</p>
                <button class="button button-primary landing-hero-login" type="button" data-action="show-login">Login</button>
            </main>
        </section>`;
}

function renderLogin() {
    app.innerHTML = `
        <section class="login-page">
            <div class="login-card login-card-demo">
                <div class="login-heading"><span class="eyebrow">ACADEMIC SMART ANALYTICS</span><h1>Portal Autentikasi</h1><p>Gunakan email yang terdaftar di sekolah.</p></div>
                ${loginError ? `<p class="login-error" role="alert">${escapeHTML(loginError)}</p>` : ''}
                ${storageError ? `<p class="login-error" role="status">${escapeHTML(storageError)}</p>` : ''}
                <div class="demo-credentials"><strong><i class="fa-solid fa-circle-info"></i> Mode demo</strong>
                    <span>Akun demo siap digunakan tanpa dibuat satu per satu. Masuk menggunakan email di bawah; kata sandi tidak diverifikasi. Akses wali kelas dan wali murid aktif setelah admin mengunggah data siswa.</span>
                    <div class="demo-account-list"><strong>Akun yang bisa digunakan</strong>
                        ${data.accounts.filter(account => account.active).map(account => `<button class="demo-account-button" type="button" data-action="fill-demo-email" data-email="${escapeHTML(account.email)}"><span>${escapeHTML(roleNames[account.role] || account.role)}</span><code>${escapeHTML(account.email)}</code><i class="fa-solid fa-arrow-right"></i></button>`).join('')}
                    </div>
                </div>
                <form class="login-form" data-form="login">
                    <div class="field"><label for="login-email">Alamat email</label><input id="login-email" name="email" type="email" placeholder="email@sekolah.id" autocomplete="email" required></div>
                    <button class="button button-primary login-submit" type="submit">Masuk</button>
                </form>
                <button class="login-back-button login-back-centered" type="button" data-action="back-landing">Kembali ke Halaman Awal</button>
            </div>
        </section>`;
}

function renderShell(user) {
    const nav = navigation[user.role] || [];
    if (!nav.some(([id]) => id === activeSection)) activeSection = 'dashboard';
    const title = user.role === 'teacher' && activeSection === 'dashboard'
        ? 'Beranda'
        : sectionTitles[activeSection] || 'Ringkasan';
    app.innerHTML = `
        <div class="app-shell app-shell-${escapeHTML(user.role)}">
            <aside class="sidebar ${sidebarCollapsed ? 'collapsed' : ''}">
                <div class="sidebar-brand"><img class="asa-logo" src="logo2.png.jpeg" alt="Logo ASA"><span class="brand-name"><strong>ACADEMIC</strong><small>SMART ANALYTICS</small></span>
                </div>
                <nav class="sidebar-nav" aria-label="Menu utama">
                    <div class="nav-caption">Menu ${escapeHTML(roleNames[user.role])}</div>
                    ${nav.map(([id, label, icon]) => `<button class="nav-item ${id === activeSection ? 'active' : ''}" type="button" data-action="navigate" data-section="${id}" title="${sidebarCollapsed ? escapeHTML(label) : ''}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`).join('')}
                </nav>
                <div class="sidebar-bottom"><button class="nav-item logout" type="button" data-action="logout" title="${sidebarCollapsed ? 'Keluar' : ''}"><i class="fa-solid fa-right-from-bracket"></i><span>Keluar</span></button></div>
            </aside>
            <div class="workspace">
                <header class="topbar">
                    <div class="topbar-title"><button class="sidebar-toggle" type="button" data-action="toggle-sidebar" aria-label="${sidebarCollapsed ? 'Perluas menu' : 'Susutkan menu'}" aria-expanded="${!sidebarCollapsed}" title="${sidebarCollapsed ? 'Perluas menu' : 'Susutkan menu'}"><i class="fa-solid fa-bars"></i></button><div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(data.school.name || 'Profil sekolah belum diisi')}${data.school.academicYear ? ` · Tahun ajaran ${escapeHTML(data.school.academicYear)}` : ''}</p></div></div>
                    <div class="profile-chip"><span class="avatar">${escapeHTML(user.name.trim().charAt(0).toUpperCase())}</span><div><strong>${escapeHTML(user.name)}</strong><small>${escapeHTML(roleNames[user.role])}</small></div></div>
                </header>
                <section class="content-area">${renderSection(user)}</section>
            </div>
        </div>`;
}

function pageHeading(title, description, eyebrow = roleNames[currentUser()?.role] || 'ASA') {
    return `<div class="page-heading"><div><span class="eyebrow">${escapeHTML(eyebrow)}</span><h2>${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div></div>`;
}

function statCard(icon, value, label) {
    return `<div class="stat-card"><span class="stat-icon"><i class="fa-solid ${icon}"></i></span><div><strong>${escapeHTML(value)}</strong><small>${escapeHTML(label)}</small></div></div>`;
}

function emptyState(icon, message) {
    return `<div class="empty-state"><i class="fa-solid ${icon}"></i>${escapeHTML(message)}</div>`;
}

function nextEvents(limit = 3) {
    const today = localDateValue(new Date());
    return data.events.filter(item => item.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

function eventList(events, allowDelete = false) {
    if (!events.length) return emptyState('fa-calendar-xmark', 'Belum ada agenda mendatang.');
    return `<div class="calendar-list">${events.map(item => {
        const date = new Date(`${item.date}T00:00:00`);
        return `<article class="event-row">
            <div class="date-block"><strong>${Number.isNaN(date.getTime()) ? '--' : date.getDate()}</strong><small>${Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('id-ID', { month: 'short' })}</small></div>
            <div><span class="pill">${escapeHTML(item.category)}</span><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)} · ${escapeHTML(formatDate(item.date))}${item.time ? ` · ${escapeHTML(item.time)}` : ''}${item.location ? ` · ${escapeHTML(item.location)}` : ''}</p></div>
            ${allowDelete ? `<div class="event-actions"><button type="button" class="small-button" data-action="delete-event" data-id="${escapeHTML(item.id)}" aria-label="Hapus ${escapeHTML(item.title)}"><i class="fa-solid fa-trash"></i></button></div>` : ''}
        </article>`;
    }).join('')}</div>`;
}

function renderDashboard(user) {
    const upcoming = nextEvents(3);
    const ownedStudents = studentsForUser(user);
    let stats;
    let intro;
    let summaryContent;
    if (user.role === 'admin') {
        stats = [
            statCard('fa-users', data.accounts.length, 'Akun pengguna'),
            statCard('fa-chalkboard', data.classes.length, 'Kelas terdaftar'),
            statCard('fa-child', data.students.length, 'Data siswa'),
            statCard('fa-calendar-check', data.events.length, 'Agenda sekolah')
        ].join('');
        intro = 'Pantau akun pengguna, informasi sekolah, dan agenda dalam satu tempat.';
        summaryContent = `<div class="card"><div class="section-title"><h3>Ringkasan sekolah</h3><button class="text-link" type="button" data-action="navigate" data-section="school">Kelola data sekolah</button></div>
            <div class="info-grid"><div class="info-cell"><small>Nama sekolah</small><strong>${escapeHTML(data.school.name)}</strong></div><div class="info-cell"><small>Tahun ajaran</small><strong>${escapeHTML(data.school.academicYear)}</strong></div><div class="info-cell"><small>Alamat</small><strong>${escapeHTML(data.school.address)}</strong></div><div class="info-cell"><small>Akun aktif</small><strong>${data.accounts.filter(account => account.active).length}</strong></div></div></div>`;
    } else if (user.role === 'teacher') {
        const averageAttendance = ownedStudents.length
            ? Math.round(ownedStudents.reduce((total, student) => total + Number(student.attendanceRate || 0), 0) / ownedStudents.length)
            : 0;
        const averageGrade = ownedStudents.length
            ? (ownedStudents.reduce((total, student) => total + (Number(student.average) || 0), 0) / ownedStudents.length).toFixed(1)
            : '0.0';
        const upcomingCount = data.events.filter(item => item.date >= localDateValue(new Date())).length;
        stats = [
            statCard('fa-child', ownedStudents.length, 'Murid terdaftar'),
            statCard('fa-user-check', `${averageAttendance}%`, 'Rata-rata kehadiran'),
            statCard('fa-chart-line', averageGrade, 'Rata-rata nilai'),
            statCard('fa-calendar-check', upcomingCount, 'Agenda mendatang')
        ].join('');
        const studentNews = ownedStudents.length
            ? `<div class="list-stack">${ownedStudents.map(student => `<div class="list-row student-news-row"><span class="list-icon"><i class="fa-solid fa-child"></i></span><div class="student-news-copy"><strong>${escapeHTML(student.name)}</strong>${student.note ? `<small>${escapeHTML(student.note)}</small>` : ''}</div><span class="pill ${statusTone(student.status)}">${escapeHTML(student.status)}</span></div>`).join('')}</div>`
            : emptyState('fa-child', 'Belum ada murid terdaftar di kelas.');
        summaryContent = `<div class="section-row teacher-dashboard-row">
            <div class="card"><div class="section-title"><div><h3>Kabar murid</h3><p class="muted">Status terbaru yang tercatat</p></div></div>${studentNews}</div>
            <div class="card"><div class="section-title"><div><h3>Agenda terdekat</h3><p class="muted">Yang akan datang di kelas</p></div></div>${eventList(upcoming)}</div>
        </div>`;
    } else {
        const child = ownedStudents[0];
        const notes = child ? data.diary.filter(note => note.studentId === child.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2) : [];
        stats = [
            statCard('fa-child', child?.name || '—', 'Informasi anak'),
            statCard('fa-school', child ? className(child.classId) : '—', 'Kelas'),
            statCard('fa-book-open', notes.length, 'Catatan terbaru'),
            statCard('fa-calendar-check', upcoming.length, 'Agenda mendatang')
        ].join('');
        intro = `Informasi anak dan kabar dari sekolah tersedia di sini.`;
        summaryContent = child ? `<div class="section-row"><div class="card"><div class="section-title"><h3>Informasi anak</h3><button class="text-link" type="button" data-action="navigate" data-section="child">Lihat detail</button></div>${childSummary(child)}</div>
            <div class="card"><div class="section-title"><h3>Catatan buku penghubung</h3><button class="text-link" type="button" data-action="navigate" data-section="diary">Lihat semua</button></div>${notes.length ? notes.map(note => diaryCard(note, false)).join('') : emptyState('fa-book-open', 'Belum ada catatan.')}</div></div>` : emptyState('fa-child', 'Akun ini belum dihubungkan dengan data anak.');
    }
    if (user.role === 'teacher') {
        const hour = new Date().getHours();
        const timeOfDay = hour < 11 ? 'pagi' : hour < 15 ? 'siang' : hour < 18 ? 'sore' : 'malam';
        const classroom = currentClassForTeacher(user);
        const honorific = user.name.match(/^(bu|pak|ibu|bapak)\s+/i)?.[1];
        const firstName = user.name.replace(/^(bu|pak|ibu|bapak)\s+/i, '').split(' ')[0] || user.name;
        const greetingName = honorific ? `${honorific.charAt(0).toUpperCase()}${honorific.slice(1).toLowerCase()} ${firstName}` : firstName;
        return `<section class="teacher-home-intro">
                <span class="eyebrow">BERANDA WALI KELAS</span>
                <h2>Selamat ${timeOfDay}, ${escapeHTML(greetingName)}!</h2>
                <p>Ringkasan kecil untuk memulai hari bersama kelas.</p>
            </section>
            <section class="teacher-home-banner">
                <div class="teacher-banner-copy"><span class="teacher-banner-label">HARI INI${classroom ? ` · ${escapeHTML(classroom.name)}` : ''}</span>
                    <h2>Hari baru, kesempatan baru untuk tumbuh bersama.</h2>
                    <p>Pantau kabar murid dan agenda kelas untuk mendampingi setiap langkah belajar mereka.</p>
                </div>
                <div class="teacher-banner-art" aria-hidden="true"><i class="fa-solid fa-seedling"></i></div>
            </section>
            <div class="stats-grid teacher-stats">${stats}</div>${summaryContent}`;
    }
    const honorific = user.name.match(/^(bu|pak|ibu|bapak)\s+/i)?.[1];
    const firstName = user.name.replace(/^(bu|pak|ibu|bapak)\s+/i, '').split(' ')[0] || user.name;
    const greetingName = honorific ? `${honorific.charAt(0).toUpperCase()}${honorific.slice(1).toLowerCase()} ${firstName}` : firstName;
    return `<div class="welcome-card"><div><span class="eyebrow">${escapeHTML(roleNames[user.role])} · ${escapeHTML(data.school.name)}</span><h2>Selamat datang, ${escapeHTML(greetingName)}!</h2><p>${escapeHTML(intro)}</p></div><i class="welcome-art fa-solid fa-sun"></i></div>
        <div class="stats-grid">${stats}</div>${renderDashboardActions(user)}
        ${user.role === 'admin' ? `<div class="section-row">${summaryContent}<div class="card"><div class="section-title"><h3>Agenda mendatang</h3><button class="text-link" type="button" data-action="navigate" data-section="calendar">Kelola kalender</button></div>${eventList(upcoming)}</div></div>` : summaryContent}
        <p class="prototype-footer">Prototipe ASA · Data demo disimpan secara lokal di browser.</p>`;
}

function renderDashboardActions(user) {
    const actions = user.role === 'admin'
        ? [
            ['accounts', 'Kelola akun', 'fa-user-shield'],
            ['school', 'Data sekolah & kelas', 'fa-school'],
            ['importStudents', 'Unggah data siswa', 'fa-file-csv'],
            ['calendar', 'Kalender akademik', 'fa-calendar-days']
        ]
        : [
            ['child', 'Informasi anak', 'fa-child'],
            ['diary', 'Buku penghubung', 'fa-book-open'],
            ['chat', 'Chat wali kelas / ajukan izin', 'fa-comments'],
            ['calendar', 'Agenda sekolah', 'fa-calendar-days']
        ];
    return `<nav class="dashboard-actions" aria-label="Akses cepat">${actions.map(([section, label, icon]) =>
        `<button class="button button-secondary dashboard-action" type="button" data-action="navigate" data-section="${section}"><i class="fa-solid ${icon}"></i><span>${label}</span><i class="fa-solid fa-arrow-right action-arrow" aria-hidden="true"></i></button>`
    ).join('')}</nav>`;
}

function childSummary(child) {
    return `<div class="child-hero"><span class="child-avatar"><i class="fa-solid fa-child"></i></span><div><h3>${escapeHTML(child.name)}</h3><p>${escapeHTML(className(child.classId))} · NIS ${escapeHTML(child.nis)}</p></div></div>
        <div class="info-grid"><div class="info-cell"><small>Status lokasi hari ini</small><strong>${escapeHTML(child.status || child.attendance)}</strong></div><div class="info-cell"><small>Kehadiran bulanan</small><strong>${escapeHTML(child.attendanceRate)}%</strong></div><div class="info-cell"><small>Ringkasan nilai</small><strong>${escapeHTML(child.average)}</strong></div>${child.note ? `<div class="info-cell"><small>Catatan sekolah</small><strong>${escapeHTML(child.note)}</strong></div>` : ''}
        <div class="info-cell full"><small>Lencana karakter</small><strong>${escapeHTML((child.badges || []).join(' · ') || 'Belum ada lencana')}</strong></div></div>`;
}

function renderAccounts() {
    const children = data.students;
    const userRows = data.accounts.map(account => {
        const assignment = account.role === 'teacher'
            ? (data.classes.find(item => item.teacherEmail === account.email)?.name || 'Belum ditugaskan')
            : account.role === 'parent'
                ? (studentById(account.childId)?.name || 'Belum dihubungkan')
                : 'Akses penuh';
        const assignmentValue = account.role === 'teacher'
            ? `class:${data.classes.find(item => item.teacherEmail === account.email)?.id || ''}`
            : account.role === 'parent' ? `student:${account.childId || ''}` : '';
        const linkOptions = `<option value="">${account.role === 'teacher' ? 'Belum ditugaskan' : 'Belum dihubungkan'}</option>
            <optgroup label="Kelas">${data.classes.map(item => `<option value="class:${escapeHTML(item.id)}" ${assignmentValue === `class:${item.id}` ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</optgroup>
            <optgroup label="Siswa">${children.map(child => `<option value="student:${escapeHTML(child.id)}" ${assignmentValue === `student:${child.id}` ? 'selected' : ''}>${escapeHTML(child.name)}</option>`).join('')}</optgroup>`;
        return `<tr><td><strong>${escapeHTML(account.name)}</strong><br><small class="muted">${escapeHTML(account.email)}</small></td>
            <td colspan="2"><form class="permission-form" data-form="update-account" data-id="${escapeHTML(account.id)}">
                <select name="role" aria-label="Peran ${escapeHTML(account.name)}">
                    <option value="admin" ${account.role === 'admin' ? 'selected' : ''}>Admin sekolah</option>
                    <option value="teacher" ${account.role === 'teacher' ? 'selected' : ''}>Guru</option>
                    <option value="parent" ${account.role === 'parent' ? 'selected' : ''}>Wali murid</option>
                </select>
                <select name="link" aria-label="Penempatan ${escapeHTML(account.name)}">${linkOptions}</select>
                <button class="small-button" type="submit">Simpan</button>
                <small class="muted">${escapeHTML(assignment)}</small>
            </form></td>
            <td><span class="pill ${account.active ? 'success' : 'danger'}">${account.active ? 'Aktif' : 'Nonaktif'}</span></td>
            <td><div class="inline-actions">${account.role !== 'admin' ? `<button class="small-button" type="button" data-action="toggle-account" data-id="${escapeHTML(account.id)}">${account.active ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="small-button" type="button" data-action="delete-account" data-id="${escapeHTML(account.id)}" aria-label="Hapus akun"><i class="fa-solid fa-trash"></i></button>` : '<span class="muted">—</span>'}</div></td></tr>`;
    }).join('');
    return `${pageHeading('Akun pengguna & hak akses', 'Buat akun guru/wali, hubungkan dengan kelas atau siswa, dan atur status akses.', 'ADMIN SEKOLAH')}
        <div class="card"><div class="section-title"><h3>Tambah akun pengguna</h3></div>
            <form data-form="create-account"><div class="form-grid">
                <div class="field"><label for="account-name">Nama lengkap</label><input id="account-name" name="name" maxlength="80" required></div>
                <div class="field"><label for="account-email">Email</label><input id="account-email" name="email" type="email" maxlength="120" required></div>
                <div class="field"><label for="account-role">Peran</label><select id="account-role" name="role"><option value="teacher">Guru</option><option value="parent">Wali murid</option></select></div>
                <div class="field"><label for="account-link">Hubungkan ke kelas (guru) atau anak (wali)</label><select id="account-link" name="link"><option value="">Belum dihubungkan</option>
                    <optgroup label="Kelas">${data.classes.map(item => `<option value="class:${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join('')}</optgroup>
                    <optgroup label="Siswa">${children.map(child => `<option value="student:${escapeHTML(child.id)}">${escapeHTML(child.name)}</option>`).join('')}</optgroup>
                </select></div>
            </div><div class="form-actions"><button class="button button-primary" type="submit"><i class="fa-solid fa-user-plus"></i> Tambah akun</button></div></form>
            <p class="prototype-footer">Akun demo Guru Wali Kelas dan Orang Tua sudah tersedia di halaman login. Akun tambahan hanya perlu dibuat jika ingin mendemonstrasikan pengguna lain. Login simulasi lokal; kata sandi tidak diverifikasi.</p>
        </div>
        <div class="card"><div class="section-title"><h3>Daftar akun</h3><span class="pill">${data.accounts.length} pengguna</span></div>
            <div class="table-scroll"><table><thead><tr><th>Pengguna</th><th colspan="2">Peran & penempatan</th><th>Status akses</th><th>Aksi</th></tr></thead><tbody>${userRows || '<tr><td colspan="5">Belum ada pengguna.</td></tr>'}</tbody></table></div>
        </div>`;
}

function renderSchool() {
    const teacherOptions = data.accounts.filter(account => account.role === 'teacher').map(account =>
        `<option value="${escapeHTML(account.email)}" ${account.email === DEMO_TEACHER_EMAIL ? 'selected' : ''}>${escapeHTML(account.name)}</option>`).join('');
    const rows = data.classes.map(classroom => {
        const count = data.students.filter(student => student.classId === classroom.id).length;
        return `<tr><td colspan="3"><form class="class-edit-form" data-form="update-class" data-id="${escapeHTML(classroom.id)}">
            <select name="grade" aria-label="Tingkat ${escapeHTML(classroom.name)}" required>${classGradeOptions(gradeFromClass(classroom), classroom.id)}</select>
            <select name="teacherEmail" aria-label="Wali kelas ${escapeHTML(classroom.name)}"><option value="">Belum ditugaskan</option>${data.accounts.filter(account => account.role === 'teacher').map(account => `<option value="${escapeHTML(account.email)}" ${account.email === classroom.teacherEmail ? 'selected' : ''}>${escapeHTML(account.name)}</option>`).join('')}</select>
            <button class="small-button" type="submit">Simpan</button>
        </form></td><td>${count} siswa</td><td><button type="button" class="small-button" data-action="delete-class" data-id="${escapeHTML(classroom.id)}" aria-label="Hapus ${escapeHTML(classroom.name)}"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    }).join('');
    const studentRows = data.students.map(student => `<tr><td>${escapeHTML(student.nisn || student.nis || '—')}</td><td><strong>${escapeHTML(student.name)}</strong></td><td>${escapeHTML(className(student.classId))}</td><td>${escapeHTML(student.parentEmail || 'Belum dihubungkan')}</td><td><span class="inline-actions"><button type="button" class="small-button" data-action="edit-student" data-id="${escapeHTML(student.id)}">Ubah</button><button type="button" class="small-button button-danger" data-action="delete-student" data-id="${escapeHTML(student.id)}">Hapus</button></span></td></tr>`).join('');
    return `${pageHeading('Data sekolah & kelas', 'Perbarui identitas sekolah serta kelola daftar kelas dan siswa.', 'ADMIN SEKOLAH')}
        <div class="card"><div class="section-title"><h3>Profil sekolah</h3></div>
            <form data-form="save-school"><div class="form-grid">
                <div class="field"><label for="school-name">Nama sekolah</label><input id="school-name" name="name" maxlength="100" value="${escapeHTML(data.school.name)}" required></div>
                <div class="field"><label for="school-year">Tahun ajaran</label><input id="school-year" name="academicYear" maxlength="30" value="${escapeHTML(data.school.academicYear)}" required></div>
                <div class="field full"><label for="school-address">Alamat sekolah</label><input id="school-address" name="address" maxlength="180" value="${escapeHTML(data.school.address)}" required></div>
            </div><button class="button button-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Simpan profil sekolah</button></form>
            </div>
            <div class="card"><div class="section-title"><div><h3>Tambah kelas</h3><p class="muted">Tingkat kelas tersedia 1 sampai 6, tanpa pembagian A/B/C.</p></div></div>
                <form data-form="create-class"><div class="form-grid">
                    <div class="field"><label for="class-grade">Tingkat kelas</label><select id="class-grade" name="grade" required>${classGradeOptions()}</select></div>
                    <div class="field full"><label for="class-teacher">Wali kelas (opsional)</label><select id="class-teacher" name="teacherEmail"><option value="">Belum ditugaskan</option>${teacherOptions}</select></div>
            </div><button class="button button-primary" type="submit"><i class="fa-solid fa-plus"></i> Tambah kelas</button></form>
        </div>
        <div class="card"><div class="section-title"><h3>Daftar kelas</h3></div><div class="table-scroll"><table><thead><tr><th colspan="3">Informasi kelas · wali kelas</th><th>Siswa</th><th>Aksi</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Belum ada kelas.</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="section-title"><h3>Data siswa</h3><span class="pill">Dikelola admin</span></div><div class="table-scroll"><table><thead><tr><th>NISN</th><th>Nama</th><th>Kelas</th><th>Email wali</th><th>Aksi</th></tr></thead><tbody>${studentRows || '<tr><td colspan="5">Belum ada data siswa.</td></tr>'}</tbody></table></div>
        <p class="prototype-footer">Unggah data siswa melalui menu admin. Akun demo orang tua akan otomatis ditautkan ke siswa pertama yang berhasil diimpor.</p></div>`;
}

function renderClasses(user) {
    const classroom = currentClassForTeacher(user);
    if (!classroom) return `${pageHeading('Informasi kelas', 'Kelola informasi dan pantau siswa di kelas yang Anda ampu.')}${emptyState('fa-chalkboard', 'Belum ada kelas yang ditugaskan kepada akun guru ini.')}`;
    const students = data.students.filter(student => student.classId === classroom.id);
    const filteredStudents = students.filter(student =>
        `${student.name} ${student.nisn || ''} ${student.parentName || ''}`.toLowerCase().includes(classSearchQuery) &&
        (classStatusFilter === 'all' || student.status === classStatusFilter));
    if (!students.some(student => student.id === activeClassStudentId)) activeClassStudentId = null;
    const rows = students.map(student => {
        const searchText = `${student.name} ${student.nisn || ''} ${student.parentName || ''}`.toLowerCase();
        const matches = searchText.includes(classSearchQuery) && (classStatusFilter === 'all' || student.status === classStatusFilter);
        const badges = student.badges.length ? student.badges.map(badge => `<span class="pill badge-pill">${escapeHTML(badge)}</span>`).join(' ') : '<span class="muted">Belum ada</span>';
        return `<tr data-student-row data-search="${escapeHTML(searchText)}" data-status="${escapeHTML(student.status)}" ${matches ? '' : 'hidden'}>
            <td><strong>${escapeHTML(student.name)}</strong><br><small class="muted">NISN ${escapeHTML(student.nisn || '—')}</small></td>
            <td><select class="status-select" data-student-status="${escapeHTML(student.id)}" aria-label="Status harian ${escapeHTML(student.name)}">${studentStatuses.map(status => `<option ${status === student.status ? 'selected' : ''}>${escapeHTML(status)}</option>`).join('')}</select></td>
            <td><strong>${escapeHTML(student.average || '—')}</strong><br><small class="muted">Kehadiran ${escapeHTML(student.attendanceRate)}%</small></td>
            <td>${escapeHTML(student.parentName || 'Nama wali belum diisi')}<br><small class="muted">${escapeHTML(student.parentEmail || student.parentPhone || 'Kontak belum tersedia')}</small></td>
            <td><div class="badge-cell">${badges}<button class="small-button" type="button" data-action="give-badge" data-id="${escapeHTML(student.id)}">+ Lencana</button></div></td>
            <td><span class="inline-actions"><button class="small-button" type="button" data-action="edit-student" data-id="${escapeHTML(student.id)}">Edit</button>${parentAccountFor(student) ? `<button class="small-button" type="button" data-action="open-room" data-id="${escapeHTML(student.id)}">Hubungi</button>` : ''}<button class="small-button" type="button" data-action="show-class-student" data-id="${escapeHTML(student.id)}">${activeClassStudentId === student.id ? 'Tutup detail' : 'Detail'}</button></span></td>
        </tr>`;
    }).join('');
    const selected = students.find(student => student.id === activeClassStudentId);
    const latestNote = selected ? data.diary.filter(note => note.studentId === selected.id).sort((a, b) => b.date.localeCompare(a.date))[0] : null;
    const detail = selected ? `<div class="student-detail" aria-live="polite"><div class="section-title"><div><span class="eyebrow">PROFIL MURID</span><h3>${escapeHTML(selected.name)}</h3></div><button class="icon-button" type="button" data-action="show-class-student" data-id="${escapeHTML(selected.id)}" aria-label="Tutup detail"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="info-grid"><div class="info-cell"><small>NISN</small><strong>${escapeHTML(selected.nisn || 'Tidak tersedia')}</strong></div><div class="info-cell"><small>Kelas</small><strong>${escapeHTML(classroom.name)}</strong></div><div class="info-cell"><small>Status lokasi hari ini</small><strong>${escapeHTML(selected.status)}</strong></div><div class="info-cell"><small>Presensi bulanan</small><strong>${escapeHTML(selected.attendanceRate)}%</strong></div><div class="info-cell"><small>Nilai rata-rata</small><strong>${escapeHTML(selected.average || 'Belum tersedia')}</strong></div><div class="info-cell"><small>Nama orang tua/wali</small><strong>${escapeHTML(selected.parentName || 'Belum diisi')}</strong></div><div class="info-cell"><small>Kontak wali</small><strong>${escapeHTML([selected.parentEmail, selected.parentPhone].filter(Boolean).join(' · ') || 'Belum tersedia')}</strong></div><div class="info-cell full"><small>Lencana karakter</small><strong>${escapeHTML(selected.badges.join(' · ') || 'Belum ada lencana')}</strong></div><div class="info-cell full"><small>Catatan perkembangan</small><strong>${escapeHTML(selected.note || 'Belum ada catatan.')}</strong></div></div>
        <div class="student-detail-footer"><div><small class="muted">Catatan terakhir</small><strong>${escapeHTML(latestNote ? `${latestNote.title} · ${formatDate(latestNote.date)}` : 'Belum ada catatan buku penghubung.')}</strong></div><div class="form-actions"><button class="button button-secondary" type="button" data-action="navigate" data-section="diary">Buku penghubung</button>${parentAccountFor(selected) ? `<button class="button button-primary" type="button" data-action="open-room" data-id="${escapeHTML(selected.id)}"><i class="fa-solid fa-comments"></i> Chat wali</button>` : ''}</div></div></div>` : '';
    return `${pageHeading('Informasi kelas', 'Daftar siswa dan informasi kelas yang Anda ampu.', 'GURU')}
        <div class="card"><div class="section-title"><div><h3>${escapeHTML(classroom.name)}</h3><p class="muted">${escapeHTML(classroom.level)} · ${students.length} murid</p></div><span class="pill success">Kelas aktif</span></div>
        <div class="class-tools"><label class="search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input class="search-input" type="search" data-class-search value="${escapeHTML(classSearchQuery)}" placeholder="Cari nama, NISN, atau nama orang tua" aria-label="Cari nama, NISN, atau nama orang tua"></label>
            <select data-status-filter aria-label="Filter status harian"><option value="all">Semua status</option>${studentStatuses.map(status => `<option value="${escapeHTML(status)}" ${classStatusFilter === status ? 'selected' : ''}>${escapeHTML(status)}</option>`).join('')}</select>
            <span class="muted" data-class-count>${filteredStudents.length} dari ${students.length} murid</span>
        </div>
        <div class="class-tools class-file-tools"><button class="button button-secondary" type="button" data-action="save-class-pdf"><i class="fa-solid fa-file-pdf"></i> Simpan PDF</button></div>
        <div class="table-scroll"><table class="student-table"><thead><tr><th>Profil murid</th><th>Status harian</th><th>Nilai & kehadiran</th><th>Orang tua/wali</th><th>Lencana karakter</th><th>Aksi</th></tr></thead><tbody>${rows || (students.length ? '' : '<tr><td class="empty-state" colspan="6">Belum ada murid di kelas ini. Minta admin sekolah mengunggah data siswa.</td></tr>')}</tbody></table></div>
        <p class="empty-state ${students.length && !filteredStudents.length ? '' : 'hidden'}" data-class-empty>Tidak ada murid yang cocok dengan pencarian/filter.</p>${detail}</div>`;
}

function renderStudentImport(user) {
    const classroom = importClassForUser(user);
    if (!classroom) return `${pageHeading('Unggah data siswa', 'Pilih kelas tujuan, lalu unggah dataset siswa.', 'ADMIN SEKOLAH')}
        <div class="card import-card"><div class="section-title"><div><h3>Siapkan kelas tujuan</h3><p class="muted">Pilih tingkat kelas. Kelas dan penugasan Wali Kelas Demo akan dibuat otomatis.</p></div></div>
            <div class="import-actions"><div class="field import-class-field"><label for="import-grade">Tingkat kelas tujuan</label><select id="import-grade" data-import-grade>${gradeNumbers.map(grade => `<option value="${grade}">Kelas ${grade}</option>`).join('')}</select></div>
                <button class="button button-primary" type="button" data-action="create-import-class">Siapkan kelas</button><button class="button button-secondary" type="button" data-action="download-student-template">Unduh template CSV</button></div>
            <p class="muted csv-format-help">Setelah kelas siap, pilih file CSV. Akun Wali Murid Demo akan otomatis dihubungkan ke siswa pertama yang berhasil diimpor.</p>
        </div>`;
    const classSelector = `<div class="field import-class-field"><label for="import-class">Kelas tujuan</label><select id="import-class" data-import-class>${data.classes.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === classroom.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></div>`;
    const importPreview = pendingStudentImport ? `<div class="csv-preview"><div class="section-title"><div><h3>Pratinjau impor CSV</h3><p class="muted">${pendingStudentImport.items.length} baris siap ditinjau sebelum disimpan.</p></div><button class="small-button" type="button" data-action="cancel-student-import">Batal</button></div>
        ${pendingStudentImport.errors.length ? `<p class="import-errors">${pendingStudentImport.errors.map(error => escapeHTML(error)).join('<br>')}</p>` : ''}
        ${pendingStudentImport.items.length ? `<div class="table-scroll"><table><thead><tr><th>NISN</th><th>Nama murid</th><th>Nama wali</th><th>Nilai</th><th>Presensi</th></tr></thead><tbody>${pendingStudentImport.items.slice(0, 8).map(item => `<tr><td>${escapeHTML(item.nisn)}</td><td>${escapeHTML(item.name)}</td><td>${escapeHTML(item.parentName)}</td><td>${escapeHTML(item.average || '—')}</td><td>${escapeHTML(item.attendanceRate || '—')}%</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${pendingStudentImport.items.length ? `<button class="button button-primary" type="button" data-action="apply-student-import">Simpan ${pendingStudentImport.items.length} murid</button>` : ''}</div>` : '';
    return `${pageHeading('Unggah data siswa', `Impor dan ekspor data murid untuk ${classroom.name}.`, 'ADMIN SEKOLAH')}
        <div class="card import-card"><div class="section-title"><div><h3>Impor dari CSV</h3><p class="muted">Pilih kelas tujuan, unggah file, lalu tinjau sebelum menyimpan.</p></div><span class="pill success">${escapeHTML(classroom.name)}</span></div>
            ${classSelector}
            <div class="import-actions"><label class="button button-primary csv-upload-button"><i class="fa-solid fa-file-arrow-up"></i> Pilih file CSV<input type="file" data-student-csv accept=".csv,text/csv" hidden></label>
                <button class="button button-secondary" type="button" data-action="download-student-template">Unduh template CSV</button><button class="button button-secondary" type="button" data-action="export-class-csv">Ekspor data kelas</button><button class="button button-secondary" type="button" data-action="save-class-pdf"><i class="fa-solid fa-file-pdf"></i> Simpan PDF</button></div>
            <p class="muted csv-format-help">Kolom wajib: <code>nisn,nama_siswa</code>. Opsional: <code>nama_orang_tua,email_wali,no_hp,nilai_rata_rata,kehadiran_bulanan,status_lokasi,kelas,catatan,lencana</code>. Isi <code>kelas</code> dengan nama kelas tujuan (contoh: Kelas 1). Nilai dan kehadiran 0–100; lencana dipisahkan tanda <code>|</code>. Mengimpor NISN yang sudah ada di kelas ini akan memperbarui data siswa tersebut; NISN yang digunakan di kelas lain ditolak. Untuk menghapus, gunakan tombol Hapus di Data sekolah & kelas. Maksimal 1.000 baris per file. Saat impor berhasil, Wali Kelas Demo ditugaskan ke kelas ini dan Wali Murid Demo dihubungkan ke siswa pertama pada file. Data tersimpan di browser ini.</p>
            ${importPreview}
        </div>`;
}

function downloadCSV(filename, rows) {
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function downloadClassPDF(classroom) {
    const roster = data.students.filter(student => student.classId === classroom.id);
    const pages = [];
    const rowsPerPage = 24;
    const pagesOfStudents = roster.length ? Array.from({ length: Math.ceil(roster.length / rowsPerPage) }, (_, index) =>
        roster.slice(index * rowsPerPage, (index + 1) * rowsPerPage)) : [[]];
    const toPDFText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1').replace(/\s+/g, ' ');
    const columns = [
        { x: 30, width: 3, value: (_, index) => String(index + 1) },
        { x: 55, width: 15, value: student => student.nisn || student.nis || '—' },
        { x: 145, width: 31, value: student => student.name },
        { x: 330, width: 28, value: student => student.parentName || '—' },
        { x: 495, width: 7, value: student => student.average || '—' },
        { x: 545, width: 9, value: student => `${student.attendanceRate || 0}%` },
        { x: 620, width: 30, value: student => student.status || '—' }
    ];
    const schoolName = toPDFText(data.school.name || 'Academic Smart Analytics');
    const classLabel = toPDFText(`${classroom.name}${data.school.academicYear ? ` | Tahun ajaran ${data.school.academicYear}` : ''}`);
    pagesOfStudents.forEach((pageStudents, pageIndex) => {
        const commands = [
            '0.09 0.17 0.30 rg',
            `BT /F1 16 Tf 30 560 Td (${schoolName}) Tj ET`,
            `BT /F1 10 Tf 30 542 Td (${classLabel} | Daftar siswa) Tj ET`,
            '0.90 0.93 0.97 rg 28 512 786 20 re f',
            '0 0 0 rg',
            'BT /F1 9 Tf 30 519 Td (No) Tj ET',
            'BT /F1 9 Tf 55 519 Td (NISN) Tj ET',
            'BT /F1 9 Tf 145 519 Td (Nama siswa) Tj ET',
            'BT /F1 9 Tf 330 519 Td (Orang tua/wali) Tj ET',
            'BT /F1 9 Tf 495 519 Td (Nilai) Tj ET',
            'BT /F1 9 Tf 545 519 Td (Kehadiran) Tj ET',
            'BT /F1 9 Tf 620 519 Td (Status harian) Tj ET',
            '0.65 0.69 0.75 RG 0.5 w 28 512 m 814 512 l S'
        ];
        pageStudents.forEach((student, index) => {
            const y = 494 - index * 16;
            columns.forEach(column => {
                const text = toPDFText(column.value(student, pageIndex * rowsPerPage + index)).slice(0, column.width);
                commands.push(`BT /F1 8 Tf ${column.x} ${y} Td (${text}) Tj ET`);
            });
            commands.push(`0.82 0.84 0.88 RG 0.35 w 28 ${y - 5} m 814 ${y - 5} l S`);
        });
        commands.push(`BT /F1 8 Tf 30 28 Td (ASA | Diunduh ${toPDFText(new Date().toLocaleDateString('id-ID'))} | Halaman ${pageIndex + 1} dari ${pagesOfStudents.length}) Tj ET`);
        pages.push(commands.join('\n'));
    });

    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        `<< /Type /Pages /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ];
    pages.forEach((content, index) => {
        const pageObjectId = 4 + index * 2;
        const contentObjectId = pageObjectId + 1;
        objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
        objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(pdf.length);
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const blob = new Blob([pdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ASA-${classroom.name.replace(/\s+/g, '-')}-${localDateValue(new Date())}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openStudentDialog(action, id) {
    const student = studentById(id);
    const user = currentUser();
    if (!student || !['admin', 'teacher'].includes(user?.role) ||
        (user.role === 'teacher' && !studentsForUser(user).some(item => item.id === student.id))) return;
    document.querySelector('.student-dialog')?.remove();
    const isBadge = action === 'give-badge';
    if (isBadge && user.role !== 'teacher') return;
    const content = isBadge
        ? `<div class="field"><label for="student-badge">Pilih lencana</label><select id="student-badge" name="badge" required>${characterBadges.map(badge => `<option value="${escapeHTML(badge)}" ${student.badges.includes(badge) ? 'disabled' : ''}>${escapeHTML(badge)}${student.badges.includes(badge) ? ' (sudah dimiliki)' : ''}</option>`).join('')}</select></div><div class="field"><label for="badge-reason">Catatan apresiasi (opsional)</label><input id="badge-reason" name="reason" maxlength="160" placeholder="Apa hal positif yang dilakukan?"></div>`
        : `<div class="form-grid"><div class="field"><label>Nama murid</label><input name="name" value="${escapeHTML(student.name)}" maxlength="100" required></div><div class="field"><label>NISN</label><input name="nisn" value="${escapeHTML(student.nisn)}" maxlength="30" required></div><div class="field"><label>Nama orang tua/wali</label><input name="parentName" value="${escapeHTML(student.parentName)}" maxlength="100"></div><div class="field"><label>Email wali</label><input name="parentEmail" type="email" value="${escapeHTML(student.parentEmail)}" maxlength="120"></div><div class="field"><label>Nomor kontak</label><input name="parentPhone" value="${escapeHTML(student.parentPhone)}" maxlength="30"></div><div class="field"><label>Nilai rata-rata (0–100)</label><input name="average" type="number" min="0" max="100" step="0.1" value="${escapeHTML(student.average)}"></div></div>`;
    const dialog = document.createElement('dialog');
    dialog.className = 'student-dialog';
    dialog.innerHTML = `<form method="dialog" class="dialog-close-form"><button class="icon-button" aria-label="Tutup">×</button></form>
        <h2>${isBadge ? 'Beri lencana karakter' : 'Edit data dasar murid'}</h2><p class="muted">${escapeHTML(student.name)}</p>
        <form data-form="${isBadge ? 'add-student-badge' : 'update-student'}" data-student-id="${escapeHTML(student.id)}">${content}
            <div class="form-actions"><button class="button button-primary" type="submit">${isBadge ? 'Simpan lencana' : 'Simpan perubahan'}</button><button class="button button-secondary" type="button" data-action="close-student-dialog">Batal</button></div>
        </form>`;
    document.querySelector('#app').append(dialog);
    dialog.showModal();
}

function readAttachment(file) {
    if (!file) return Promise.resolve(null);
    if (file.size > 1024 * 1024) return Promise.reject(new Error('Lampiran maksimal 1 MB untuk penyimpanan demo lokal.'));
    if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) {
        return Promise.reject(new Error('Lampiran hanya mendukung gambar atau PDF.'));
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve({ name: file.name, type: file.type, data: reader.result }));
        reader.addEventListener('error', () => reject(new Error('Lampiran gagal dibaca oleh browser.')));
        reader.readAsDataURL(file);
    });
}

async function prepareStudentImport(file, classroom) {
    if (file.size > 4 * 1024 * 1024) throw new Error('Ukuran CSV maksimal 4 MB.');
    const rows = parseSchoolCSV(await file.text());
    const normalizeHeader = value => value.replace(/^\uFEFF/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const headers = rows[0].map(normalizeHeader);
    const findColumn = (...names) => names.map(name => headers.indexOf(name)).find(index => index >= 0);
    const columns = {
        nisn: findColumn('nisn', 'nis'),
        name: findColumn('nama_siswa', 'nama_lengkap_siswa', 'nama_murid', 'nama_lengkap', 'nama', 'name'),
        parentName: findColumn('nama_orang_tua', 'nama_wali', 'orang_tua', 'wali_murid'),
        parentEmail: findColumn('email_wali', 'email_orang_tua', 'parent_email'),
        parentPhone: findColumn('no_hp', 'nomor_hp', 'telepon_wali', 'kontak_wali'),
        average: findColumn('nilai_rata_rata', 'rata_rata_nilai', 'nilai', 'average'),
        attendanceRate: findColumn('kehadiran_bulanan', 'persentase_kehadiran', 'kehadiran', 'attendance'),
        status: findColumn('status_lokasi', 'status_harian', 'status'),
        className: findColumn('kelas', 'class'),
        note: findColumn('catatan', 'catatan_perkembangan', 'note'),
        badges: findColumn('lencana', 'badge', 'lencana_karakter')
    };
    if (columns.nisn === undefined || columns.name === undefined) throw new Error('Kolom wajib tidak ditemukan. Gunakan header NISN dan nama_siswa.');
    if (rows.length > 1001) throw new Error('CSV maksimal berisi 1.000 baris siswa per unggahan.');
    const items = [];
    const errors = [];
    const seen = new Set();
    rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;
        const get = name => columns[name] === undefined ? '' : String(row[columns[name]] || '').trim();
        const nisn = get('nisn');
        const name = get('name');
        if (!nisn || !name) {
            errors.push(`Baris ${rowNumber}: NISN dan nama murid wajib diisi.`);
            return;
        }
        if (seen.has(nisn)) {
            errors.push(`Baris ${rowNumber}: NISN ${nisn} duplikat di dalam file.`);
            return;
        }
        seen.add(nisn);
        const classValue = get('className');
        const importClass = classValue ? data.classes.find(item => item.name.toLowerCase() === classValue.toLowerCase()) : classroom;
        if (!importClass || importClass.id !== classroom.id) {
            errors.push(`Baris ${rowNumber}: kelas harus ${classroom.name}, sesuai kelas tujuan yang dipilih.`);
            return;
        }
        const average = get('average');
        const attendanceRate = get('attendanceRate').replace('%', '');
        if (average && (!Number.isFinite(Number(average)) || Number(average) < 0 || Number(average) > 100)) {
            errors.push(`Baris ${rowNumber}: nilai rata-rata harus antara 0–100.`);
            return;
        }
        if (attendanceRate && (!Number.isFinite(Number(attendanceRate)) || Number(attendanceRate) < 0 || Number(attendanceRate) > 100)) {
            errors.push(`Baris ${rowNumber}: kehadiran bulanan harus antara 0–100.`);
            return;
        }
        const rawStatus = get('status');
        if (rawStatus && !studentStatuses.includes(rawStatus) && !['Hadir', 'Izin', 'Sakit'].includes(rawStatus)) {
            errors.push(`Baris ${rowNumber}: status lokasi tidak dikenali.`);
            return;
        }
        const status = rawStatus ? statusFromLegacy(rawStatus) : 'Hadir di Kelas';
        items.push({
            nisn, name, classId: classroom.id, parentName: get('parentName'), parentEmail: get('parentEmail'),
            parentPhone: get('parentPhone'), average: average || '', attendanceRate: attendanceRate ? Number(attendanceRate) : 0,
            status, attendance: legacyAttendance(status), attendanceLog: [], note: get('note'), nis: nisn,
            badges: get('badges').split('|').map(badge => badge.trim()).filter(badge => characterBadges.includes(badge))
        });
    });
    return { items, errors };
}

function diaryCard(note, canEdit) {
    const student = studentById(note.studentId);
    const teacher = data.accounts.find(account => account.email === note.teacherEmail);
    return `<article class="record-card"><span class="eyebrow">${escapeHTML(formatDate(note.date))} · ${escapeHTML(student?.name || 'Siswa')}</span><span class="pill">${escapeHTML(note.category || 'Informasi Umum')}</span><h3>${escapeHTML(note.title)}</h3><p>${escapeHTML(note.content)}</p>
        <footer><span>Ditulis oleh ${escapeHTML(teacher?.name || 'Guru')}${canEdit ? ` · ${note.readAt ? 'Dibaca wali' : 'Belum dibaca'}` : ''}</span>${canEdit ? `<span class="inline-actions"><button type="button" class="small-button" data-action="edit-diary" data-id="${escapeHTML(note.id)}">Edit</button><button type="button" class="small-button" data-action="delete-diary" data-id="${escapeHTML(note.id)}">Hapus</button></span>` : ''}</footer></article>`;
}

function renderDiary(user) {
    const permittedStudents = studentsForUser(user);
    if (user.role === 'parent') {
        let changed = false;
        data.diary.filter(note => permittedStudents.some(student => student.id === note.studentId) && !note.readAt).forEach(note => {
            note.readAt = new Date().toISOString();
            changed = true;
        });
        if (changed) saveData();
    }
    const notes = data.diary.filter(note => permittedStudents.some(student => student.id === note.studentId))
        .sort((a, b) => b.date.localeCompare(a.date));
    const canEdit = user.role === 'teacher';
    const formStudents = user.role === 'teacher'
        ? permittedStudents.map(student => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.name)}</option>`).join('')
        : '';
    const form = canEdit ? `<div class="card"><div class="section-title"><h3>${editingDiaryId ? 'Edit catatan' : 'Tulis catatan buku penghubung'}</h3></div>
        <form data-form="save-diary" data-id="${escapeHTML(editingDiaryId || '')}"><div class="form-grid">
            <div class="field"><label for="diary-student">Siswa</label><select id="diary-student" name="studentId" required>${formStudents}</select></div>
            <div class="field"><label for="diary-date">Tanggal</label><input id="diary-date" name="date" type="date" value="${escapeHTML(dateOffset(0))}" required></div>
            <div class="field"><label for="diary-category">Kategori</label><select id="diary-category" name="category">${diaryCategories.map(category => `<option>${escapeHTML(category)}</option>`).join('')}</select></div>
            <div class="field full"><label for="diary-title">Judul</label><input id="diary-title" name="title" maxlength="100" required></div>
            <div class="field full"><label for="diary-content">Catatan untuk wali murid</label><textarea id="diary-content" name="content" maxlength="1500" required></textarea></div>
        </div><div class="form-actions"><button class="button button-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Simpan catatan</button>${editingDiaryId ? '<button class="button button-secondary" type="button" data-action="cancel-edit-diary">Batal</button>' : ''}</div></form>
        <p class="prototype-footer">Catatan ini dapat dibaca oleh wali murid terkait, tetapi wali murid tidak dapat mengubahnya.</p></div>` : '';
    return `${pageHeading('Buku penghubung', canEdit ? 'Tulis dan kelola catatan harian untuk wali murid di kelas Anda.' : 'Baca catatan dari guru. Wali murid tidak dapat mengedit catatan.', canEdit ? 'GURU' : 'WALI MURID')}
        ${form}<div class="card"><div class="section-title"><h3>${canEdit ? 'Catatan kelas Anda' : 'Catatan untuk anak'}</h3><span class="pill">${notes.length} catatan</span></div>
        ${notes.length ? notes.map(note => diaryCard(note, canEdit)).join('') : emptyState('fa-book-open', 'Belum ada catatan buku penghubung.')}</div>`;
}

function renderChat(user) {
    const rooms = studentsForUser(user).filter(student => user.role !== 'teacher' || parentAccountFor(student));
    if (!rooms.length) return `${pageHeading('Ruang chat', 'Komunikasi langsung antara guru dan wali murid.')}${emptyState('fa-comments', user.role === 'teacher' ? 'Belum ada wali murid yang terhubung dengan siswa di kelas Anda.' : 'Akun ini belum terhubung dengan data anak.')}`;
    if (!rooms.some(student => student.id === activeRoomStudentId)) activeRoomStudentId = rooms[0].id;
    const selected = studentById(activeRoomStudentId);
    let readChanged = false;
    data.messages.filter(message => message.studentId === selected.id && message.senderEmail !== user.email && !message.readAt).forEach(message => {
        message.readAt = new Date().toISOString();
        readChanged = true;
    });
    if (readChanged) saveData();
    const thread = data.messages.filter(message => message.studentId === selected.id).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const teacherEmail = data.classes.find(item => item.id === selected.classId)?.teacherEmail;
    const parentAccount = parentAccountFor(selected);
    const teacher = data.accounts.find(account => account.email === teacherEmail);
    const pendingRequests = user.role === 'teacher'
        ? data.permissionRequests.filter(request => ['Menunggu', 'Perlu konfirmasi'].includes(request.status) && rooms.some(student => student.id === request.studentId))
        : [];
    const parentRequests = user.role === 'parent'
        ? data.permissionRequests.filter(request => request.studentId === selected.id && request.parentEmail === user.email).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [];
    const requestPanel = user.role === 'teacher' && pendingRequests.length ? `<div class="card"><div class="section-title"><div><h3>Pengajuan izin perlu ditinjau</h3><p class="muted">Tinjau pemberitahuan dari wali murid.</p></div><span class="pill warning">${pendingRequests.length} pengajuan</span></div>
        ${pendingRequests.map(request => `<div class="permission-request"><div><strong>${escapeHTML(studentById(request.studentId)?.name || 'Murid')}</strong><small>${escapeHTML(request.reason)} · ${escapeHTML(formatDate(request.date))}</small><span class="pill warning">${escapeHTML(request.status)}</span>${request.attachment ? `<a href="${escapeHTML(request.attachment.data)}" target="_blank" rel="noopener">Lihat lampiran</a>` : ''}</div><span class="inline-actions"><button class="small-button" type="button" data-action="resolve-leave" data-id="${escapeHTML(request.id)}" data-status="Disetujui">Setujui</button><button class="small-button" type="button" data-action="resolve-leave" data-id="${escapeHTML(request.id)}" data-status="${request.status === 'Menunggu' ? 'Perlu konfirmasi' : 'Menunggu'}">${request.status === 'Menunggu' ? 'Perlu konfirmasi' : 'Kembalikan ke antrean'}</button></span></div>`).join('')}</div>` : '';
    const visibleRooms = rooms.filter(student => {
        const contactName = user.role === 'teacher'
            ? (parentAccountFor(student)?.name || student.parentName || 'Wali murid')
            : (data.accounts.find(account => account.email === data.classes.find(item => item.id === student.classId)?.teacherEmail)?.name || 'Guru');
        return `${student.name} ${contactName}`.toLowerCase().includes(chatSearchQuery);
    });
    const roomList = visibleRooms.map(student => {
        const contactName = user.role === 'teacher'
            ? (parentAccountFor(student)?.name || student.parentName || 'Wali murid')
            : (data.accounts.find(account => account.email === data.classes.find(item => item.id === student.classId)?.teacherEmail)?.name || 'Guru');
        const lastMessage = data.messages.filter(message => message.studentId === student.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
        const unreadCount = data.messages.filter(message => message.studentId === student.id && message.senderEmail !== user.email && !message.readAt).length;
        return `<button class="room-button ${selected.id === student.id ? 'active' : ''}" type="button" data-action="open-room" data-id="${escapeHTML(student.id)}" data-chat-room data-search="${escapeHTML(`${student.name} ${contactName}`.toLowerCase())}">
            <span class="avatar status-avatar ${statusTone(student.status)}">${escapeHTML(student.status === 'Di UKS' ? '✚' : student.status === 'Menunggu Dijemput' ? '↗' : student.status === 'Izin/Sakit' ? '!' : '•')}</span>
            <span class="room-summary"><strong>${escapeHTML(student.name)} (${escapeHTML(contactName)})</strong><small>${escapeHTML(lastMessage?.text || student.status)}</small></span>
            <span class="room-meta">${lastMessage ? `<small>${escapeHTML(formatDateTime(lastMessage.sentAt))}</small>` : ''}${unreadCount ? `<span class="unread-badge">${unreadCount}</span>` : ''}</span>
        </button>`;
    }).join('');
    const outsideHours = new Date().getHours() < 7 || new Date().getHours() >= 16;
    const messages = thread.map(message => {
        const sender = data.accounts.find(account => account.email === message.senderEmail);
        const mine = message.senderEmail === user.email;
        const attachment = message.attachment
            ? (message.attachment.type.startsWith('image/')
                ? `<a href="${escapeHTML(message.attachment.data)}" target="_blank" rel="noopener"><img class="message-attachment" src="${escapeHTML(message.attachment.data)}" alt="${escapeHTML(message.attachment.name)}"></a>`
                : `<a class="message-file" href="${escapeHTML(message.attachment.data)}" download="${escapeHTML(message.attachment.name)}"><i class="fa-solid fa-file-arrow-down"></i> ${escapeHTML(message.attachment.name)}</a>`)
            : '';
        return `<div class="message ${mine ? 'mine' : ''}"><strong>${escapeHTML(mine ? 'Anda' : sender?.name || 'Pengguna')}</strong><div>${escapeHTML(message.text)}</div>${attachment}<small>${escapeHTML(formatDateTime(message.sentAt))}${mine ? ` · ${message.readAt ? 'Dibaca' : 'Terkirim'}` : ''}</small></div>`;
    }).join('');
    return `${pageHeading('Ruang chat', 'Percakapan privat antara guru dan wali murid berdasarkan siswa.', 'KOMUNIKASI SEKOLAH')}
        ${requestPanel}
        <div class="split-layout"><div class="card"><div class="section-title"><h3>${user.role === 'teacher' ? 'Kontak keluarga' : 'Wali kelas'}</h3></div><label class="search-field chat-search-field"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-chat-search value="${escapeHTML(chatSearchQuery)}" placeholder="Cari nama murid atau wali" aria-label="Cari nama murid atau wali"></label><div class="room-list">
            ${roomList}<p class="empty-state ${visibleRooms.length ? 'hidden' : ''}" data-chat-empty>Tidak ada kontak yang cocok.</p></div><p class="prototype-footer">Ruang privat 1-on-1 · percakapan tersimpan di browser ini.</p></div>
        <div class="card chat-card"><div class="chat-head"><div><h3>${escapeHTML(selected.name)} · ${escapeHTML(parentAccount?.name || selected.parentName || 'Wali belum terhubung')}</h3><small class="muted">Wali kelas: ${escapeHTML(teacher?.name || 'Belum ditugaskan')} · ${escapeHTML(className(selected.classId))}</small></div><span class="pill ${statusTone(selected.status)}">${escapeHTML(selected.status)}</span></div>
            ${user.role === 'parent' && outsideHours ? '<p class="quiet-hours"><i class="fa-regular fa-clock"></i> Pesan di luar jam operasional sekolah. Guru akan merespons pada jam kerja berikutnya.</p>' : ''}
            ${user.role === 'parent' ? `<form class="leave-request-form" data-form="request-leave" data-student-id="${escapeHTML(selected.id)}"><strong><i class="fa-solid fa-envelope-open-text"></i> Ajukan izin tidak masuk</strong><div class="leave-request-fields"><select name="reason" aria-label="Kategori izin">${leaveReasons.map(reason => `<option>${reason}</option>`).join('')}</select><input name="date" type="date" value="${escapeHTML(dateOffset(0))}" required><input name="attachment" type="file" accept="image/*,.pdf,application/pdf"><button class="small-button" type="submit">Kirim izin</button></div></form>
                ${parentRequests.length ? `<div class="parent-leave-history"><strong>Status pengajuan izin</strong>${parentRequests.map(request => `<p>${escapeHTML(formatDate(request.date))} · ${escapeHTML(request.reason)} <span class="pill ${request.status === 'Disetujui' ? 'success' : request.status === 'Menunggu' ? 'warning' : ''}">${escapeHTML(request.status)}</span></p>`).join('')}</div>` : ''}` : ''}
            <div class="chat-messages" aria-live="polite">${messages || emptyState('fa-comment-dots', 'Belum ada pesan. Mulai percakapan dengan mengirim pesan.')}</div>
            <form class="chat-compose" data-form="send-message" data-student-id="${escapeHTML(selected.id)}"><input name="text" maxlength="1000" placeholder="Tulis pesan..." aria-label="Tulis pesan"><label class="attachment-picker" title="Lampirkan gambar atau PDF"><i class="fa-solid fa-paperclip"></i><input name="attachment" type="file" accept="image/*,.pdf,application/pdf" hidden></label>${user.role === 'parent' ? '<button class="small-button" type="button" data-action="check-message-tone">Periksa nada</button>' : ''}<button class="button button-primary" type="submit" aria-label="Kirim pesan"><i class="fa-solid fa-paper-plane"></i></button></form>
            ${user.role === 'parent' ? '<div class="tone-suggestion hidden" data-tone-suggestion role="status"><p data-tone-copy></p><button class="small-button" type="button" data-action="apply-tone-suggestion">Gunakan saran</button></div>' : ''}
        </div></div>`;
}

function renderCalendar(user) {
    const now = new Date();
    const monthDate = new Date(now.getFullYear(), now.getMonth() + calendarMonthOffset, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const monthLabel = monthDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const monthEvents = data.events.filter(item => item.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`))
        .sort((a, b) => a.date.localeCompare(b.date));
    const selectedEvents = monthEvents.filter(item => item.date === selectedCalendarDate);
    const weekdays = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const calendarCells = Array.from({ length: dayCount }, (_, index) => {
        const day = index - firstWeekday + 1;
        if (day < 1 || day > daysInMonth) return '<span class="calendar-day outside-month" aria-hidden="true"></span>';
        const dateValue = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = monthEvents.some(item => item.date === dateValue);
        return `<button type="button" class="calendar-day ${dateValue === localDateValue(now) ? 'today' : ''} ${dateValue === selectedCalendarDate ? 'selected' : ''}" data-action="select-calendar-date" data-date="${dateValue}" aria-label="${escapeHTML(formatDate(dateValue))}${hasEvent ? ', ada agenda' : ''}"><span>${day}</span>${hasEvent ? '<i></i>' : ''}</button>`;
    }).join('');
    const form = user.role !== 'parent' ? `<div class="card"><div class="section-title"><div><h3>Buat agenda baru</h3><p class="muted">Informasi kegiatan tampil di kalender kelas.</p></div><span class="calendar-form-icon"><i class="fa-solid fa-pencil"></i></span></div>
        <form data-form="create-event"><div class="form-grid">
            <div class="field"><label for="event-title">Nama kegiatan</label><input id="event-title" name="title" maxlength="100" placeholder="Contoh: Pentas seni kelas" required></div>
            <div class="field"><label for="event-date">Tanggal</label><input id="event-date" name="date" type="date" value="${escapeHTML(selectedCalendarDate)}" min="${escapeHTML(dateOffset(0))}" required></div>
            <div class="field"><label for="event-time">Waktu</label><input id="event-time" name="time" type="time"></div>
            <div class="field"><label for="event-location">Lokasi</label><input id="event-location" name="location" maxlength="100" placeholder="Contoh: Aula sekolah"></div>
            <div class="field"><label for="event-category">Kategori</label><select id="event-category" name="category"><option>Akademik</option><option>Ekstrakurikuler</option><option>Pertemuan</option><option>Kegiatan</option><option>Sekolah</option><option>Libur</option></select></div>
            <div class="field"><label for="event-description">Keterangan</label><input id="event-description" name="description" maxlength="180" placeholder="Informasi tambahan untuk keluarga" required></div>
        </div><button class="button button-primary" type="submit"><i class="fa-solid fa-plus"></i> Tambah agenda</button></form>
        <p class="prototype-footer">Agenda tersimpan lokal di browser dan belum tersinkron ke perangkat keluarga.</p></div>` : '';
    const selectedDateHeading = formatDate(selectedCalendarDate);
    return `${pageHeading('Agenda yang mendekat', 'Satu tempat untuk mengingat kegiatan dan momen penting sekolah.', user.role === 'admin' ? 'ADMIN SEKOLAH' : roleNames[user.role].toUpperCase())}
        <div class="calendar-layout"><div class="card calendar-main-card">
            <section class="month-calendar"><header class="month-calendar-header"><div class="calendar-jump-controls"><span class="calendar-icon"><i class="fa-regular fa-calendar"></i></span><label class="sr-only" for="calendar-month-picker">Pilih bulan dan tahun</label><input id="calendar-month-picker" class="calendar-month-picker" type="month" data-calendar-month value="${year}-${String(month + 1).padStart(2, '0')}" aria-label="Pilih bulan dan tahun"><label class="sr-only" for="calendar-date-picker">Pilih tanggal</label><input id="calendar-date-picker" class="calendar-date-picker" type="date" data-calendar-date value="${escapeHTML(selectedCalendarDate)}" aria-label="Lompat ke tanggal"></div><div class="calendar-controls"><button class="icon-button" type="button" data-action="calendar-month" data-offset="-1" aria-label="Bulan sebelumnya"><i class="fa-solid fa-chevron-left"></i></button><button class="small-button" type="button" data-action="calendar-today">Hari ini</button><button class="icon-button" type="button" data-action="calendar-month" data-offset="1" aria-label="Bulan berikutnya"><i class="fa-solid fa-chevron-right"></i></button></div></header>
                <div class="calendar-weekdays">${weekdays.map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${calendarCells}</div><div class="calendar-legend"><i></i> Ada kegiatan</div>
            </section>
            <div class="section-title selected-agenda-heading"><div><h3>Agenda kelas</h3><p class="muted">${selectedEvents.length} kegiatan · ${escapeHTML(selectedDateHeading)}</p></div><span class="calendar-form-icon"><i class="fa-solid fa-calendar-check"></i></span></div>
            ${eventList(selectedEvents)}
            <div class="section-title all-month-heading"><h3>Agenda bulan ${escapeHTML(monthLabel)}</h3><span class="pill">${monthEvents.length} kegiatan</span></div>
            ${eventList(monthEvents)}
        </div><div class="calendar-form-column">${form}</div></div>`;
}

function renderChild(user) {
    const child = studentsForUser(user)[0];
    if (!child) return `${pageHeading('Informasi anak', 'Informasi akademik dan kelas anak Anda.')}${emptyState('fa-child', 'Akun ini belum dihubungkan dengan data anak.')}`;
    const teacherEmail = data.classes.find(item => item.id === child.classId)?.teacherEmail;
    const teacher = data.accounts.find(account => account.email === teacherEmail);
    return `${pageHeading('Informasi anak', 'Informasi akademik, kelas, dan wali kelas.', 'WALI MURID')}
        <div class="card">${childSummary(child)}<div class="info-grid"><div class="info-cell"><small>Nama wali kelas</small><strong>${escapeHTML(teacher?.name || 'Belum ditugaskan')}</strong></div><div class="info-cell"><small>Email wali kelas</small><strong>${escapeHTML(teacher?.email || 'Belum tersedia')}</strong></div><div class="info-cell"><small>Tahun ajaran</small><strong>${escapeHTML(data.school.academicYear)}</strong></div></div>
        <p class="prototype-footer">Informasi di atas merupakan data contoh. Hubungi sekolah jika ada data yang perlu diperbarui.</p></div>`;
}

function renderPanduAI(user) {
    const messages = Array.isArray(data.panduChats[user.id]) ? data.panduChats[user.id] : [];
    const prompts = ['Ide belajar menyenangkan di rumah', 'Cara membantu anak fokus saat mengerjakan PR', 'Tips membuat rutinitas belajar yang konsisten'];
    const conversation = `<div class="pandu-message assistant"><span class="pandu-avatar"><i class="fa-solid fa-robot"></i></span><div><strong>ASA AI</strong><p>Halo! Saya bisa membantu dengan ide umum seputar belajar dan pengasuhan. Apa yang ingin Anda tanyakan?</p></div></div>
        ${messages.map(message => `<div class="pandu-message ${message.role === 'parent' ? 'parent' : 'assistant'}">${message.role === 'assistant' ? '<span class="pandu-avatar"><i class="fa-solid fa-robot"></i></span>' : ''}<div><strong>${message.role === 'parent' ? 'Anda' : 'ASA AI'}</strong><p>${escapeHTML(message.text)}</p></div></div>`).join('')}`;
    return `${pageHeading('ASA AI', 'Teman bertanya seputar pengasuhan dan belajar di rumah.', 'PENDAMPING WALI MURID')}
        <section class="pandu-panel card">
            <header class="pandu-header"><span class="pandu-logo"><i class="fa-solid fa-robot"></i></span><div><h3>ASA AI · Gemini</h3><p>Saran umum untuk mendampingi belajar dan pengasuhan.</p></div><span class="pandu-status">● Demo</span></header>
            <div class="pandu-prompts"><span class="muted">Coba tanyakan:</span>${prompts.map(prompt => `<button class="pandu-prompt" type="button" data-action="send-pandu-prompt" data-prompt="${escapeHTML(prompt)}">${escapeHTML(prompt)}</button>`).join('')}</div>
            <div class="pandu-messages" aria-live="polite">${conversation}</div>
            <form class="pandu-compose" data-form="ask-pandu"><label class="sr-only" for="pandu-question">Pertanyaan umum untuk ASA AI</label><textarea id="pandu-question" name="question" maxlength="800" placeholder="Tanyakan hal umum seputar belajar atau pengasuhan..." required></textarea><button class="button button-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Tanya ASA AI</button></form>
            <p class="pandu-disclaimer">Demo ini mengirim pertanyaan dan riwayat chat ke Gemini melalui backend lokal. Jangan tulis nama, sekolah, kondisi, atau informasi pribadi anak. Jawaban AI dapat keliru dan bukan pengganti guru, dokter, psikolog, atau layanan darurat. Chat disimpan di browser ini.</p>
        </section>`;
}

function renderSection(user) {
    switch (activeSection) {
        case 'dashboard': return renderDashboard(user);
        case 'accounts': return user.role === 'admin' ? renderAccounts() : renderDashboard(user);
        case 'school': return user.role === 'admin' ? renderSchool() : renderDashboard(user);
        case 'classes': return user.role === 'teacher' ? renderClasses(user) : renderDashboard(user);
        case 'importStudents': return user.role === 'admin' ? renderStudentImport(user) : renderDashboard(user);
        case 'diary': return renderDiary(user);
        case 'chat': return renderChat(user);
        case 'panduAI': return user.role === 'parent' ? renderPanduAI(user) : renderDashboard(user);
        case 'calendar': return renderCalendar(user);
        case 'child': return user.role === 'parent' ? renderChild(user) : renderDashboard(user);
        default: return renderDashboard(user);
    }
}

function render() {
    const user = currentUser();
    if (!user) {
        sessionUserId = null;
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch (error) {
            console.error('Sesi ASA demo tidak dapat dibersihkan:', error);
            storageError = storageError || 'Browser membatasi penyimpanan lokal; sesi demo hanya tersedia selama halaman terbuka.';
        }
        if (showLogin) renderLogin();
        else renderLanding();
        return;
    }
    renderShell(user);
}

function setSession(user) {
    sessionUserId = user.id;
    activeSection = 'dashboard';
    activeRoomStudentId = null;
    try {
        localStorage.setItem(SESSION_KEY, user.id);
    } catch (error) {
        console.error('Sesi demo tidak dapat disimpan:', error);
        toast('Sesi hanya berlaku sampai halaman ditutup karena browser menolak penyimpanan.');
    }
    render();
}

function handleAction(action, target) {
    const id = target.dataset.id;
    const actor = currentUser();
    if (action === 'toggle-sidebar') {
        sidebarCollapsed = !sidebarCollapsed;
        render();
    } else if (action === 'show-login') {
        loginError = '';
        showLogin = true;
        render();
    } else if (action === 'back-landing') {
        loginError = '';
        showLogin = false;
        render();
    } else if (action === 'fill-demo-email') {
        const emailInput = document.getElementById('login-email');
        if (!emailInput || !data.accounts.some(account => account.email === target.dataset.email && account.active)) return;
        emailInput.value = target.dataset.email;
        emailInput.focus();
    } else if (action === 'send-pandu-prompt') {
        if (actor?.role !== 'parent') return;
        const input = document.querySelector('[data-form="ask-pandu"] [name="question"]');
        if (!input) return;
        input.value = target.dataset.prompt || '';
        input.form.requestSubmit();
    } else if (action === 'check-message-tone') {
        if (actor?.role !== 'parent') return;
        const form = target.closest('[data-form="send-message"]');
        const textInput = form?.elements.text;
        const suggestion = document.querySelector('[data-tone-suggestion]');
        const copy = document.querySelector('[data-tone-copy]');
        if (!textInput?.value.trim() || !suggestion || !copy) return toast('Tulis pesan terlebih dahulu untuk memeriksa nadanya.');
        const heated = /\b(bodoh|goblok|tolol|brengsek|tidak becus|gak becus|nggak becus|parah banget|marah sekali|sangat kesal)\b/i.test(textInput.value);
        copy.textContent = heated
            ? 'Pesan mungkin terdengar cukup keras. Saran ASA AI: “Mohon bantuannya untuk menjelaskan situasi ini dan langkah tindak lanjut yang dapat dilakukan. Saya berharap kita dapat berdiskusi dan mencari solusi bersama.”'
            : 'Pesan tidak memuat kata-kata bernada tinggi yang dikenali. Silakan baca kembali sebelum dikirim.';
        suggestion.dataset.rewrite = heated ? 'Mohon bantuannya untuk menjelaskan situasi ini dan langkah tindak lanjut yang dapat dilakukan. Saya berharap kita dapat berdiskusi dan mencari solusi bersama.' : '';
        suggestion.classList.remove('hidden');
        const applyButton = suggestion.querySelector('[data-action="apply-tone-suggestion"]');
        if (applyButton) applyButton.hidden = !heated;
    } else if (action === 'apply-tone-suggestion') {
        if (actor?.role !== 'parent') return;
        const suggestion = document.querySelector('[data-tone-suggestion]');
        const textInput = document.querySelector('[data-form="send-message"] [name="text"]');
        if (!suggestion?.dataset.rewrite || !textInput) return;
        textInput.value = suggestion.dataset.rewrite;
        suggestion.classList.add('hidden');
        textInput.focus();
    } else if (action === 'edit-student' || action === 'give-badge') {
        openStudentDialog(action, id);
    } else if (action === 'close-student-dialog') {
        target.closest('dialog')?.close();
        target.closest('dialog')?.remove();
    } else if (action === 'create-import-class') {
        if (actor?.role !== 'admin') return;
        const grade = document.querySelector('[data-import-grade]')?.value;
        if (!gradeNumbers.includes(grade)) return toast('Pilih tingkat kelas dari 1 sampai 6.');
        let classroom = data.classes.find(item => gradeFromClass(item) === grade);
        if (!classroom) {
            const name = `Kelas ${grade}`;
            const demoTeacher = data.accounts.find(account => account.email === DEMO_TEACHER_EMAIL && account.role === 'teacher' && account.active);
            if (demoTeacher) data.classes.forEach(item => { if (item.teacherEmail === demoTeacher.email) item.teacherEmail = ''; });
            classroom = { id: makeId('class'), name, level: name, teacherEmail: demoTeacher?.email || '' };
            data.classes.push(classroom);
        }
        importTargetClassId = classroom.id;
        if (saveData()) {
            toast(`${classroom.name} siap menjadi kelas tujuan impor.`);
            render();
        }
    } else if (action === 'cancel-student-import') {
        pendingStudentImport = null;
        render();
    } else if (action === 'apply-student-import') {
        if (actor?.role !== 'admin' || !pendingStudentImport) return;
        const classroom = importClassForUser(actor);
        if (!classroom) return toast('Pilih kelas tujuan sebelum mengimpor data.');
        const conflicts = pendingStudentImport.items.filter(item => data.students.some(student => student.nisn === item.nisn && student.classId !== classroom.id));
        if (conflicts.length) return toast(`NISN ${conflicts[0].nisn} sudah digunakan di kelas lain. Tidak ada perubahan disimpan.`);
        let updatedCount = 0;
        let addedCount = 0;
        pendingStudentImport.items.forEach(item => {
            const existing = data.students.find(student => student.nisn === item.nisn && student.classId === classroom.id);
            if (existing) {
                Object.assign(existing, item);
                updatedCount++;
            } else {
                data.students.push({ id: makeId('student'), ...item });
                addedCount++;
            }
        });
        const demoTeacher = data.accounts.find(account => account.email === DEMO_TEACHER_EMAIL && account.role === 'teacher' && account.active);
        if (demoTeacher) {
            data.classes.forEach(item => { if (item.teacherEmail === demoTeacher.email) item.teacherEmail = ''; });
            classroom.teacherEmail = demoTeacher.email;
        }
        const demoParent = data.accounts.find(account => account.email === DEMO_PARENT_EMAIL && account.role === 'parent' && account.active);
        const firstImportedStudent = data.students.find(student =>
            student.classId === classroom.id && student.nisn === pendingStudentImport.items[0]?.nisn);
        if (demoParent && firstImportedStudent) demoParent.childId = firstImportedStudent.id;
        pendingStudentImport = null;
        if (saveData()) {
            toast(`${addedCount} siswa ditambahkan${updatedCount ? `, ${updatedCount} data diperbarui` : ''}.`);
            render();
        }
    } else if (action === 'download-student-template' || action === 'export-class-csv') {
        if (actor?.role !== 'admin') return;
        const classroom = action === 'export-class-csv' ? importClassForUser(actor) : null;
        if (action === 'export-class-csv' && !classroom) return toast('Pilih kelas tujuan sebelum mengunduh data.');
        const header = ['nisn', 'nama_siswa', 'nama_orang_tua', 'email_wali', 'no_hp', 'nilai_rata_rata', 'kehadiran_bulanan', 'status_lokasi', 'kelas', 'catatan', 'lencana'];
        const rows = [header];
        if (action === 'export-class-csv') {
            data.students.filter(student => student.classId === classroom.id).forEach(student => rows.push([
                student.nisn, student.name, student.parentName, student.parentEmail, student.parentPhone,
                student.average, student.attendanceRate, student.status, classroom.name, student.note, student.badges.join('|')
            ]));
        }
        try {
            downloadCSV(action === 'export-class-csv' ? 'rekap-murid.csv' : 'template-data-murid.csv', rows);
        } catch (error) {
            console.error('CSV murid gagal diunduh:', error);
            toast('File CSV gagal diunduh dari browser.');
        }
    } else if (action === 'save-class-pdf') {
        if (!['admin', 'teacher'].includes(actor?.role)) return;
        const classroom = actor.role === 'admin' ? importClassForUser(actor) : currentClassForTeacher(actor);
        if (!classroom) return toast('Pilih kelas yang memiliki data sebelum menyimpan PDF.');
        try {
            downloadClassPDF(classroom);
            toast(`PDF ${classroom.name} berhasil disiapkan untuk diunduh.`);
        } catch (error) {
            console.error('PDF daftar siswa gagal dibuat:', error);
            toast('PDF gagal dibuat. Periksa data kelas dan coba lagi.');
        }
    } else if (action === 'calendar-month') {
        calendarMonthOffset += Number(target.dataset.offset);
        const monthDate = new Date();
        monthDate.setDate(1);
        monthDate.setMonth(monthDate.getMonth() + calendarMonthOffset);
        selectedCalendarDate = localDateValue(monthDate);
        render();
    } else if (action === 'calendar-today') {
        calendarMonthOffset = 0;
        selectedCalendarDate = localDateValue(new Date());
        render();
    } else if (action === 'select-calendar-date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(target.dataset.date || '')) return;
        selectedCalendarDate = target.dataset.date;
        render();
    } else if (action === 'resolve-leave') {
        if (actor?.role !== 'teacher') return;
        const request = data.permissionRequests.find(item => item.id === id && ['Menunggu', 'Perlu konfirmasi'].includes(item.status));
        const student = request && studentById(request.studentId);
        if (!request || !student || !studentsForUser(actor).some(item => item.id === student.id)) return toast('Pengajuan izin tidak ditemukan.');
        const nextStatus = target.dataset.status;
        if (!['Disetujui', 'Perlu konfirmasi', 'Menunggu'].includes(nextStatus)) return toast('Status tindak lanjut tidak valid.');
        request.status = nextStatus;
        if (nextStatus === 'Menunggu') {
            delete request.resolvedAt;
            delete request.resolvedBy;
        } else {
            request.resolvedAt = new Date().toISOString();
            request.resolvedBy = actor.email;
        }
        if (request.status === 'Disetujui') {
            student.status = 'Izin/Sakit';
            student.attendance = 'Izin';
            student.attendanceLog = Array.isArray(student.attendanceLog) ? student.attendanceLog : [];
            student.attendanceLog.push({ date: request.date, status: 'Izin/Sakit' });
        }
        if (saveData()) {
            toast(`Pengajuan ${request.status.toLowerCase()}.`);
            render();
        }
    } else if (action === 'logout') {
        sessionUserId = null;
        activeSection = 'dashboard';
        showLogin = false;
        try { localStorage.removeItem(SESSION_KEY); } catch (error) { console.error('Sesi demo tidak dapat dihapus:', error); }
        render();
    } else if (action === 'navigate') {
        activeSection = target.dataset.section;
        editingDiaryId = null;
        render();
    } else if (action === 'open-room') {
        if (!actor || !studentsForUser(actor).some(student => student.id === id)) return;
        activeRoomStudentId = id;
        activeSection = 'chat';
        render();
    } else if (action === 'show-class-student') {
        if (actor?.role !== 'teacher' || !studentsForUser(actor).some(student => student.id === id)) return;
        activeClassStudentId = activeClassStudentId === id ? null : id;
        activeSection = 'classes';
        render();
    } else if (action === 'toggle-account') {
        if (actor?.role !== 'admin') return;
        const account = data.accounts.find(item => item.id === id);
        if (!account || account.role === 'admin') return;
        account.active = !account.active;
        if (account.email === currentUser()?.email && !account.active) sessionUserId = null;
        if (saveData()) {
            toast(account.active ? 'Akses akun diaktifkan.' : 'Akses akun dinonaktifkan.');
            render();
        }
    } else if (action === 'delete-account') {
        if (actor?.role !== 'admin') return;
        const account = data.accounts.find(item => item.id === id);
        if (!account || account.role === 'admin') return;
        if (!window.confirm(`Hapus akun ${account.name}? Data terkait tetap tersimpan.`)) return;
        data.accounts = data.accounts.filter(item => item.id !== id);
        data.classes.forEach(item => { if (item.teacherEmail === account.email) item.teacherEmail = ''; });
        data.students.forEach(item => { if (item.parentEmail === account.email) item.parentEmail = ''; });
        if (saveData()) {
            toast('Akun dihapus.');
            render();
        }
    } else if (action === 'delete-student') {
        if (actor?.role !== 'admin') return;
        const student = studentById(id);
        if (!student || !window.confirm(`Hapus data ${student.name} beserta catatan, pesan, dan pengajuan izin terkait? Tindakan ini tidak dapat dibatalkan.`)) return;
        data.students = data.students.filter(item => item.id !== student.id);
        data.diary = data.diary.filter(item => item.studentId !== student.id);
        data.messages = data.messages.filter(item => item.studentId !== student.id);
        data.permissionRequests = data.permissionRequests.filter(item => item.studentId !== student.id);
        data.accounts.forEach(account => { if (account.childId === student.id) delete account.childId; });
        if (saveData()) {
            toast(`Data ${student.name} dan catatan terkait dihapus.`);
            render();
        }
    } else if (action === 'delete-class') {
        if (actor?.role !== 'admin') return;
        const classroom = data.classes.find(item => item.id === id);
        if (!classroom) return;
        if (data.students.some(student => student.classId === id)) {
            toast('Kelas tidak dapat dihapus karena masih memiliki siswa.');
            return;
        }
        if (!window.confirm(`Hapus ${classroom.name}?`)) return;
        data.classes = data.classes.filter(item => item.id !== id);
        if (saveData()) render();
    } else if (action === 'delete-event') {
        if (actor?.role !== 'admin') return;
        const event = data.events.find(item => item.id === id);
        if (!event || !window.confirm(`Hapus agenda "${event.title}"?`)) return;
        data.events = data.events.filter(item => item.id !== id);
        if (saveData()) render();
    } else if (action === 'edit-diary') {
        if (actor?.role !== 'teacher') return;
        const note = data.diary.find(item => item.id === id && item.teacherEmail === currentUser()?.email);
        if (!note) return;
        editingDiaryId = id;
        render();
        const form = document.querySelector('[data-form="save-diary"]');
        if (form) {
            form.elements.studentId.value = note.studentId;
            form.elements.date.value = note.date;
            form.elements.title.value = note.title;
            form.elements.content.value = note.content;
            if (form.elements.category) form.elements.category.value = note.category || 'Akademik';
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else if (action === 'delete-diary') {
        if (actor?.role !== 'teacher') return;
        const note = data.diary.find(item => item.id === id && item.teacherEmail === currentUser()?.email);
        if (!note || !window.confirm(`Hapus catatan "${note.title}"?`)) return;
        data.diary = data.diary.filter(item => item.id !== id);
        if (saveData()) {
            toast('Catatan dihapus.');
            render();
        }
    } else if (action === 'cancel-edit-diary') {
        editingDiaryId = null;
        render();
    }
}

async function handleSubmit(form) {
    const formData = new FormData(form);
    const value = name => String(formData.get(name) || '').trim();
    const user = currentUser();
    const type = form.dataset.form;
    if (type === 'login') {
        const email = value('email').toLowerCase();
        const account = data.accounts.find(item => item.email.toLowerCase() === email && item.active);
        if (!account) {
            loginError = 'Email tidak ditemukan atau akun tidak aktif. Periksa kembali alamat email.';
            render();
            return;
        }
        loginError = '';
        setSession(account);
        return;
    }
    if (!user) return;
    if (type === 'create-account' && user.role === 'admin') {
        const name = value('name');
        const email = value('email').toLowerCase();
        const role = value('role');
        if (!name || !email || !['teacher', 'parent'].includes(role)) return toast('Lengkapi nama, email, dan peran yang valid.');
        if (data.accounts.some(account => account.email.toLowerCase() === email)) return toast('Email tersebut sudah terdaftar.');
        const account = { id: makeId('user'), name, email, role, active: true };
        const link = value('link');
        if (role === 'teacher' && link.startsWith('class:')) {
            const classroom = data.classes.find(item => item.id === link.slice(6));
            if (classroom) {
                const previous = data.accounts.find(item => item.email === classroom.teacherEmail);
                if (previous) toast(`Wali kelas ${classroom.name} diperbarui.`);
                classroom.teacherEmail = email;
            }
        }
        if (role === 'parent' && link.startsWith('student:')) {
            const child = studentById(link.slice(8));
            if (child) {
                account.childId = child.id;
                child.parentEmail = email;
            }
        }
        data.accounts.push(account);
        if (saveData()) {
            toast('Akun demo ditambahkan.');
            render();
        }
    } else if (type === 'update-account' && user.role === 'admin') {
        const account = data.accounts.find(item => item.id === form.dataset.id);
        const role = value('role');
        const link = value('link');
        if (!account || !['admin', 'teacher', 'parent'].includes(role)) return toast('Akun atau peran tidak valid.');
        if (account.id === user.id && role !== 'admin') return toast('Peran admin yang sedang digunakan tidak dapat diturunkan.');
        if (account.role === 'admin' && role !== 'admin' &&
            data.accounts.filter(item => item.role === 'admin' && item.active).length <= 1) {
            return toast('Perlu ada setidaknya satu admin sekolah aktif.');
        }
        data.classes.forEach(item => { if (item.teacherEmail === account.email) item.teacherEmail = ''; });
        data.students.forEach(item => { if (item.parentEmail === account.email) item.parentEmail = ''; });
        account.role = role;
        delete account.childId;
        if (role === 'teacher' && link.startsWith('class:')) {
            const classroom = data.classes.find(item => item.id === link.slice(6));
            if (classroom) classroom.teacherEmail = account.email;
        } else if (role === 'parent' && link.startsWith('student:')) {
            const child = studentById(link.slice(8));
            if (child) {
                account.childId = child.id;
                child.parentEmail = account.email;
            }
        }
        if (saveData()) {
            toast('Peran dan penempatan akun diperbarui.');
            render();
        }
    } else if (type === 'save-school' && user.role === 'admin') {
        data.school = { name: value('name'), academicYear: value('academicYear'), address: value('address') };
        if (saveData()) {
            toast('Profil sekolah diperbarui.');
            render();
        }
    } else if (type === 'create-class' && user.role === 'admin') {
        const grade = value('grade');
        if (!gradeNumbers.includes(grade)) return toast('Pilih tingkat kelas dari 1 sampai 6.');
        if (data.classes.some(item => gradeFromClass(item) === grade)) return toast(`Kelas ${grade} sudah dibuat.`);
        const name = `Kelas ${grade}`;
        const teacherEmail = value('teacherEmail');
        if (teacherEmail) data.classes.forEach(item => { if (item.teacherEmail === teacherEmail) item.teacherEmail = ''; });
        data.classes.push({ id: makeId('class'), name, level: name, teacherEmail });
        if (saveData()) {
            toast('Kelas ditambahkan.');
            render();
        }
    } else if (type === 'update-class' && user.role === 'admin') {
        const classroom = data.classes.find(item => item.id === form.dataset.id);
        const grade = value('grade');
        const teacherEmail = value('teacherEmail');
        if (!classroom) return toast('Kelas yang dipilih tidak ditemukan.');
        if (!gradeNumbers.includes(grade)) return toast('Pilih tingkat kelas dari 1 sampai 6.');
        if (data.classes.some(item => item.id !== classroom.id && gradeFromClass(item) === grade)) return toast(`Kelas ${grade} sudah dibuat.`);
        if (teacherEmail) data.classes.forEach(item => { if (item.id !== classroom.id && item.teacherEmail === teacherEmail) item.teacherEmail = ''; });
        const name = `Kelas ${grade}`;
        classroom.name = name;
        classroom.level = name;
        classroom.teacherEmail = teacherEmail;
        if (saveData()) {
            toast('Informasi kelas diperbarui.');
            render();
        }
    } else if (type === 'update-student' && ['admin', 'teacher'].includes(user.role)) {
        const student = studentById(form.dataset.studentId);
        if (!student || (user.role === 'teacher' && !studentsForUser(user).some(item => item.id === student.id))) return toast('Data murid tidak tersedia untuk akun ini.');
        const nisn = value('nisn');
        if (!nisn || data.students.some(item => item.id !== student.id && item.nisn === nisn)) return toast('NISN wajib diisi dan harus unik.');
        const average = value('average');
        if (average && (Number(average) < 0 || Number(average) > 100)) return toast('Nilai rata-rata harus antara 0 dan 100.');
        const previousParentEmail = student.parentEmail;
        student.name = value('name');
        student.nisn = nisn;
        student.nis = nisn;
        student.parentName = value('parentName');
        student.parentEmail = value('parentEmail').toLowerCase();
        student.parentPhone = value('parentPhone');
        student.average = average;
        if (previousParentEmail !== student.parentEmail) {
            const previousParent = data.accounts.find(account => account.email === previousParentEmail && account.childId === student.id);
            if (previousParent) delete previousParent.childId;
            const newParent = data.accounts.find(account => account.email === student.parentEmail && account.role === 'parent');
            if (newParent) newParent.childId = student.id;
        }
        if (saveData()) {
            toast('Data dasar murid diperbarui.');
            render();
        }
    } else if (type === 'add-student-badge' && user.role === 'teacher') {
        const student = studentById(form.dataset.studentId);
        const badge = value('badge');
        if (!student || !studentsForUser(user).some(item => item.id === student.id) || !characterBadges.includes(badge)) return toast('Murid atau lencana tidak valid.');
        if (student.badges.includes(badge)) return toast('Lencana tersebut sudah dimiliki murid ini.');
        student.badges.push(badge);
        const reason = value('reason');
        if (reason) student.note = reason;
        if (saveData()) {
            toast(`Lencana ${badge} diberikan kepada ${student.name}.`);
            render();
        }
    } else if (type === 'save-diary' && user.role === 'teacher') {
        const student = studentById(value('studentId'));
        const classroom = currentClassForTeacher(user);
        if (!student || !classroom || student.classId !== classroom.id) return toast('Pilih siswa dari kelas yang Anda ampu.');
        const note = {
            id: form.dataset.id || makeId('diary'),
            studentId: student.id,
            teacherEmail: user.email,
            date: value('date'),
            title: value('title'),
            content: value('content'),
            category: value('category') || 'Akademik',
            readAt: null
        };
        const existingIndex = data.diary.findIndex(item => item.id === note.id && item.teacherEmail === user.email);
        if (existingIndex >= 0) data.diary[existingIndex] = note;
        else data.diary.push(note);
        editingDiaryId = null;
        if (saveData()) {
            toast(existingIndex >= 0 ? 'Catatan diperbarui.' : 'Catatan ditambahkan.');
            render();
        }
    } else if (type === 'send-message') {
        const studentId = form.dataset.studentId;
        if (!studentsForUser(user).some(student => student.id === studentId)) return toast('Percakapan tidak tersedia untuk akun ini.');
        const text = value('text');
        const attachmentFile = form.elements.attachment?.files?.[0];
        if (!text && !attachmentFile) return toast('Tulis pesan atau pilih lampiran terlebih dahulu.');
        let attachment;
        try {
            attachment = await readAttachment(attachmentFile);
        } catch (error) {
            return toast(error.message);
        }
        data.messages.push({ id: makeId('message'), studentId, senderEmail: user.email, text, attachment, sentAt: new Date().toISOString(), readAt: null });
        activeRoomStudentId = studentId;
        if (saveData()) {
            const now = new Date();
            if (user.role === 'parent' && (now.getHours() < 7 || now.getHours() >= 16)) toast('Pesan terkirim di browser ini. Guru akan merespons pada jam kerja berikutnya.');
            render();
        }
    } else if (type === 'request-leave' && user.role === 'parent') {
        const studentId = form.dataset.studentId;
        const student = studentById(studentId);
        if (!student || (student.parentEmail !== user.email && user.childId !== student.id)) return toast('Data anak tidak terhubung dengan akun ini.');
        const reason = value('reason');
        if (!leaveReasons.includes(reason)) return toast('Pilih kategori pengajuan Sakit atau Izin.');
        const leaveDate = value('date');
        if (!leaveDate) return toast('Tanggal izin wajib dipilih.');
        let attachment;
        try {
            attachment = await readAttachment(form.elements.attachment?.files?.[0]);
        } catch (error) {
            return toast(error.message);
        }
        data.permissionRequests.push({ id: makeId('leave'), studentId, parentEmail: user.email, reason, date: leaveDate, attachment, status: 'Menunggu', createdAt: new Date().toISOString() });
        if (saveData()) {
            toast('Pengajuan izin tersimpan di browser ini.');
            render();
        }
    } else if (type === 'ask-pandu' && user.role === 'parent') {
        const question = value('question');
        if (!question) return toast('Tulis pertanyaan untuk ASA AI terlebih dahulu.');
        const thread = Array.isArray(data.panduChats[user.id]) ? data.panduChats[user.id] : [];
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonHTML = submitButton?.innerHTML;
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Menunggu jawaban...';
            submitButton.setAttribute('aria-busy', 'true');
        }
        try {
            const response = await fetch('/api/gemini-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, history: thread.slice(-10) })
            });
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error('Backend ASA AI memberikan respons yang tidak terbaca.');
            }
            if (!response.ok) throw new Error(result.error || 'Gemini gagal menjawab. Coba lagi nanti.');
            if (typeof result.reply !== 'string' || !result.reply.trim()) {
                throw new Error('Gemini tidak mengembalikan jawaban. Coba ajukan pertanyaan lain.');
            }
            const now = new Date().toISOString();
            data.panduChats[user.id] = [
                ...thread,
                { role: 'parent', text: question, sentAt: now },
                { role: 'assistant', text: result.reply.trim(), sentAt: new Date().toISOString() }
            ].slice(-60);
            if (saveData()) {
                activeSection = 'panduAI';
                render();
                document.querySelector('.pandu-messages .pandu-message:last-child')?.scrollIntoView({ block: 'nearest' });
            }
        } catch (error) {
            console.error('ASA AI gagal mendapatkan jawaban Gemini:', error);
            toast(error.message || 'ASA AI tidak dapat terhubung. Jalankan backend lokal dan periksa konfigurasi Gemini.');
        } finally {
            if (submitButton?.isConnected) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonHTML;
                submitButton.removeAttribute('aria-busy');
            }
        }
    } else if (type === 'create-event' && ['admin', 'teacher'].includes(user.role)) {
        const eventDate = value('date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || eventDate < dateOffset(0)) return toast('Pilih tanggal agenda hari ini atau setelahnya.');
        data.events.push({ id: makeId('event'), title: value('title'), date: eventDate, time: value('time'), location: value('location'), category: value('category'), description: value('description'), createdBy: user.email });
        selectedCalendarDate = eventDate;
        const [eventYear, eventMonth] = eventDate.split('-').map(Number);
        const today = new Date();
        calendarMonthOffset = (eventYear - today.getFullYear()) * 12 + eventMonth - 1 - today.getMonth();
        if (saveData()) {
            toast('Agenda ditambahkan ke kalender.');
            render();
        }
    }
}

document.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (target) handleAction(target.dataset.action, target);
});

document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    handleSubmit(form);
});

document.addEventListener('input', event => {
    const chatSearch = event.target.closest('[data-chat-search]');
    if (chatSearch) {
        chatSearchQuery = chatSearch.value.trim().toLowerCase();
        const rooms = [...document.querySelectorAll('[data-chat-room]')];
        let visible = 0;
        rooms.forEach(room => {
            room.hidden = !room.dataset.search.includes(chatSearchQuery);
            if (!room.hidden) visible++;
        });
        const empty = document.querySelector('[data-chat-empty]');
        if (empty) empty.classList.toggle('hidden', visible > 0);
        return;
    }
    const input = event.target.closest('[data-class-search]');
    if (!input) return;
    classSearchQuery = input.value.trim().toLowerCase();
    refreshClassFilters();
});

function refreshClassFilters() {
    const rows = [...document.querySelectorAll('[data-student-row]')];
    let visibleCount = 0;
    rows.forEach(row => {
        const matches = row.dataset.search.includes(classSearchQuery) &&
            (classStatusFilter === 'all' || row.dataset.status === classStatusFilter);
        row.hidden = !matches;
        if (matches) visibleCount++;
    });
    const count = document.querySelector('[data-class-count]');
    const empty = document.querySelector('[data-class-empty]');
    if (count) count.textContent = `${visibleCount} dari ${rows.length} murid`;
    if (empty) empty.classList.toggle('hidden', rows.length === 0 || visibleCount > 0);
}

document.addEventListener('change', async event => {
    const importClassSelect = event.target.closest('[data-import-class]');
    if (importClassSelect) {
        const actor = currentUser();
        if (actor?.role !== 'admin' || !data.classes.some(classroom => classroom.id === importClassSelect.value)) {
            toast('Kelas tujuan impor tidak valid.');
            return render();
        }
        importTargetClassId = importClassSelect.value;
        pendingStudentImport = null;
        render();
        return;
    }
    const monthPicker = event.target.closest('[data-calendar-month]');
    if (monthPicker) {
        const match = /^(\d{4})-(\d{2})$/.exec(monthPicker.value);
        if (!match) return;
        const selectedYear = Number(match[1]);
        const selectedMonth = Number(match[2]) - 1;
        const currentDate = new Date();
        calendarMonthOffset = (selectedYear - currentDate.getFullYear()) * 12 + selectedMonth - currentDate.getMonth();
        selectedCalendarDate = localDateValue(new Date(selectedYear, selectedMonth, 1));
        render();
        return;
    }
    const datePicker = event.target.closest('[data-calendar-date]');
    if (datePicker) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePicker.value);
        if (!match) return;
        const selectedYear = Number(match[1]);
        const selectedMonth = Number(match[2]) - 1;
        const selectedDay = Number(match[3]);
        const selectedDate = new Date(selectedYear, selectedMonth, selectedDay);
        if (selectedDate.getFullYear() !== selectedYear || selectedDate.getMonth() !== selectedMonth || selectedDate.getDate() !== selectedDay) {
            toast('Tanggal kalender tidak valid.');
            return;
        }
        selectedCalendarDate = localDateValue(selectedDate);
        const currentDate = new Date();
        calendarMonthOffset = (selectedYear - currentDate.getFullYear()) * 12 + selectedMonth - currentDate.getMonth();
        render();
        return;
    }
    const filter = event.target.closest('[data-status-filter]');
    if (filter) {
        classStatusFilter = filter.value;
        refreshClassFilters();
        return;
    }
    const statusControl = event.target.closest('[data-student-status]');
    if (statusControl) {
        const actor = currentUser();
        const student = studentById(statusControl.dataset.studentStatus);
        if (actor?.role !== 'teacher' || !student || !studentsForUser(actor).some(item => item.id === student.id) ||
            !studentStatuses.includes(statusControl.value)) {
            toast('Pembaruan status tidak dapat dilakukan untuk murid ini.');
            render();
            return;
        }
        student.status = statusControl.value;
        student.attendance = legacyAttendance(student.status);
        student.attendanceLog = Array.isArray(student.attendanceLog) ? student.attendanceLog : [];
        const today = localDateValue(new Date());
        const existingLog = student.attendanceLog.find(log => log.date === today);
        if (existingLog) existingLog.status = student.status;
        else student.attendanceLog.push({ date: today, status: student.status });
        if (saveData()) {
            toast(`Status ${student.name} diperbarui di browser ini.`);
            render();
        }
        return;
    }
    const fileInput = event.target.closest('[data-student-csv]');
    if (!fileInput || !fileInput.files?.[0]) return;
    const actor = currentUser();
    if (actor?.role !== 'admin') return toast('Unggah CSV hanya dapat dilakukan oleh admin sekolah.');
    const classroom = importClassForUser(actor);
    if (!classroom) return toast('Buat kelas tujuan terlebih dahulu sebelum mengunggah CSV.');
    try {
        pendingStudentImport = await prepareStudentImport(fileInput.files[0], classroom);
        render();
        if (pendingStudentImport.errors.length) toast(`${pendingStudentImport.errors.length} baris CSV perlu diperiksa sebelum diimpor.`);
    } catch (error) {
        console.error('CSV murid gagal dibaca:', error);
        toast(error.message || 'File CSV gagal dibaca.');
    }
});

window.addEventListener('storage', event => {
    if (event.key !== DATA_KEY || !event.newValue) return;
    try {
        const parsed = JSON.parse(event.newValue);
        if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.students)) {
            throw new Error('Data ASA lintas tab tidak valid.');
        }
        data = normalizeSchoolData(parsed);
        render();
    } catch (error) {
        console.error('Pembaruan data ASA dari tab lain gagal dibaca:', error);
        toast('Pembaruan dari tab lain tidak dapat dibaca.');
    }
});

loadData();
try {
    sessionUserId = localStorage.getItem(SESSION_KEY);
} catch (error) {
    console.error('Sesi ASA demo tidak dapat dibaca:', error);
}
render();
