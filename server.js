const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const { exec } = require('child_process');
const { db } = require('./db');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// Helper: parse request body as JSON
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) { // 5MB guard
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

// Helper: authenticate from Authorization header or ?token=
function authenticateRequest(req) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      token = parsedUrl.searchParams.get('token');
    } catch (e) {}
  }

  if (!token) return null;
  const user = db.getUserByToken(token);
  return user ? { user, token } : null;
}

// REST API Handler
async function handleApiRequest(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  // --- HEALTH CHECK ---
  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database: db.useSqlite ? 'sqlite' : 'json-fallback',
      totalQuestions: 11718,
      version: '2.0.0-online'
    });
  }

  // --- PUBLIC SEEDED ACCOUNTS LIST ---
  if (pathname === '/api/auth/accounts' && method === 'GET') {
    return sendJson(res, 200, [
      { username: 'admin', name: 'Dr. Sarah Mitchell, DNP, RN', role: 'admin', desc: 'Faculty / Admin (Full Cohort Analytics)' },
      { username: 'student1', name: 'Emily Davis, BSN Candidate', role: 'student', desc: 'Pre-loaded test history & saved SATA' },
      { username: 'student2', name: 'Michael Chang, RN Applicant', role: 'student', desc: 'Active Student Candidate' },
      { username: 'student3', name: 'Jessica Taylor, Nursing Graduate', role: 'student', desc: 'NCLEX Candidate' },
      { username: 'demo', name: 'Demo Student Nurse', role: 'student', desc: 'Quick Demo / Sandbox' }
    ]);
  }

  // --- AUTH: LOGIN ---
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { username, password } = body;
      if (!username || !password) {
        return sendJson(res, 400, { error: 'Username and password are required' });
      }

      const user = db.authenticate(username, password);
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid username or password. Please try again.' });
      }

      const token = db.createSession(user.id);
      return sendJson(res, 200, {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- AUTH: REGISTER ---
  if (pathname === '/api/auth/register' && method === 'POST') {
    try {
      const body = await parseRequestBody(req);
      const { username, password, name, role } = body;

      if (!username || !password) {
        return sendJson(res, 400, { error: 'Username and password are required' });
      }

      if (username.length < 3) {
        return sendJson(res, 400, { error: 'Username must be at least 3 characters long' });
      }

      if (password.length < 4) {
        return sendJson(res, 400, { error: 'Password must be at least 4 characters long' });
      }

      const existing = db.getUserByUsername(username);
      if (existing) {
        return sendJson(res, 409, { error: 'Username is already taken. Please choose another.' });
      }

      const safeRole = role === 'admin' ? 'admin' : 'student';
      const user = db.createUser(username, password, name || username, safeRole);
      const token = db.createSession(user.id);

      return sendJson(res, 201, {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- AUTH: GET CURRENT USER ---
  if (pathname === '/api/auth/me' && method === 'GET') {
    const auth = authenticateRequest(req);
    if (!auth) {
      return sendJson(res, 401, { error: 'Unauthorized. Please sign in.' });
    }
    return sendJson(res, 200, { user: auth.user });
  }

  // --- AUTH: LOGOUT ---
  if (pathname === '/api/auth/logout' && method === 'POST') {
    const auth = authenticateRequest(req);
    if (auth) {
      db.deleteSession(auth.token);
    }
    return sendJson(res, 200, { success: true });
  }

  // --- USER EXAM HISTORY ---
  if (pathname === '/api/user/history') {
    const auth = authenticateRequest(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

    if (method === 'GET') {
      const history = db.getExamHistory(auth.user.id);
      return sendJson(res, 200, { history });
    }

    if (method === 'POST') {
      try {
        const body = await parseRequestBody(req);
        db.saveExamResult(auth.user.id, body);
        const history = db.getExamHistory(auth.user.id);
        return sendJson(res, 200, { success: true, history });
      } catch (err) {
        return sendJson(res, 500, { error: err.message });
      }
    }

    if (method === 'DELETE') {
      db.clearExamHistory(auth.user.id);
      return sendJson(res, 200, { success: true, history: [] });
    }
  }

  // --- USER BOOKMARKS ---
  if (pathname === '/api/user/bookmarks') {
    const auth = authenticateRequest(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

    if (method === 'GET') {
      const bookmarks = db.getBookmarks(auth.user.id);
      return sendJson(res, 200, { bookmarks });
    }
  }

  if (pathname === '/api/user/bookmarks/toggle' && method === 'POST') {
    const auth = authenticateRequest(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

    try {
      const body = await parseRequestBody(req);
      const questionId = Number(body.questionId);
      if (!questionId) {
        return sendJson(res, 400, { error: 'Invalid questionId' });
      }
      const isSaved = db.toggleBookmark(auth.user.id, questionId);
      const bookmarks = db.getBookmarks(auth.user.id);
      return sendJson(res, 200, { success: true, isSaved, bookmarks });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  if (pathname === '/api/user/bookmarks/sync' && method === 'POST') {
    const auth = authenticateRequest(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });

    try {
      const body = await parseRequestBody(req);
      const bookmarkIds = Array.isArray(body.bookmarkIds) ? body.bookmarkIds : [];
      bookmarkIds.forEach(qid => db.saveBookmark(auth.user.id, Number(qid)));
      const bookmarks = db.getBookmarks(auth.user.id);
      return sendJson(res, 200, { success: true, bookmarks });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // --- ADMIN COHORT OVERVIEW ---
  if (pathname === '/api/admin/overview' && method === 'GET') {
    const auth = authenticateRequest(req);
    if (!auth) return sendJson(res, 401, { error: 'Unauthorized' });
    if (auth.user.role !== 'admin') {
      return sendJson(res, 403, { error: 'Forbidden: Instructor or Admin privileges required.' });
    }

    const overview = db.getAdminOverview();
    return sendJson(res, 200, overview);
  }

  // Unknown API route
  return sendJson(res, 404, { error: 'Endpoint not found' });
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Route API requests
  if (parsedUrl.pathname.startsWith('/api/')) {
    return handleApiRequest(req, res, parsedUrl);
  }

  // Static File Serving
  let reqPath = decodeURI(parsedUrl.pathname);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const safePath = path.normalize(path.join(BASE_DIR, reqPath));
  if (!safePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access Denied');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const acceptEncoding = req.headers['accept-encoding'] || '';

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    };

    // Use gzip compression for large JSON or JS/CSS files if client supports it
    const shouldGzip = (ext === '.json' || ext === '.js' || ext === '.html' || ext === '.css') && stats.size > 10240;

    if (shouldGzip && acceptEncoding.includes('gzip')) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      const rawStream = fs.createReadStream(safePath);
      const gzip = zlib.createGzip({ level: 6 });
      rawStream.pipe(gzip).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      const stream = fs.createReadStream(safePath);
      stream.pipe(res);
    }
  });
});

// Find Local IP for network access
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, HOST, () => {
  const localIp = getLocalIp();
  console.log(`================================================================`);
  console.log(`   🩺 NCLEX Exam Simulator Pro - Online Web Application        `);
  console.log(`================================================================`);
  console.log(` Local URL:    http://localhost:${PORT}`);
  console.log(` Network URL:  http://${localIp}:${PORT}`);
  console.log(` Status:       Running (0.0.0.0:${PORT})`);
  console.log(` Questions:    11,718 clinical items across 6 question banks`);
  console.log(` Database:     ${db.useSqlite ? 'SQLite (database/nclex.db)' : 'JSON Store'}`);
  console.log(` Pre-seeded User IDs:`);
  console.log(`   • admin    / admin123  (Dr. Sarah Mitchell, DNP, RN - Faculty Admin)`);
  console.log(`   • student1 / nurse2026 (Emily Davis, BSN Candidate - with history)`);
  console.log(`   • student2 / nurse2026 (Michael Chang, RN Applicant)`);
  console.log(`   • student3 / nurse2026 (Jessica Taylor, Nursing Graduate)`);
  console.log(`   • demo     / demo123   (Demo Student Nurse)`);
  console.log(`================================================================`);

  // Optionally auto-open browser in local development
  if (process.env.AUTO_OPEN !== 'false' && !process.env.PORT) {
    exec(`start http://localhost:${PORT}`);
  }
});
