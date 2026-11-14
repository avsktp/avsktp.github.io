const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'members.json');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const POINTS_FILE = path.join(DATA_DIR, 'points.json');
const NOTICES_FILE = path.join(DATA_DIR, 'notices.json');
const SIGNATURES_FILE = path.join(DATA_DIR, 'signatures.json');

let serverDataVersion = Date.now();

// Ensure data folder and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(ATTENDANCE_FILE)) {
  fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(POINTS_FILE)) {
  fs.writeFileSync(POINTS_FILE, JSON.stringify({ scores: {}, history: [] }, null, 2), 'utf8');
}
if (!fs.existsSync(NOTICES_FILE)) {
  fs.writeFileSync(NOTICES_FILE, JSON.stringify([], null, 2), 'utf8');
}

function readJsonFile(filePath, defaultVal = []) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || 'null') || defaultVal;
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultVal;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const data = body ? JSON.parse(body) : {};
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // API Endpoints
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // GET /api/version (Lightweight auto-sync checker)
    if (pathname === '/api/version' && req.method === 'GET') {
      const members = readJsonFile(DATA_FILE, []);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, version: serverDataVersion, count: members.length }));
      return;
    }

    // GET /api/members
    if (pathname === '/api/members' && req.method === 'GET') {
      const members = readJsonFile(DATA_FILE, []);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, version: serverDataVersion, count: members.length, data: members }));
      return;
    }

    // POST /api/members (Replace entire list or bulk save)
    if (pathname === '/api/members' && req.method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        const list = Array.isArray(payload) ? payload : (payload.members || []);
        writeJsonFile(DATA_FILE, list);
        serverDataVersion = Date.now();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, count: list.length, message: 'Members updated successfully' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
      return;
    }

    // POST /api/members/add
    if (pathname === '/api/members/add' && req.method === 'POST') {
      try {
        const newMember = await parseJsonBody(req);
        if (!newMember.name || !newMember.phone) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Hming (Name) leh Contact number te hi ziah ngei ngei tur a ni.' }));
          return;
        }

        const members = readJsonFile(DATA_FILE, []);
        newMember.id = newMember.id || 'ktp-' + Date.now();
        newMember.group = newMember.group || '';
        newMember.houseNo = newMember.houseNo || '';
        newMember.upaBial = newMember.upaBial || 'Upa Bial 1';
        newMember.photo = newMember.photo || '';
        members.unshift(newMember);
        writeJsonFile(DATA_FILE, members);
        serverDataVersion = Date.now();

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, data: newMember, message: 'Member thar hlawhtling taka dah a ni.' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Failed to process member: ' + err.message }));
      }
      return;
    }

    // PUT /api/members/:id
    const putMatch = pathname.match(/^\/api\/members\/([^/]+)$/);
    if (putMatch && req.method === 'PUT') {
      try {
        const id = decodeURIComponent(putMatch[1]);
        const updates = await parseJsonBody(req);
        const members = readJsonFile(DATA_FILE, []);
        const index = members.findIndex(m => String(m.id) === id);

        if (index === -1) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: 'Member hmuh a ni lo.' }));
          return;
        }

        members[index] = { ...members[index], ...updates, id };
        writeJsonFile(DATA_FILE, members);
        serverDataVersion = Date.now();

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, data: members[index], message: 'Member siamthat a ni ta.' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // DELETE /api/members/:id
    const delMatch = pathname.match(/^\/api\/members\/([^/]+)$/);
    if (delMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(delMatch[1]);
      const members = readJsonFile(DATA_FILE, []);
      const filtered = members.filter(m => String(m.id) !== id);

      if (filtered.length === members.length) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: 'Member hmuh a ni lo.' }));
        return;
      }

      writeJsonFile(DATA_FILE, filtered);
      serverDataVersion = Date.now();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, version: serverDataVersion, message: 'Member paih a ni ta.' }));
      return;
    }

    // GET /api/signatures
    if (pathname === '/api/signatures' && req.method === 'GET') {
      const sigs = readJsonFile(SIGNATURES_FILE, {});
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, data: sigs }));
      return;
    }

    // POST /api/signatures
    if (pathname === '/api/signatures' && req.method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        writeJsonFile(SIGNATURES_FILE, payload);
        serverDataVersion = Date.now();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, message: 'Signatures saved successfully' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // GET /api/notices
    if (pathname === '/api/notices' && req.method === 'GET') {
      const notices = readJsonFile(NOTICES_FILE, []);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, count: notices.length, data: notices }));
      return;
    }

    // POST /api/notices (Bulk update / replace)
    if (pathname === '/api/notices' && req.method === 'POST') {
      try {
        const payload = await parseJsonBody(req);
        const list = Array.isArray(payload) ? payload : (payload.notices || []);
        writeJsonFile(NOTICES_FILE, list);
        serverDataVersion = Date.now();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, count: list.length, message: 'Notices saved successfully' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
      return;
    }

    // POST /api/notices/add
    if (pathname === '/api/notices/add' && req.method === 'POST') {
      try {
        const newNotice = await parseJsonBody(req);
        newNotice.category = newNotice.category || 'General';
        newNotice.content = newNotice.content || '';
        newNotice.photo = newNotice.photo || '';
        if (!newNotice.title && !newNotice.content && !newNotice.photo) {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: 'Khawngaihin flyer thlalak, thupui, emaw thu tal dah rawh.' }));
          return;
        }
        newNotice.title = newNotice.title || (newNotice.photo ? `${newNotice.category} Flyer` : `${newNotice.category} Hriattirna`);
        newNotice.id = newNotice.id || 'not-' + Date.now();
        newNotice.date = newNotice.date || new Date().toISOString().slice(0, 10);

        const notices = readJsonFile(NOTICES_FILE, []);
        notices.unshift(newNotice);
        writeJsonFile(NOTICES_FILE, notices);
        serverDataVersion = Date.now();

        res.writeHead(201);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, data: newNotice, message: 'Notice thar tarchhuah a ni ta.' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // PUT /api/notices/:id
    const putNoticeMatch = pathname.match(/^\/api\/notices\/([^/]+)$/);
    if (putNoticeMatch && req.method === 'PUT') {
      try {
        const id = decodeURIComponent(putNoticeMatch[1]);
        const updates = await parseJsonBody(req);
        const notices = readJsonFile(NOTICES_FILE, []);
        const index = notices.findIndex(n => String(n.id) === id);

        if (index === -1) {
          res.writeHead(404);
          res.end(JSON.stringify({ success: false, error: 'Notice hmuh a ni lo.' }));
          return;
        }

        notices[index] = { ...notices[index], ...updates, id };
        writeJsonFile(NOTICES_FILE, notices);
        serverDataVersion = Date.now();

        res.writeHead(200);
        res.end(JSON.stringify({ success: true, version: serverDataVersion, data: notices[index], message: 'Notice siamthat a ni ta.' }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // DELETE /api/notices/:id
    const delNoticeMatch = pathname.match(/^\/api\/notices\/([^/]+)$/);
    if (delNoticeMatch && req.method === 'DELETE') {
      const id = decodeURIComponent(delNoticeMatch[1]);
      const notices = readJsonFile(NOTICES_FILE, []);
      const filtered = notices.filter(n => String(n.id) !== id);

      if (filtered.length === notices.length) {
        res.writeHead(404);
        res.end(JSON.stringify({ success: false, error: 'Notice hmuh a ni lo.' }));
        return;
      }

      writeJsonFile(NOTICES_FILE, filtered);
      serverDataVersion = Date.now();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, version: serverDataVersion, message: 'Notice paih a ni ta.' }));
      return;
    }

    // GET /api/stats
    if (pathname === '/api/stats' && req.method === 'GET') {
      const members = readJsonFile(DATA_FILE, []);
      const groups = {};

      members.forEach(m => {
        groups[m.group] = (groups[m.group] || 0) + 1;
      });

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        total: members.length,
        groups
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ success: false, error: 'API endpoint not found' }));
    return;
  }

  // Serve static files
  let safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(__dirname, 'index.html');
      fs.readFile(fallback, (fErr, content) => {
        if (fErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      }
    });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n[OK] Port ${PORT} is already running.`);
    console.log(`Active URL: http://localhost:${PORT}`);
    process.exit(0);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
  }

  console.log('========================================================');
  console.log('  KRISTIAN THALAI PAWL - ARMED VENG SOUTH BRANCH');
  console.log('  Member Directory & Notice Board');
  console.log('========================================================');
  console.log(`  Local URL:   http://localhost:${PORT}`);
  console.log(`  Network URL: http://${localIP}:${PORT}`);
  console.log('========================================================\n');
});
