const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 44905;
const GEN_DIR = path.join(__dirname, 'generations');
const META_FILE = path.join(__dirname, 'metadata.json');
const jobs = new Map();

// Ensure directories and files exist
try {
  if (!fs.existsSync(GEN_DIR)) fs.mkdirSync(GEN_DIR, { recursive: true });
  if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, '[]');
} catch (e) {
  console.error('Initial setup error:', e);
}

function getMetadata() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    console.error('Metadata read error:', e);
    return [];
  }
}

function saveMetadata(meta) {
  try {
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.error('Metadata save error:', e);
  }
}

const server = http.createServer(async (req, res) => {
  // Add global error handler for the request
  req.on('error', err => console.error('Request error:', err));
  res.on('error', err => console.error('Response error:', err));

  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE, PATCH');

    if (req.method === 'OPTIONS') { 
      res.writeHead(204); 
      return res.end(); 
    }

    // Manual path parsing to avoid URL constructor issues
    const urlParts = req.url.split('?');
    const pathname = urlParts[0];

    // Serve index.html
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const indexPath = path.join(__dirname, 'index.html');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(html);
      } else {
        res.writeHead(404);
        return res.end('index.html not found');
      }
    }

    // Serve audio files
    if (req.method === 'GET' && pathname.startsWith('/generations/')) {
      const fileName = path.basename(pathname);
      const filePath = path.join(GEN_DIR, fileName);
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': 'audio/wav' });
        return fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404);
        return res.end('Audio not found');
      }
    }

    // List generations
    if (req.method === 'GET' && pathname === '/api/generations') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(getMetadata()));
    }

    // TTS Job (fire-and-poll)
    if (req.method === 'POST' && pathname === '/api/tts-job') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const params = JSON.parse(body);
          const jobId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          jobs.set(jobId, { status: 'pending' });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jobId }));
          // Background generation
          (async () => {
            jobs.set(jobId, { status: 'processing' });
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);
            try {
              const { apiKey, voice, input, temperature, speed } = params;
              const upstream = await fetch('https://openrouter.ai/api/v1/audio/speech', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'https://reds.zo.computer',
                  'X-OpenRouter-Title': 'Animal Mind TTS Studio'
                },
                body: JSON.stringify({
                  model: 'google/gemini-3.1-flash-tts-preview',
                  input,
                  voice: (voice || 'aoede').toLowerCase(),
                  response_format: 'pcm',
                  temperature: temperature !== undefined ? Number(temperature) : 1.0,
                  speed: speed !== undefined ? Number(speed) : 1.0
                }),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (!upstream.ok) {
                const t = await upstream.text();
                jobs.set(jobId, { status: 'error', error: `API error ${upstream.status}: ${t.slice(0,300)}` });
              } else {
                const buf = Buffer.from(await upstream.arrayBuffer());
                jobs.set(jobId, { status: 'done', pcm: buf });
              }
            } catch(e) {
              clearTimeout(timeoutId);
              jobs.set(jobId, { status: 'error', error: e.message });
            }
          })();
        } catch(e) {
          if (!res.writableEnded) { res.writeHead(400); res.end(e.message); }
        }
      });
      return;
    }

    // TTS Job status/result poll
    if (req.method === 'GET' && pathname.startsWith('/api/tts-job/')) {
      const jobId = pathname.slice('/api/tts-job/'.length);
      const job = jobs.get(jobId);
      if (!job) { res.writeHead(404); return res.end(JSON.stringify({ status: 'not_found' })); }
      if (job.status === 'pending' || job.status === 'processing') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: job.status }));
      }
      if (job.status === 'done') {
        const pcm = job.pcm;
        jobs.delete(jobId);
        res.writeHead(200, { 'Content-Type': 'audio/pcm' });
        return res.end(pcm);
      }
      if (job.status === 'error') {
        const err = job.error;
        jobs.delete(jobId);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ status: 'error', error: err }));
      }
      return;
    }

    // TTS Proxy
    if (req.method === 'POST' && pathname === '/api/tts-proxy') {
      let body = '';
      req.on('data', d => body += d);
      req.on('end', async () => {
        try {
          const { apiKey, voice, input, temperature, speed } = JSON.parse(body);
          const sleep = ms => new Promise(r => setTimeout(r, ms));
          let lastError;
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await sleep(2000);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            try {
              const upstream = await fetch('https://openrouter.ai/api/v1/audio/speech', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'https://reds.zo.computer',
                  'X-OpenRouter-Title': 'Animal Mind TTS Studio'
                },
                body: JSON.stringify({
                  model: 'google/gemini-3.1-flash-tts-preview',
                  input,
                  voice: (voice || 'aoede').toLowerCase(),
                  response_format: 'pcm',
                  temperature: temperature !== undefined ? Number(temperature) : 1.0,
                  speed: speed !== undefined ? Number(speed) : 1.0
                })
              });
              clearTimeout(timeoutId);
              if (!upstream.ok) {
                const t = await upstream.text();
                res.writeHead(upstream.status, { 'Content-Type': 'text/plain' });
                return res.end(t);
              }
              const buf = Buffer.from(await upstream.arrayBuffer());
              res.writeHead(200, { 'Content-Type': 'audio/pcm' });
              return res.end(buf);
            } catch (e) {
              lastError = e;
              console.error(`TTS Proxy attempt ${attempt + 1} failed:`, e.message);
            } finally {
              clearTimeout(timeoutId);
            }
          }
          throw lastError;
        } catch (e) {
          console.error('Proxy internal error:', e);
          if (!res.writableEnded) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        }
      });
      return;
    }

    // Save generation
    if (req.method === 'POST' && pathname === '/api/save') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        try {
          const fullBody = Buffer.concat(chunks);
          const jsonLen = fullBody.readUInt32BE(0);
          const jsonStr = fullBody.slice(4, 4 + jsonLen).toString();
          const meta = JSON.parse(jsonStr);
          const audioData = fullBody.slice(4 + jsonLen);

          const fileName = `${meta.id}.wav`;
          fs.writeFileSync(path.join(GEN_DIR, fileName), audioData);

          const allMeta = getMetadata();
          const existingIdx = allMeta.findIndex(m => m.id === meta.id);
          if (existingIdx !== -1) {
            allMeta[existingIdx] = { ...allMeta[existingIdx], ...meta };
          } else {
            allMeta.unshift(meta);
          }
          saveMetadata(allMeta);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          console.error('Save error:', e);
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end(e.message);
          }
        }
      });
      return;
    }

    // Update/Rename generation
    if (req.method === 'PATCH' && pathname.startsWith('/api/generations/')) {
      const id = pathname.split('/').pop();
      let body = '';
      req.on('data', d => body += d);
      req.on('end', () => {
        try {
          const updates = JSON.parse(body);
          const allMeta = getMetadata();
          const idx = allMeta.findIndex(m => m.id === id);
          if (idx !== -1) {
            allMeta[idx] = { ...allMeta[idx], ...updates };
            saveMetadata(allMeta);
            res.writeHead(200);
            res.end('OK');
          } else {
            res.writeHead(404);
            res.end('Not found');
          }
        } catch (e) {
          console.error('Patch error:', e);
          if (!res.writableEnded) {
            res.writeHead(500);
            res.end(e.message);
          }
        }
      });
      return;
    }

    // Delete generation
    if (req.method === 'DELETE' && pathname.startsWith('/api/generations/')) {
      const id = pathname.split('/').pop();
      const allMeta = getMetadata();
      const idx = allMeta.findIndex(m => m.id === id);
      if (idx !== -1) {
        allMeta.splice(idx, 1);
        saveMetadata(allMeta);
        const filePath = path.join(GEN_DIR, `${id}.wav`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.writeHead(200);
        res.end('OK');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
      return;
    }

    // Fallthrough
    res.writeHead(404);
    res.end('Not found');

  } catch (globalError) {
    console.error('GLOBAL SERVER ERROR:', globalError);
    if (!res.writableEnded) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

// Prevent process exit on uncaught errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`TTS Studio running on port ${PORT}`);
});
