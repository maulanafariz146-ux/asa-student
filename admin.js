const Admin = {
    pendingCSVData: null,
    defaultSettings: {
        institution: 'Universitas Smart Analytics',
        period: '',
        ipkRisk: 2.5,
        ipkWarning: 2.75,
        attendanceMinimum: 75
    },

    mapRemoteSettings: (row) => row ? {
        institution: row.institution_name,
        period: row.academic_period,
        ipkRisk: Number(row.ipk_risk_threshold),
        ipkWarning: Number(row.ipk_warning_threshold),
        attendanceMinimum: Number(row.attendance_minimum),
        datasetUpdatedAt: row.dataset_updated_at,
        datasetSource: row.dataset_source,
        studentCount: row.student_count
    } : { ...Admin.defaultSettings },

    getSettings: () => {
        if (SupabaseStore.configured && AppState.settings) {
            return { ...Admin.defaultSettings, ...AppState.settings };
        }
        const raw = localStorage.getItem('asa_settings');
        if (!raw) return { ...Admin.defaultSettings };
        try {
            const settings = JSON.parse(raw);
            return { ...Admin.defaultSettings, ...settings };
        } catch (error) {
            console.error('Pengaturan tersimpan tidak dapat dibaca:', error);
            return { ...Admin.defaultSettings };
        }
    },

    getEwsStatus: (student, settings = Admin.getSettings()) => {
        const ipk = Number(student.ipk) || 0;
        const attendance = Number(student.att) || 0;
        const reasons = [];
        if (ipk < Number(settings.ipkRisk)) reasons.push(`IPK di bawah ${Number(settings.ipkRisk).toFixed(2)}`);
        else if (ipk < Number(settings.ipkWarning)) reasons.push(`IPK di bawah ${Number(settings.ipkWarning).toFixed(2)}`);
        if (attendance < Number(settings.attendanceMinimum)) reasons.push(`Kehadiran di bawah ${Number(settings.attendanceMinimum)}%`);
        if (ipk < Number(settings.ipkRisk)) return { key: 'risiko', label: 'Risiko tinggi', className: 'status-risk', reasons };
        if (reasons.length) return { key: 'peringatan', label: 'Peringatan', className: 'status-warning', reasons };
        return { key: 'aman', label: 'Aman', className: 'status-safe', reasons: ['Tidak melewati batas EWS'] };
    },

    syncSettingsForm: () => {
        const settings = Admin.getSettings();
        document.getElementById('settings-institution').value = settings.institution;
        document.getElementById('settings-period').value = settings.period;
        document.getElementById('settings-ipk-risk').value = settings.ipkRisk;
        document.getElementById('settings-ipk-warning').value = settings.ipkWarning;
        document.getElementById('settings-attendance').value = settings.attendanceMinimum;
    },

    saveSettings: async (event) => {
        event.preventDefault();
        const settings = {
            institution: document.getElementById('settings-institution').value.trim(),
            period: document.getElementById('settings-period').value.trim(),
            ipkRisk: Number(document.getElementById('settings-ipk-risk').value),
            ipkWarning: Number(document.getElementById('settings-ipk-warning').value),
            attendanceMinimum: Number(document.getElementById('settings-attendance').value)
        };
        if (!settings.institution || !settings.period ||
            !Number.isFinite(settings.ipkRisk) || !Number.isFinite(settings.ipkWarning) ||
            settings.ipkRisk < 0 || settings.ipkWarning > 4 || settings.ipkRisk >= settings.ipkWarning ||
            !Number.isFinite(settings.attendanceMinimum) || settings.attendanceMinimum < 0 || settings.attendanceMinimum > 100) {
            UI.showToast('Pengaturan tidak valid. Batas risiko IPK harus di bawah batas peringatan, dan kehadiran 0–100%.');
            return;
        }
        if (SupabaseStore.configured) {
            if (!SupabaseStore.client || AppState.role !== 'admin') {
                UI.showToast('Sesi administrator Supabase tidak tersedia.');
                return;
            }
            let result;
            try {
                result = await SupabaseStore.client.from('asa_settings').update({
                    institution_name: settings.institution,
                    academic_period: settings.period,
                    ipk_risk_threshold: settings.ipkRisk,
                    ipk_warning_threshold: settings.ipkWarning,
                    attendance_minimum: settings.attendanceMinimum,
                    updated_at: new Date().toISOString()
                }).eq('id', 1);
            } catch (error) {
                console.error('Database pengaturan tidak dapat dijangkau:', error);
                UI.showToast('Database tidak dapat dijangkau. Pengaturan belum disimpan.');
                return;
            }
            const { error } = result;
            if (error) {
                console.error('Pengaturan Supabase tidak dapat disimpan:', error);
                UI.showToast('Pengaturan gagal disimpan ke database.');
                return;
            }
            AppState.settings = { ...AppState.settings, ...settings };
        } else {
            try {
                localStorage.setItem('asa_settings', JSON.stringify(settings));
            } catch (error) {
                console.error('Pengaturan tidak dapat disimpan:', error);
                UI.showToast('Pengaturan gagal disimpan di perangkat ini.');
                return;
            }
        }
        Admin.renderData();
        UI.showToast('Pengaturan periode dan batas EWS berhasil disimpan.');
    },

    // FITUR TOGGLE SIDEBAR (GARIS TIGA)
    toggleSidebar: () => {
        document.getElementById('main-sidebar').classList.toggle('collapsed');
    },

    showSec: (sec, trigger) => {
        document.querySelectorAll('.sidebar-menu .menu-item').forEach(el => el.classList.remove('active'));
        if(trigger) trigger.classList.add('active');

        document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`admin-sec-${sec}`);
        if(target) target.classList.remove('hidden');
    },
    
    handleCSVUpload: async (event) => {
        const input = event.target;
        const file = input.files[0];
        if (!file) return;
        Admin.pendingCSVData = null;
        document.getElementById('csv-preview').classList.add('hidden');
        document.getElementById('csv-validation-issues').replaceChildren();
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Pilih file dengan format .csv.');
            input.value = '';
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            alert('Ukuran file melebihi batas 4 MB untuk prototipe browser.');
            input.value = '';
            return;
        }

        try {
            const text = (await file.text()).replace(/^\uFEFF/, '');
            const firstLine = text.split(/\r?\n/, 1)[0];
            const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
            const records = parseCSVRecords(text, delimiter);
            if (records.length < 2) throw new Error('File CSV harus berisi judul kolom dan setidaknya satu baris data.');

            const normalizeHeader = value => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
            const headers = records[0].map(normalizeHeader);
            const findColumn = aliases => headers.findIndex(header => aliases.includes(header));
            const columns = {
                nim: findColumn(['nim', 'npm', 'nrp']),
                name: findColumn(['nama', 'name', 'namamahasiswa']),
                email: findColumn(['email', 'alamatemail']),
                ipk: findColumn(['ipk', 'gpa', 'indeksprestasikumulatif']),
                att: findColumn(['kehadiran', 'attendance', 'persentasekehadiran', 'att']),
                status: findColumn(['statusakademik', 'status'])
            };
            if (Object.values(columns).slice(0, 5).some(index => index < 0)) {
                throw new Error('Judul kolom wajib: NIM, Nama, Email, IPK, dan Kehadiran. Periksa kembali baris pertama CSV.');
            }

            const newData = [];
            const issues = [];
            const seenNim = new Set();
            const seenEmail = new Set();
            let duplicateNimCount = 0;
            let duplicateEmailCount = 0;
            for (let i = 1; i < records.length; i++) {
                const cols = records[i];
                const rowNumber = i + 1;
                const nim = (cols[columns.nim] || '').trim();
                const name = (cols[columns.name] || '').trim();
                const email = (cols[columns.email] || '').trim().toLowerCase();
                const ipk = Number((cols[columns.ipk] || '').trim().replace(',', '.'));
                const attendance = Number((cols[columns.att] || '').replace('%', '').trim().replace(',', '.'));
                const rowIssues = [];
                if (!nim) rowIssues.push('NIM kosong');
                if (!name) rowIssues.push('nama kosong');
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowIssues.push('email tidak valid');
                if (!Number.isFinite(ipk) || ipk < 0 || ipk > 4) rowIssues.push('IPK harus 0–4');
                if (!Number.isFinite(attendance) || attendance < 0 || attendance > 100) rowIssues.push('kehadiran harus 0–100%');
                if (nim && seenNim.has(nim)) {
                    rowIssues.push('NIM duplikat');
                    duplicateNimCount++;
                }
                if (email && seenEmail.has(email)) {
                    rowIssues.push('email duplikat');
                    duplicateEmailCount++;
                }
                if (rowIssues.length) {
                    if (issues.length < 10) issues.push(`Baris ${rowNumber}: ${rowIssues.join(', ')}`);
                    continue;
                }
                seenNim.add(nim);
                seenEmail.add(email);
                newData.push({
                    nim, name, email, ipk, att: attendance,
                    academicStatus: columns.status >= 0 ? (cols[columns.status] || 'Belum diisi').trim() : 'Belum diisi'
                });
            }
            if (!newData.length) {
                const validationList = issues.slice(0, 5).join('\n');
                throw new Error(`Tidak ada baris valid.${validationList ? `\n${validationList}` : ''}`);
            }

            Admin.pendingCSVData = newData;
            document.getElementById('csv-file-name').textContent = file.name;
            const skipped = records.length - 1 - newData.length;
            document.getElementById('csv-preview-summary').textContent =
                `${newData.length} baris valid dari ${records.length - 1}${skipped ? ` · ${skipped} baris dilewati` : ''} · ${duplicateNimCount} NIM duplikat · ${duplicateEmailCount} email duplikat.`;
            const issuesList = document.getElementById('csv-validation-issues');
            issuesList.replaceChildren();
            issues.slice(0, 10).forEach(issue => {
                const item = document.createElement('li');
                item.textContent = issue;
                issuesList.appendChild(item);
            });
            if (issues.length > 10) {
                const item = document.createElement('li');
                item.textContent = `dan ${issues.length - 10} masalah lain tidak ditampilkan`;
                issuesList.appendChild(item);
            }
            issuesList.classList.toggle('hidden', issues.length === 0);
            document.getElementById('csv-preview-body').innerHTML = newData.slice(0, 8).map(student => `
                <tr><td>${escapeHTML(student.nim)}</td><td>${escapeHTML(student.name)}</td><td>${escapeHTML(student.email)}</td>
                <td>${student.ipk.toFixed(2)}</td><td>${student.att}%</td><td>${escapeHTML(student.academicStatus)}</td></tr>
            `).join('');
            if (newData.length > 8) {
                document.getElementById('csv-preview-body').insertAdjacentHTML('beforeend',
                    `<tr><td class="empty-state" colspan="6">dan ${newData.length - 8} baris lainnya…</td></tr>`);
            }
            document.getElementById('csv-preview').classList.remove('hidden');
            document.getElementById('csv-preview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (error) {
            alert(error.message || 'File CSV gagal dibaca.');
            input.value = '';
        }
    },

    handleCSVDrop: (event) => {
        event.preventDefault();
        document.getElementById('csv-dropzone').classList.remove('drag-over');
        const file = event.dataTransfer.files[0];
        if (!file) return;
        const input = document.getElementById('csvFileInput');
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        Admin.handleCSVUpload({ target: input });
    },

    cancelCSVPreview: () => {
        Admin.pendingCSVData = null;
        document.getElementById('csv-preview').classList.add('hidden');
        document.getElementById('csvFileInput').value = '';
    },

    clearDataset: async () => {
        if (AppState.role !== 'admin') {
            UI.showToast('Hanya administrator yang dapat menghapus dataset.');
            return;
        }
        const confirmed = window.confirm(
            'Hapus seluruh dataset mahasiswa? Data ini tidak dapat dipulihkan. Pengaturan sistem tidak ikut dihapus.'
        );
        if (!confirmed) return;

        if (SupabaseStore.configured) {
            if (!SupabaseStore.client) {
                UI.showToast('Layanan database tidak dapat dimuat. Dataset belum dihapus.');
                return;
            }
            let result;
            try {
                result = await SupabaseStore.client.rpc('asa_clear_students');
            } catch (error) {
                console.error('Permintaan penghapusan dataset Supabase gagal:', error);
                UI.showToast('Database tidak dapat dijangkau. Dataset belum dihapus.');
                return;
            }
            const { data: deletedCount, error } = result;
            if (error) {
                console.error('Penghapusan dataset Supabase gagal:', error);
                UI.showToast(`Dataset gagal dihapus: ${error.message}`);
                return;
            }
            Admin.cancelCSVPreview();
            UI.showToast(`${deletedCount} data mahasiswa berhasil dihapus.`);
            await Admin.renderData();
            return;
        }

        const previousData = localStorage.getItem('kampus_dataset');
        const previousMeta = localStorage.getItem('kampus_dataset_meta');
        try {
            localStorage.removeItem('kampus_dataset');
            localStorage.removeItem('kampus_dataset_meta');
        } catch (error) {
            console.error('Dataset lokal gagal dihapus:', error);
            try {
                if (previousData !== null) localStorage.setItem('kampus_dataset', previousData);
                if (previousMeta !== null) localStorage.setItem('kampus_dataset_meta', previousMeta);
            } catch (restoreError) {
                console.error('Dataset lokal gagal dipulihkan setelah penghapusan tidak tuntas:', restoreError);
            }
            UI.showToast('Dataset lokal gagal dihapus. Periksa penyimpanan browser.');
            return;
        }
        Admin.cancelCSVPreview();
        UI.showToast('Dataset demo berhasil dihapus. Anda dapat mengunggah ulang CSV untuk demonstrasi.');
        await Admin.renderData();
    },

    applyCSVUpload: async () => {
        const newData = Admin.pendingCSVData;
        if (!newData || !newData.length) {
            alert('Pilih dan tinjau file CSV terlebih dahulu.');
            return;
        }
        const mode = document.getElementById('csv-import-mode').value;
        if (SupabaseStore.configured) {
            if (!SupabaseStore.client || AppState.role !== 'admin') {
                UI.showToast('Hanya administrator yang dapat mengimpor dataset.');
                return;
            }
            let importResult;
            try {
                importResult = await SupabaseStore.client.rpc('asa_import_students', {
                    p_students: newData.map(student => ({
                        nim: student.nim,
                        name: student.name,
                        email: student.email,
                        ipk: student.ipk,
                        attendance: student.att,
                        academic_status: student.academicStatus
                    })),
                    p_replace_all: mode === 'replace',
                    p_source: document.getElementById('csv-file-name').textContent
                });
            } catch (error) {
                console.error('Layanan impor Supabase tidak dapat dijangkau:', error);
                UI.showToast('Database tidak dapat dijangkau. Dataset belum diubah.');
                return;
            }
            const { data: importedCount, error } = importResult;
            if (error) {
                console.error('Impor dataset Supabase gagal:', error);
                UI.showToast(`Dataset gagal diimpor: ${error.message}`);
                return;
            }
            Admin.cancelCSVPreview();
            UI.showToast(`${importedCount} baris berhasil disimpan di database.`);
            await Admin.renderData();
            return;
        }
        let finalData = newData;
        let message = `Dataset diganti dengan ${newData.length} data mahasiswa.`;
        if (mode === 'merge') {
            let oldData;
            try {
                oldData = getStoredDataset();
            } catch (error) {
                console.error('Dataset lokal tidak dapat dibaca:', error);
                UI.showToast('Dataset lama tidak dapat dibaca. Tidak ada data yang diubah.');
                return;
            }
            const studentsByNim = new Map(oldData.filter(student => student && student.nim)
                .map(student => [String(student.nim).trim(), student]));
            let added = 0;
            let updated = 0;
            newData.forEach(student => {
                const nim = String(student.nim).trim();
                if (studentsByNim.has(nim)) updated++;
                else added++;
                studentsByNim.set(nim, student);
            });
            finalData = Array.from(studentsByNim.values());
            message = `Berhasil: ${added} data ditambahkan, ${updated} data diperbarui.`;
        }
        const seenEmails = new Set();
        for (const student of finalData) {
            const email = String(student.email || '').trim().toLowerCase();
            if (seenEmails.has(email)) {
                UI.showToast(`Email ${email} terhubung ke lebih dari satu NIM. Dataset tidak disimpan.`);
                return;
            }
            seenEmails.add(email);
        }
        const previousData = localStorage.getItem('kampus_dataset');
        const previousMeta = localStorage.getItem('kampus_dataset_meta');
        const metadata = {
            filename: document.getElementById('csv-file-name').textContent,
            importedAt: new Date().toISOString(),
            rowCount: finalData.length
        };
        try {
            localStorage.setItem('kampus_dataset', JSON.stringify(finalData));
            localStorage.setItem('kampus_dataset_meta', JSON.stringify(metadata));
        } catch (error) {
            console.error('Dataset tidak dapat disimpan di browser:', error);
            try {
                localStorage.removeItem('kampus_dataset');
                localStorage.removeItem('kampus_dataset_meta');
                if (previousData !== null) localStorage.setItem('kampus_dataset', previousData);
                if (previousMeta !== null) localStorage.setItem('kampus_dataset_meta', previousMeta);
            } catch (restoreError) {
                console.error('Dataset sebelumnya gagal dipulihkan:', restoreError);
                UI.showToast('Penyimpanan gagal dan pemulihan dataset sebelumnya bermasalah. Jangan tutup halaman; hubungi pengelola.');
                return;
            }
            UI.showToast('Dataset gagal disimpan. Periksa ruang penyimpanan browser; data lama dipertahankan.');
            return;
        }
        Admin.cancelCSVPreview();
        UI.showToast(message);
        Admin.showSec('dashboard', document.querySelector('.sidebar-menu .menu-item'));
        Admin.renderData();
    },

    renderData: async () => {
        const tbodyEws = document.querySelector('#admin-ews-table tbody');
        const tbodyAll = document.querySelector('#admin-all-table tbody');
        let data;
        let settings;
        let metadata;
        if (SupabaseStore.configured) {
            if (!SupabaseStore.client || AppState.role !== 'admin') {
                UI.showToast('Akses administrator Supabase diperlukan untuk memuat dashboard.');
                return false;
            }
            try {
            data = [];
            for (let start = 0; ; start += 1000) {
                const { data: rows, error } = await SupabaseStore.client
                    .from('asa_students')
                    .select('nim,name,email,ipk,attendance,academic_status')
                    .order('nim')
                    .range(start, start + 999);
                if (error) {
                    console.error('Data mahasiswa gagal dimuat dari Supabase:', error);
                    UI.showToast('Data mahasiswa gagal dimuat dari database.');
                    return false;
                }
                data.push(...rows.map(row => ({
                    nim: row.nim,
                    name: row.name,
                    email: row.email,
                    ipk: Number(row.ipk),
                    att: Number(row.attendance),
                    academicStatus: row.academic_status
                })));
                if (rows.length < 1000) break;
            }
            const { data: settingsRow, error: settingsError } = await SupabaseStore.client
                .from('asa_settings').select('*').eq('id', 1).maybeSingle();
            if (settingsError || !settingsRow) {
                console.error('Pengaturan Supabase gagal dimuat:', settingsError);
                UI.showToast('Pengaturan akademik gagal dimuat dari database.');
                return false;
            }
            AppState.dataset = data;
            AppState.settings = Admin.mapRemoteSettings(settingsRow);
            settings = Admin.getSettings();
            metadata = {
                importedAt: settingsRow.dataset_updated_at,
                rowCount: settingsRow.student_count,
                filename: settingsRow.dataset_source
            };
            AppState.metadata = metadata;
            } catch (error) {
                console.error('Permintaan dashboard Supabase gagal:', error);
                UI.showToast('Database tidak dapat dijangkau. Dashboard belum diperbarui.');
                return false;
            }
        } else {
            try {
                data = getStoredDataset();
            } catch (error) {
                console.error('Dataset dashboard tidak dapat dibaca:', error);
                UI.showToast('Dataset tidak valid. Data tidak ditampilkan; periksa kembali penyimpanan.');
                return false;
            }
            settings = Admin.getSettings();
            try {
                metadata = JSON.parse(localStorage.getItem('kampus_dataset_meta') || 'null');
            } catch (error) {
                console.error('Metadata impor tidak dapat dibaca:', error);
                UI.showToast('Informasi waktu impor tidak dapat dibaca.');
            }
            AppState.dataset = data;
            AppState.settings = settings;
            AppState.metadata = metadata;
        }
        Admin.syncSettingsForm();

        let countSafe = 0, countWarning = 0, countDanger = 0;
        let ipkCumlaude = 0, ipkGood = 0, ipkAvg = 0, ipkLow = 0;
        let totalIpk = 0, totalAttendance = 0;

        const rowsEws = [];
        const rowsAll = [];
        data.forEach(student => {
            const ipk = Number(student.ipk) || 0;
            const attendance = Number(student.att) || 0;
            const status = Admin.getEwsStatus(student, settings);
            totalIpk += ipk;
            totalAttendance += attendance;
            if (status.key === 'risiko') countDanger++;
            else if (status.key === 'peringatan') countWarning++;
            else countSafe++;
            if (ipk >= 3.5) ipkCumlaude++;
            else if (ipk >= 3) ipkGood++;
            else if (ipk >= 2.5) ipkAvg++;
            else ipkLow++;
            const badge = `<span class="status-badge ${status.className}">${status.label}</span>`;
            const reason = status.reasons.join('; ');
            const studentName = escapeHTML(student.name);
            rowsEws.push(`<tr data-search="${escapeHTML(`${student.nim} ${student.name} ${student.email}`.toLowerCase())}" data-status="${status.key}">
                <td>${escapeHTML(student.nim)}</td><td><strong>${studentName}</strong></td><td>${escapeHTML(student.email)}</td>
                <td><strong>${ipk.toFixed(2)}</strong></td><td>${attendance}%</td><td>${badge}</td><td>${escapeHTML(reason)}</td>
                <td>${escapeHTML(student.academicStatus || 'Belum diisi')}</td></tr>`);
            rowsAll.push(`<tr data-search="${escapeHTML(`${student.nim} ${student.name} ${student.email}`.toLowerCase())}" data-status="${status.key}">
                <td>${escapeHTML(student.nim)}</td><td><strong>${studentName}</strong></td><td>${escapeHTML(student.email)}</td>
                <td>${attendance}%</td><td><strong>${ipk.toFixed(2)}</strong></td><td>${escapeHTML(student.academicStatus || 'Belum diisi')}</td>
                <td><button class="btn-icon" aria-label="Lihat profil ${studentName}" onclick="UI.showToast('Tampilan profil detail belum tersedia.')"><i class="fa-solid fa-eye"></i></button></td></tr>`);
        });

        tbodyEws.innerHTML = rowsEws.join('') || '<tr><td class="empty-state" colspan="8">Belum ada data. Unggah dataset CSV untuk memulai.</td></tr>';
        if (tbodyAll) tbodyAll.innerHTML = rowsAll.join('') || '<tr><td class="empty-state" colspan="7">Belum ada data mahasiswa.</td></tr>';
        document.getElementById('kpi-total-mhs').innerText = data.length;
        document.getElementById('kpi-risk-count').innerText = countDanger;
        document.getElementById('kpi-average-ipk').innerText = data.length ? (totalIpk / data.length).toFixed(2) : '0.00';
        document.getElementById('kpi-average-attendance').innerText = data.length ? `${Math.round(totalAttendance / data.length)}%` : '0%';
        document.getElementById('active-period').textContent = settings.period || 'Belum diatur';
        document.getElementById('dataset-updated').textContent = metadata && metadata.importedAt
            ? `${new Date(metadata.importedAt).toLocaleString('id-ID')} (${metadata.rowCount || data.length} data)`
            : 'Waktu impor tidak tercatat';
        document.getElementById('dashboard-institution').textContent = settings.institution;
        Admin.drawCharts(countSafe, countWarning, countDanger, [ipkCumlaude, ipkGood, ipkAvg, ipkLow]);
        Admin.filterTable('ews');
        Admin.filterTable('students');
        return true;
    },

    filterTable: (table) => {
        const isEws = table === 'ews';
        const search = document.getElementById(isEws ? 'ews-search' : 'student-search');
        const statusFilter = document.getElementById(isEws ? 'ews-status-filter' : 'student-status-filter');
        const tbody = document.querySelector(isEws ? '#admin-ews-table tbody' : '#admin-all-table tbody');
        const count = document.getElementById(isEws ? 'ews-result-count' : 'student-result-count');
        if (!search || !statusFilter || !tbody || !count) return;
        const query = search.value.trim().toLowerCase();
        const status = statusFilter.value;
        let visible = 0;
        let total = 0;
        tbody.querySelectorAll('tr[data-search]').forEach(row => {
            total++;
            const matches = row.dataset.search.includes(query) && (!status || row.dataset.status === status);
            row.hidden = !matches;
            if (matches) visible++;
        });
        count.textContent = `${visible} dari ${total} mahasiswa`;
        let empty = tbody.querySelector('.filter-empty');
        if (!visible && total) {
            if (!empty) {
                empty = document.createElement('tr');
                empty.className = 'filter-empty';
                empty.innerHTML = `<td class="empty-state" colspan="${isEws ? 8 : 7}">Tidak ada mahasiswa yang sesuai dengan pencarian.</td>`;
                tbody.appendChild(empty);
            }
        } else if (empty) {
            empty.remove();
        }
    },

    drawCharts: (safe, warning, danger, ipkArray) => {
        // GRAFIK 1: Doughnut (EWS)
        const ctxEws = document.getElementById('ewsChart');
        if(ctxEws) {
            if (ewsChartInstance) ewsChartInstance.destroy();
            ewsChartInstance = new Chart(ctxEws, {
                type: 'doughnut',
                data: {
                    labels: ['Aman', 'Peringatan', 'Risiko'],
                    datasets: [{ data: [safe, warning, danger], backgroundColor: ['#10B981', '#F59E0B', '#EF4444'], borderWidth: 0 }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 18, font: { family: 'Inter', size: 11 } } } }
                }
            });
        }

        // GRAFIK 2: Bar Chart (Distribusi IPK)
        const ctxBar = document.getElementById('ipkBarChart');
        if(ctxBar) {
            if (ipkBarChartInstance) ipkBarChartInstance.destroy();
            ipkBarChartInstance = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: ['> 3.50', '3.0-3.49', '2.5-2.99', '< 2.50'],
                    datasets: [{
                        label: 'Jumlah Mhs',
                        data: ipkArray,
                        backgroundColor: ['#2563EB', '#1D4ED8', '#F59E0B', '#EF4444'],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } },
                        y: { beginAtZero: true, ticks: { precision: 0, font: { family: 'Inter', size: 10 } }, grid: { color: '#edf0f5' } }
                    }
                }
            });
        }
    }
};
