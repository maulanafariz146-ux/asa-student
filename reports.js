const Reports = {
    downloadReport: () => {
        let data;
        try {
            data = getActiveDataset();
        } catch (error) {
            console.error('Dataset ekspor tidak dapat dibaca:', error);
            UI.showToast('Dataset tidak valid. Ekspor CSV dibatalkan.');
            return;
        }

        if (!data.length) {
            UI.showToast('Belum ada dataset untuk diunduh.');
            return;
        }

        const escapeCSV = value =>
            `"${String(value ?? '').replace(/"/g, '""')}"`;

        const rows = [
            ['NIM', 'Nama', 'Email', 'IPK', 'Kehadiran', 'Status Akademik'],
            ...data.map(student => [
                student.nim,
                student.name,
                student.email,
                Number(student.ipk || 0).toFixed(2),
                `${student.att || 0}%`,
                student.academicStatus || 'Belum diisi'
            ])
        ];

        const csv = rows
            .map(row => row.map(escapeCSV).join(','))
            .join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], {
            type: 'text/csv;charset=utf-8'
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `dataset-akademik-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        UI.showToast('Ekspor data akademik CSV berhasil diunduh.');
    },

    downloadRiskReport: () => {
        let data;
        try {
            data = getActiveDataset();
        } catch (error) {
            console.error('Dataset ekspor EWS tidak dapat dibaca:', error);
            UI.showToast('Dataset tidak valid. Ekspor EWS dibatalkan.');
            return;
        }
        const settings = Admin.getSettings();
        const riskData = data.map(student => ({
            student,
            status: Admin.getEwsStatus(student, settings)
        })).filter(item => item.status.key !== 'aman');
        if (!riskData.length) {
            UI.showToast('Tidak ada mahasiswa yang melewati batas EWS saat ini.');
            return;
        }
        const escapeCSV = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
        const rows = [
            ['NIM', 'Nama', 'Email', 'IPK', 'Kehadiran', 'Status EWS', 'Alasan penanda', 'Status Akademik'],
            ...riskData.map(({ student, status }) => [
                student.nim, student.name, student.email, Number(student.ipk || 0).toFixed(2),
                `${student.att || 0}%`, status.label, status.reasons.join('; '),
                student.academicStatus || 'Belum diisi'
            ])
        ];
        const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escapeCSV).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `mahasiswa-ews-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UI.showToast(`Ekspor EWS ${riskData.length} mahasiswa berhasil diunduh.`);
    },

    downloadAcademicReport: () => {
        let data;
        try {
            data = getActiveDataset();
        } catch (error) {
            console.error('Dataset laporan akademik tidak dapat dibaca:', error);
            UI.showToast('Dataset tidak valid. Laporan tidak dapat dibuat.');
            return;
        }
        const settings = Admin.getSettings();
        let metadata = AppState.metadata;
        if (!SupabaseStore.configured) {
            try {
                metadata = JSON.parse(localStorage.getItem('kampus_dataset_meta') || 'null');
            } catch (error) {
                console.error('Metadata laporan tidak dapat dibaca:', error);
                UI.showToast('Informasi waktu impor tidak dapat dibaca; laporan tetap memuat data akademik.');
            }
        }
        if (!data.length) {
            UI.showToast('Belum ada dataset untuk dibuatkan laporan.');
            return;
        }
        if (typeof html2pdf !== 'function') {
            UI.showToast('Generator PDF belum tersedia. Periksa koneksi internet lalu muat ulang halaman.');
            return;
        }

        const students = data.map(student => ({
            nim: String(student.nim ?? ''),
            name: String(student.name ?? ''),
            email: String(student.email ?? ''),
            ipk: Number(student.ipk) || 0,
            att: Number(student.att) || 0,
            academicStatus: String(student.academicStatus || 'Belum diisi')
        }));
        const counts = { aman: 0, peringatan: 0, risiko: 0 };
        const ipkRanges = [
            { label: '3.50–4.00', count: 0, color: '#3269d6' },
            { label: '3.00–3.49', count: 0, color: '#638be0' },
            { label: '2.50–2.99', count: 0, color: '#c77c12' },
            { label: 'Di bawah 2.50', count: 0, color: '#d94a55' }
        ];
        let totalIpk = 0;
        let totalAttendance = 0;
        students.forEach(student => {
            totalIpk += student.ipk;
            totalAttendance += student.att;
            const status = Admin.getEwsStatus(student, settings);
            counts[status.key]++;
            if (student.ipk >= 3.5) ipkRanges[0].count++;
            else if (student.ipk >= 3) ipkRanges[1].count++;
            else if (student.ipk >= 2.5) ipkRanges[2].count++;
            else ipkRanges[3].count++;
        });
        const flaggedStudents = students.filter(student => Admin.getEwsStatus(student, settings).key !== 'aman')
            .sort((a, b) => a.ipk - b.ipk);
        const maxRangeCount = Math.max(...ipkRanges.map(range => range.count), 1);
        const generatedAt = new Date().toLocaleString('id-ID', {
            dateStyle: 'long', timeStyle: 'short'
        });
        const reportRows = flaggedStudents.length
            ? flaggedStudents.map(student => {
                const status = Admin.getEwsStatus(student, settings);
                return `<tr>
                <td>${escapeHTML(student.nim)}</td><td>${escapeHTML(student.name)}</td>
                <td>${student.ipk.toFixed(2)}</td><td>${student.att}%</td>
                <td><span class="badge ${status.key === 'risiko' ? 'risk' : 'warning'}">${status.label}</span></td>
                <td>${escapeHTML(status.reasons.join('; '))}</td>
                <td>${escapeHTML(student.academicStatus)}</td></tr>`;
            }).join('')
            : '<tr><td colspan="7" class="empty">Tidak ada mahasiswa yang melewati batas EWS saat ini.</td></tr>';
        const chartRows = ipkRanges.map(range => `<div class="bar-row">
            <div class="bar-label"><span>${range.label}</span><strong>${range.count}</strong></div>
            <div class="track"><div class="fill" style="width:${range.count / maxRangeCount * 100}%;background:${range.color}"></div></div>
        </div>`).join('');

        const reportHTML = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laporan Akademik - ${new Date().toISOString().slice(0, 10)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f5f8;color:#263449;font:14px/1.55 Arial,sans-serif}
.toolbar{position:sticky;top:0;background:#10213b;color:white;padding:12px max(calc((100% - 980px)/2),20px);display:flex;justify-content:space-between;align-items:center;gap:16px}
.toolbar button{border:0;border-radius:7px;background:#4d80e0;color:#fff;font-weight:700;padding:10px 16px;cursor:pointer}
.paper{max-width:980px;margin:28px auto;background:#fff;padding:48px 54px;box-shadow:0 5px 28px #10213b14}
.eyebrow{color:#3269d6;font-size:11px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase}
h1,h2{color:#10213b;margin:0}h1{font-size:30px;margin-top:8px}.subtitle{color:#718096;margin:5px 0 0}
.rule{height:3px;background:linear-gradient(90deg,#3269d6,#e5b94d);margin:24px 0}
.meta{display:flex;justify-content:space-between;gap:15px;color:#718096;font-size:12px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}
.kpi{border:1px solid #e4eaf2;border-radius:10px;padding:15px}.kpi small{display:block;color:#718096;font-size:10px;text-transform:uppercase;font-weight:bold;letter-spacing:.4px}.kpi strong{display:block;color:#10213b;font-size:26px;margin-top:6px}
.kpi.danger strong{color:#b23a45}
.section{margin-top:26px;break-inside:avoid}.section h2{font-size:17px;margin-bottom:12px}
.chart{border:1px solid #e4eaf2;border-radius:10px;padding:16px}
.bar-row{margin:10px 0}.bar-label{display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px}.track{height:9px;border-radius:10px;background:#edf1f6;overflow:hidden}.fill{height:100%;border-radius:10px}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;font-size:12px;color:#536176}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.safe-dot{background:#14805e}.warning-dot{background:#c77c12}.risk-dot{background:#d94a55}
table{width:100%;border-collapse:collapse;font-size:11px}th,td{text-align:left;border-bottom:1px solid #e9edf3;padding:9px 8px}th{background:#f7f9fc;color:#718096;text-transform:uppercase;font-size:9px;letter-spacing:.4px}
.badge{display:inline-block;border-radius:20px;padding:3px 8px;font-size:10px;font-weight:bold}.badge.warning{color:#94600c;background:#fff3dc}.badge.risk{color:#b23a45;background:#fdebed}.empty{text-align:center;color:#718096;padding:18px}
.note{border-left:3px solid #e5b94d;background:#fff9e9;padding:12px 14px;margin-top:16px;font-size:12px;color:#5c4a20}
.footer{border-top:1px solid #e4eaf2;margin-top:30px;padding-top:12px;color:#8994a4;font-size:10px}
@media(max-width:700px){.paper{margin:0;padding:25px 18px}.kpis{grid-template-columns:repeat(2,1fr)}.meta{flex-direction:column}.toolbar{position:static}}
@media print{body{background:#fff;font-size:11px}.toolbar{display:none}.paper{max-width:none;margin:0;padding:0;box-shadow:none}.section{break-inside:avoid}.section table{break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}.kpis{gap:8px}.kpi{padding:10px}.kpi strong{font-size:21px}@page{size:A4;margin:15mm}}
</style></head><body>
<main class="paper">
<span class="eyebrow">Academic Smart Analytics</span>
<h1>Laporan Analitik Akademik</h1>
<p class="subtitle">Ringkasan capaian akademik dan pemantauan Sistem Peringatan Awal</p>
<div class="rule"></div>
<div class="meta"><span><strong>Institusi:</strong> ${escapeHTML(settings.institution)}</span><span><strong>Periode:</strong> ${escapeHTML(settings.period || 'Belum ditetapkan')}</span><span><strong>Diperbarui:</strong> ${escapeHTML(metadata && metadata.importedAt ? new Date(metadata.importedAt).toLocaleString('id-ID') : 'Waktu impor tidak tercatat')}</span><span><strong>Dibuat:</strong> ${escapeHTML(generatedAt)}</span></div>
<section class="kpis">
<div class="kpi"><small>Total mahasiswa</small><strong>${students.length}</strong></div>
<div class="kpi danger"><small>Risiko tinggi</small><strong>${counts.risiko}</strong></div>
<div class="kpi"><small>Rata-rata IPK</small><strong>${(totalIpk / students.length).toFixed(2)}</strong></div>
<div class="kpi"><small>Rata-rata kehadiran</small><strong>${Math.round(totalAttendance / students.length)}%</strong></div>
</section>
<section class="section"><h2>Distribusi status EWS</h2><div class="chart">
<div class="bar-row"><div class="bar-label"><span>Aman</span><strong>${counts.aman} (${(counts.aman / students.length * 100).toFixed(1)}%)</strong></div><div class="track"><div class="fill" style="width:${counts.aman / students.length * 100}%;background:#14805e"></div></div></div>
<div class="bar-row"><div class="bar-label"><span>Peringatan</span><strong>${counts.peringatan} (${(counts.peringatan / students.length * 100).toFixed(1)}%)</strong></div><div class="track"><div class="fill" style="width:${counts.peringatan / students.length * 100}%;background:#c77c12"></div></div></div>
<div class="bar-row"><div class="bar-label"><span>Risiko tinggi</span><strong>${counts.risiko} (${(counts.risiko / students.length * 100).toFixed(1)}%)</strong></div><div class="track"><div class="fill" style="width:${counts.risiko / students.length * 100}%;background:#d94a55"></div></div></div>
<div class="legend"><span><i class="dot safe-dot"></i>Aman</span><span><i class="dot warning-dot"></i>Peringatan: IPK &lt; ${Number(settings.ipkWarning).toFixed(2)} atau kehadiran &lt; ${Number(settings.attendanceMinimum)}%</span><span><i class="dot risk-dot"></i>Risiko tinggi: IPK &lt; ${Number(settings.ipkRisk).toFixed(2)}</span></div>
</div></section>
<section class="section"><h2>Distribusi rentang IPK</h2><div class="chart">${chartRows}</div></section>
<section class="section"><h2>Mahasiswa untuk tindak lanjut EWS</h2>
<table><thead><tr><th>NIM</th><th>Nama</th><th>IPK</th><th>Kehadiran</th><th>Status EWS</th><th>Alasan</th><th>Status akademik</th></tr></thead><tbody>${reportRows}</tbody></table>
${flaggedStudents.length ? '<div class="note"><strong>Catatan tindak lanjut:</strong> Tinjau kondisi akademik mahasiswa dalam daftar ini dan koordinasikan dukungan yang sesuai melalui mekanisme akademik kampus.</div>' : ''}
</section>
<div class="footer">Laporan ini dibuat otomatis berdasarkan dataset yang tersimpan di Academic Smart Analytics. Angka merupakan ringkasan data pada waktu pembuatan laporan.</div>
</main></body></html>`;

        const reportDocument = new DOMParser().parseFromString(reportHTML, 'text/html');
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.title = 'Dokumen sementara untuk pembuatan PDF';
        frame.style.cssText = 'position:fixed;left:0;top:0;width:1100px;height:100vh;border:0;opacity:0;pointer-events:none;z-index:-1';
        document.body.appendChild(frame);
        const frameDocument = frame.contentDocument;
        frameDocument.open();
        frameDocument.write(reportDocument.documentElement.outerHTML);
        frameDocument.close();

        const pdfContent = frameDocument.querySelector('.paper');
        pdfContent.style.maxWidth = 'none';
        pdfContent.style.margin = '0';
        pdfContent.style.boxShadow = 'none';
        html2pdf().set({
            margin: 10,
            filename: `laporan-akademik-${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: { scale: 1.5, useCORS: true, logging: false, windowWidth: 1100 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(pdfContent).save()
            .then(() => UI.showToast('Laporan akademik PDF berhasil diunduh.'))
            .catch(error => {
                console.error('Gagal membuat laporan PDF:', error);
                UI.showToast('Laporan PDF gagal dibuat. Silakan coba lagi.');
            })
            .finally(() => frame.remove());
    }
};
