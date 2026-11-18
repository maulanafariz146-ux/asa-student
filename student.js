const Student = {
    renderDashboard: (data) => {
        document.getElementById('std-name').textContent = data.name;
        document.getElementById('student-header-name').textContent = data.name;
        document.getElementById('std-nim').textContent = data.nim || 'Tidak tersedia';
        document.getElementById('std-academic-status').textContent = data.academicStatus || 'Belum diisi';
        const ipk = Number(data.ipk) || 0;
        const attendance = Number(data.att) || 0;
        const settings = Admin.getSettings();
        const ewsStatus = Admin.getEwsStatus(data, settings);
        const period = settings.period || 'Periode belum diatur';
        document.getElementById('student-period').textContent = period;
        document.getElementById('student-header-period').textContent = period;
        document.getElementById('std-ipk').innerText = ipk.toFixed(2);
        document.getElementById('std-att').innerText = `${attendance}%`;
        document.getElementById('std-ipk-target').textContent = Number(settings.ipkWarning).toFixed(2);
        document.getElementById('std-attendance-target').textContent = `${Number(settings.attendanceMinimum)}%`;
        document.getElementById('std-ipk-progress').style.width = `${Math.min(Math.max(ipk / 4 * 100, 0), 100)}%`;
        document.getElementById('std-att-progress').style.width = `${Math.min(Math.max(attendance, 0), 100)}%`;
        document.getElementById('std-ipk-progress').parentElement.setAttribute('aria-valuenow', String(ipk));
        document.getElementById('std-att-progress').parentElement.setAttribute('aria-valuenow', String(attendance));

        const dataUpdatedAt = settings.datasetUpdatedAt || (AppState.metadata && AppState.metadata.importedAt);
        const parsedUpdateDate = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
        document.getElementById('std-data-updated').textContent = parsedUpdateDate && !Number.isNaN(parsedUpdateDate.getTime())
            ? parsedUpdateDate.toLocaleString('id-ID')
            : 'Informasi tidak tersedia';
        
        const banner = document.getElementById('student-banner');
        const msg = document.getElementById('std-message');
        const icon = document.getElementById('std-icon');
        const statusLabel = document.getElementById('std-status-label');
        const reasons = document.getElementById('std-reasons');
        const nextStep = document.getElementById('std-next-step');

        banner.classList.remove('bg-safe', 'bg-warning', 'bg-danger');
        statusLabel.textContent = ewsStatus.label;
        reasons.textContent = ewsStatus.reasons.length
            ? ewsStatus.reasons.join(' · ')
            : 'Tidak ada indikator yang melewati batas EWS saat ini.';

        if (ewsStatus.key === 'risiko') {
            banner.classList.add('bg-danger');
            msg.textContent = 'Beberapa indikator berada di bawah batas pemantauan. Tinjau rincian dan pertimbangkan dukungan akademik.';
            icon.className = "fa-solid fa-triangle-exclamation";
            nextStep.textContent = 'Tinjau kembali hasil studi, prioritaskan mata kuliah yang perlu ditingkatkan, dan hubungi layanan akademik kampus untuk mendapatkan dukungan.';
        } 
        else if (ewsStatus.key === 'peringatan') {
            banner.classList.add('bg-warning');
            msg.textContent = 'Ada indikator yang perlu diperhatikan. Lihat rincian di bawah untuk mengetahui alasannya.';
            icon.className = "fa-solid fa-circle-exclamation";
            nextStep.textContent = 'Evaluasi progres studi dan jaga konsistensi belajar. Jika indikator belum membaik, hubungi layanan akademik kampus untuk mengetahui dukungan yang tersedia.';
        } 
        else {
            banner.classList.add('bg-safe');
            msg.textContent = 'Indikator yang dipantau memenuhi batas saat ini. Pertahankan kebiasaan belajar yang baik.';
            icon.className = "fa-solid fa-check-circle";
            nextStep.textContent = 'Pertahankan konsistensi belajar dan kehadiran Anda untuk menjaga capaian akademik.';
        }
    }
};
