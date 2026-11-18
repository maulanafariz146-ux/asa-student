const Auth = {
    login: async (e) => {
        e.preventDefault();
        const email = document.getElementById('log-email').value.trim().toLowerCase();
        const password = document.getElementById('log-password').value;

        if (AppState.passwordRecovery && SupabaseStore.client) {
            let result;
            try {
                result = await SupabaseStore.client.auth.updateUser({ password });
            } catch (error) {
                console.error('Permintaan perubahan kata sandi gagal:', error);
                UI.showToast('Layanan kata sandi tidak dapat dijangkau. Coba lagi.');
                return;
            }
            const { error } = result;
            if (error) {
                UI.showToast(`Kata sandi gagal diperbarui: ${error.message}`);
                return;
            }
            AppState.passwordRecovery = false;
            document.getElementById('login-password-label').textContent = 'Kata sandi';
            document.getElementById('login-submit').textContent = 'Masuk';
            document.getElementById('login-mode-note').textContent = 'Kata sandi berhasil diperbarui. Masuk kembali dengan kata sandi baru.';
            await SupabaseStore.client.auth.signOut();
            return;
        }

        if (SupabaseStore.configured) {
            if (!SupabaseStore.client) {
                UI.showToast('Layanan autentikasi tidak dapat dimuat. Periksa koneksi CDN Supabase.');
                return;
            }
            try {
            const { data, error } = await SupabaseStore.client.auth.signInWithPassword({ email, password });
            if (error) {
                UI.showToast('Email atau kata sandi salah, atau email belum dikonfirmasi.');
                console.error('Supabase sign-in gagal:', error);
                return;
            }
            const { data: profile, error: profileError } = await SupabaseStore.client
                .from('asa_profiles').select('role').eq('id', data.user.id).maybeSingle();
            if (profileError || !profile || !['admin', 'student'].includes(profile.role)) {
                await SupabaseStore.client.auth.signOut();
                console.error('Profil aplikasi tidak tersedia atau perannya tidak valid:', profileError);
                UI.showToast('Akun belum memiliki profil akses yang valid. Hubungi administrator.');
                return;
            }
            AppState.user = data.user;
            AppState.role = profile.role;
            if (profile.role === 'admin') {
                Router.navigate('admin-view');
                const loaded = await Admin.renderData();
                if (!loaded) {
                    await SupabaseStore.client.auth.signOut();
                    AppState.user = null;
                    AppState.role = null;
                    Router.navigate('login-view');
                    return;
                }
                UI.showToast('Berhasil masuk sebagai administrator.');
                return;
            }

            const { data: studentRow, error: studentError } = await SupabaseStore.client
                .from('asa_students')
                .select('nim,name,email,ipk,attendance,academic_status')
                .eq('user_id', data.user.id)
                .maybeSingle();
            if (studentError || !studentRow) {
                await SupabaseStore.client.auth.signOut();
                AppState.user = null;
                AppState.role = null;
                console.error('Data mahasiswa yang terhubung tidak tersedia:', studentError);
                UI.showToast('Akun belum terhubung dengan data mahasiswa. Periksa email akun dan dataset.');
                return;
            }
            AppState.dataset = [{
                nim: studentRow.nim,
                name: studentRow.name,
                email: studentRow.email,
                ipk: Number(studentRow.ipk),
                att: Number(studentRow.attendance),
                academicStatus: studentRow.academic_status
            }];
            const { data: settingsRow, error: settingsError } = await SupabaseStore.client
                .from('asa_settings').select('*').eq('id', 1).maybeSingle();
            if (settingsError || !settingsRow) {
                console.error('Pengaturan akademik gagal dimuat:', settingsError);
                await SupabaseStore.client.auth.signOut();
                AppState.user = null;
                AppState.role = null;
                UI.showToast('Pengaturan akademik tidak dapat dimuat.');
                return;
            }
            AppState.settings = Admin.mapRemoteSettings(settingsRow);
            Student.renderDashboard(AppState.dataset[0]);
            Router.navigate('student-view');
            UI.showToast(`Berhasil masuk sebagai ${studentRow.name}.`);
            return;
            } catch (error) {
                console.error('Permintaan autentikasi Supabase gagal:', error);
                AppState.user = null;
                AppState.role = null;
                UI.showToast('Layanan autentikasi tidak dapat dijangkau. Periksa koneksi lalu coba lagi.');
                return;
            }
        }

        if(email === 'admin@demo.com') {
            AppState.user = { email };
            AppState.role = 'admin';
            UI.showToast("Berhasil login sebagai Admin.");
            Router.navigate('admin-view');
            Admin.renderData();
            return;
        }

        let parsedData;
        try {
            parsedData = getStoredDataset();
        } catch (error) {
            console.error('Dataset login tidak dapat dibaca:', error);
            alert('Dataset tidak dapat dibaca. Minta Admin memeriksa kembali file data.');
            return;
        }
        if(!parsedData.length) {
            alert("Sistem belum memiliki data. Harap hubungi Admin untuk mengunggah Dataset CSV terlebih dahulu.");
            return;
        }

        const student = parsedData.find(s => s.email === email);
        
        if(student) {
            AppState.user = { email };
            AppState.role = 'student';
            AppState.dataset = [student];
            UI.showToast(`Berhasil login sebagai ${student.name}`);
            Student.renderDashboard(student);
            Router.navigate('student-view');
        } else {
            alert("Email Mahasiswa tidak ditemukan di dalam Database (CSV).");
        }
    },
    registerStudent: async () => {
        if (!SupabaseStore.client) {
            UI.showToast('Konfigurasikan Supabase terlebih dahulu untuk membuat akun.');
            return;
        }
        const email = document.getElementById('log-email').value.trim().toLowerCase();
        const password = document.getElementById('log-password').value;
        if (!email || password.length < 8) {
            UI.showToast('Masukkan email kampus dan kata sandi minimal 8 karakter.');
            return;
        }
        let result;
        try {
            result = await SupabaseStore.client.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: window.location.href.split('#')[0] }
            });
        } catch (error) {
            console.error('Layanan pendaftaran Supabase tidak dapat dijangkau:', error);
            UI.showToast('Layanan pendaftaran tidak dapat dijangkau. Coba lagi.');
            return;
        }
        const { error } = result;
        if (error) {
            console.error('Pendaftaran akun mahasiswa gagal:', error);
            UI.showToast('Pendaftaran gagal. Pastikan email terdaftar pada dataset dan coba lagi.');
            return;
        }
        UI.showToast('Periksa email untuk konfirmasi akun sebelum masuk.');
    },

    resetPassword: async () => {
        if (!SupabaseStore.client) {
            UI.showToast('Pengaturan ulang kata sandi tersedia setelah Supabase dikonfigurasi.');
            return;
        }
        const email = document.getElementById('log-email').value.trim().toLowerCase();
        if (!email) {
            UI.showToast('Masukkan email akun terlebih dahulu.');
            return;
        }
        let result;
        try {
            result = await SupabaseStore.client.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.href.split('#')[0]
            });
        } catch (error) {
            console.error('Layanan reset kata sandi Supabase tidak dapat dijangkau:', error);
            UI.showToast('Layanan reset kata sandi tidak dapat dijangkau. Coba lagi.');
            return;
        }
        const { error } = result;
        if (error) {
            console.error('Permintaan reset kata sandi gagal:', error);
            UI.showToast('Email reset tidak dapat dikirim. Periksa konfigurasi Auth.');
            return;
        }
        UI.showToast('Jika akun valid, tautan pengaturan ulang akan dikirim ke email.');
    },

    logout: async () => {
        if (SupabaseStore.client && AppState.user) {
            let result;
            try {
                result = await SupabaseStore.client.auth.signOut();
            } catch (error) {
                console.error('Permintaan sign-out Supabase gagal:', error);
                UI.showToast('Layanan autentikasi tidak dapat dijangkau; sesi belum dipastikan ditutup.');
                return;
            }
            const { error } = result;
            if (error) {
                console.error('Supabase sign-out gagal:', error);
                UI.showToast('Sesi server gagal ditutup. Periksa koneksi sebelum menutup halaman.');
                return;
            }
        }
        AppState.user = null;
        AppState.role = null;
        AppState.dataset = [];
        AppState.settings = null;
        Router.navigate('landing-view'); 
        document.getElementById('log-email').value = '';
        document.getElementById('log-password').value = '';
    }
};
