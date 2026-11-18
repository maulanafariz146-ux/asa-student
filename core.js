let ewsChartInstance = null; 
let ipkBarChartInstance = null; // Tambahan chart ke 2

const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const parseCSVRecords = (text, delimiter) => {
    const records = [];
    let record = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const character = text[i];
        if (character === '"' && text[i + 1] === '"' && quoted) {
            value += '"';
            i++;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (character === delimiter && !quoted) {
            record.push(value.trim());
            value = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && text[i + 1] === '\n') i++;
            record.push(value.trim());
            if (record.some(cell => cell !== '')) records.push(record);
            record = [];
            value = '';
        } else {
            value += character;
        }
    }
    record.push(value.trim());
    if (record.some(cell => cell !== '')) records.push(record);
    if (quoted) throw new Error('Tanda kutip pada CSV tidak berpasangan. Periksa isi file.');
    return records;
};

const getStoredDataset = () => {
    const raw = localStorage.getItem('kampus_dataset');
    if (raw === null) return [];
    const dataset = JSON.parse(raw);
    if (!Array.isArray(dataset)) throw new Error('Format dataset lokal tidak valid.');
    return dataset;
};

const supabaseConfig = window.ASA_SUPABASE_CONFIG || {};
const SupabaseStore = {
    configured: Boolean(supabaseConfig.url && supabaseConfig.anonKey),
    client: null
};
if (SupabaseStore.configured && window.supabase && window.supabase.createClient) {
    try {
        SupabaseStore.client = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
    } catch (error) {
        console.error('Konfigurasi client Supabase tidak valid:', error);
    }
}

const AppState = {
    user: null,
    role: null,
    dataset: [],
    settings: null,
    metadata: null,
    passwordRecovery: false
};

const getActiveDataset = () => SupabaseStore.configured ? AppState.dataset : getStoredDataset();

const UI = {
    showToast: (msg) => {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
        c.appendChild(t); setTimeout(() => t.remove(), 3500);
    }
};

const Router = {
    navigate: (id) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
    }
};
