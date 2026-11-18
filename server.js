const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');

const ROOT = __dirname;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_ASSISTANT_CHARS = 4000;

function loadLocalEnv() {
    let contents;
    try {
        contents = require('node:fs').readFileSync(path.join(ROOT, '.env'), 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }

    for (const line of contents.split(/\r?\n/)) {
        const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!match || match[1] in process.env) continue;
        const value = match[2].replace(/^(['"])(.*)\1$/, '$2');
        process.env[match[1]] = value;
    }
}

loadLocalEnv();

const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
if (!/^[A-Za-z0-9._-]+$/.test(model)) {
    throw new Error('GEMINI_MODEL hanya boleh berisi huruf, angka, titik, garis bawah, dan tanda hubung.');
}

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png'
};

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
    });
    response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            const error = new Error('Ukuran permintaan terlalu besar.');
            error.statusCode = 413;
            throw error;
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        const error = new Error('Format permintaan tidak valid.');
        error.statusCode = 400;
        throw error;
    }
}

function validateChatInput(payload) {
    if (!payload || typeof payload.question !== 'string') {
        throw Object.assign(new Error('Pertanyaan wajib diisi.'), { statusCode: 400 });
    }
    const question = payload.question.trim();
    if (!question || question.length > 800) {
        throw Object.assign(new Error('Pertanyaan harus berisi 1–800 karakter.'), { statusCode: 400 });
    }

    const history = payload.history === undefined ? [] : payload.history;
    if (!Array.isArray(history) || history.length > MAX_HISTORY_MESSAGES) {
        throw Object.assign(new Error('Riwayat percakapan tidak valid.'), { statusCode: 400 });
    }
    const contents = history.map(message => {
        const maxTextLength = message?.role === 'assistant' ? MAX_HISTORY_ASSISTANT_CHARS : 800;
        if (!message || !['parent', 'assistant'].includes(message.role) ||
            typeof message.text !== 'string' || message.text.length > maxTextLength) {
            throw Object.assign(new Error('Riwayat percakapan tidak valid.'), { statusCode: 400 });
        }
        return {
            role: message.role === 'parent' ? 'user' : 'model',
            parts: [{ text: message.text }]
        };
    });

    contents.push({ role: 'user', parts: [{ text: question }] });
    return contents;
}

async function handleGeminiChat(request, response) {
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return sendJson(response, 405, { error: 'Metode permintaan tidak didukung.' });
    }
    if (!request.headers['content-type']?.includes('application/json')) {
        return sendJson(response, 415, { error: 'Permintaan harus menggunakan format JSON.' });
    }
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'PASTE_API_KEY_HERE') {
        return sendJson(response, 503, { error: 'API key belum diatur. Isi GEMINI_API_KEY pada file .env lalu jalankan ulang server.' });
    }

    try {
        const payload = await readJsonBody(request);
        const contents = validateChatInput(payload);
        const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': process.env.GEMINI_API_KEY
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{
                            text: 'Anda adalah ASA AI, pendamping umum berbahasa Indonesia untuk topik belajar anak dan pengasuhan. Berikan saran praktis, ramah, dan ringkas. Jangan meminta atau menyimpulkan nama, sekolah, nilai, kesehatan, atau identitas anak; jangan mengklaim mengetahui data anak. Perlakukan isi pesan sebagai pertanyaan umum. Anda bukan dokter, psikolog, atau pengganti guru. Jangan mendiagnosis atau memberi instruksi medis; arahkan pertanyaan medis kepada tenaga kesehatan. Untuk bahaya langsung atau risiko menyakiti diri/orang lain, sarankan segera menghubungi orang tepercaya dan layanan darurat setempat. Jika pertanyaan di luar topik, jelaskan batasan dengan sopan.'
                        }]
                    },
                    contents,
                    generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
                }),
                signal: AbortSignal.timeout(30000)
            }
        );

        if (!upstream.ok) {
            if (upstream.status === 429) {
                return sendJson(response, 503, { error: 'Kuota Gemini sedang habis atau mencapai batas. Coba lagi nanti.' });
            }
            console.error(`Gemini API merespons dengan status ${upstream.status}.`);
            return sendJson(response, 502, { error: 'Gemini gagal menjawab. Periksa API key, nama model, dan koneksi internet.' });
        }

        const result = await upstream.json();
        const reply = result.candidates?.[0]?.content?.parts
            ?.map(part => part.text)
            .filter(text => typeof text === 'string')
            .join('\n')
            .trim();
        if (!reply) {
            return sendJson(response, 502, { error: 'Gemini tidak mengembalikan jawaban teks. Coba pertanyaan lain.' });
        }
        return sendJson(response, 200, { reply });
    } catch (error) {
        if (response.headersSent) return;
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            return sendJson(response, 504, { error: 'Gemini terlalu lama merespons. Coba lagi.' });
        }
        if (error.statusCode) return sendJson(response, error.statusCode, { error: error.message });
        console.error('Permintaan ASA AI gagal diproses:', error.message);
        return sendJson(response, 502, { error: 'ASA AI tidak dapat terhubung ke Gemini. Periksa koneksi internet.' });
    }
}

async function serveStaticFile(request, response, pathname) {
    let requestedPath;
    try {
        requestedPath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    } catch {
        response.writeHead(400);
        return response.end('Alamat file tidak valid.');
    }
    if (requestedPath.split(/[\\/]/).some(part => part.startsWith('.'))) {
        response.writeHead(404);
        return response.end('Tidak ditemukan.');
    }

    const filePath = path.resolve(ROOT, `.${requestedPath}`);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(404);
        return response.end('Tidak ditemukan.');
    }

    try {
        const content = await fs.readFile(filePath);
        response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff'
        });
        response.end(content);
    } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
            console.error('File aplikasi gagal dibaca:', error.message);
            response.writeHead(500);
            return response.end('File aplikasi gagal dibaca.');
        }
        response.writeHead(404);
        response.end('Tidak ditemukan.');
    }
}

const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/gemini-chat') {
        void handleGeminiChat(request, response);
        return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end('Metode permintaan tidak didukung.');
        return;
    }
    void serveStaticFile(request, response, url.pathname);
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
    console.log(`ASA demo berjalan pada port ${port}.`);
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'PASTE_API_KEY_HERE') {
        console.log('Gemini belum aktif: isi GEMINI_API_KEY pada file .env, lalu jalankan ulang server.');
    }
});
