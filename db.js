// NCLEX Exam Simulator Pro - Database & Authentication Layer
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Password hashing utility using PBKDF2
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return testHash === hash;
}

// Database implementation using Node built-in SQLite with JSON fallback
class DatabaseManager {
  constructor() {
    this.useSqlite = false;
    this.sqliteDb = null;
    this.jsonFile = path.join(DB_DIR, 'nclex-data.json');
    this.init();
  }

  init() {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const dbPath = path.join(DB_DIR, 'nclex.db');
      this.sqliteDb = new DatabaseSync(dbPath);
      this.useSqlite = true;
      this.initSqliteSchema();
      console.log('✓ Database initialized: SQLite (database/nclex.db)');
    } catch (err) {
      console.warn('node:sqlite not available or failed, falling back to JSON database:', err.message);
      this.useSqlite = false;
      this.initJsonSchema();
      console.log('✓ Database initialized: JSON Store (database/nclex-data.json)');
    }
    this.seedDefaultAccounts();
  }

  initSqliteSchema() {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'student',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS exam_results (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        source_bank TEXT,
        total_questions INTEGER NOT NULL,
        correct INTEGER NOT NULL,
        wrong INTEGER NOT NULL,
        blank INTEGER NOT NULL,
        percentage INTEGER NOT NULL,
        is_pass INTEGER NOT NULL,
        time_spent_seconds INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        details_json TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS bookmarks (
        user_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (user_id, question_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id INTEGER PRIMARY KEY,
        theme TEXT DEFAULT 'modern',
        font_size TEXT DEFAULT 'normal',
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  initJsonSchema() {
    if (!fs.existsSync(this.jsonFile)) {
      const initial = {
        users: [],
        sessions: {},
        exam_results: [],
        bookmarks: {},
        user_preferences: {}
      };
      fs.writeFileSync(this.jsonFile, JSON.stringify(initial, null, 2), 'utf8');
    }
  }

  readJson() {
    try {
      return JSON.parse(fs.readFileSync(this.jsonFile, 'utf8'));
    } catch(e) {
      return { users: [], sessions: {}, exam_results: [], bookmarks: {}, user_preferences: {} };
    }
  }

  writeJson(data) {
    fs.writeFileSync(this.jsonFile, JSON.stringify(data, null, 2), 'utf8');
  }

  seedDefaultAccounts() {
    const defaults = [
      {
        username: 'admin',
        password: 'admin123',
        name: 'Dr. Sarah Mitchell, DNP, RN',
        role: 'admin'
      },
      {
        username: 'student1',
        password: 'nurse2026',
        name: 'Emily Davis, BSN Candidate',
        role: 'student'
      },
      {
        username: 'student2',
        password: 'nurse2026',
        name: 'Michael Chang, RN Applicant',
        role: 'student'
      },
      {
        username: 'student3',
        password: 'nurse2026',
        name: 'Jessica Taylor, Nursing Graduate',
        role: 'student'
      },
      {
        username: 'demo',
        password: 'demo123',
        name: 'Demo Student Nurse',
        role: 'student'
      }
    ];

    defaults.forEach(u => {
      const existing = this.getUserByUsername(u.username);
      if (!existing) {
        this.createUser(u.username, u.password, u.name, u.role);
      }
    });

    // Seed realistic sample exam history for Emily (student1) if empty
    const s1 = this.getUserByUsername('student1');
    if (s1) {
      const history = this.getExamHistory(s1.id);
      if (history.length === 0) {
        this.saveExamResult(s1.id, {
          id: Date.now() - 86400000 * 2,
          title: 'NCLEX CAT Practice Exam (85 Qs)',
          sourceBank: 'Comprehensive NCLEX',
          totalQuestions: 85,
          correct: 62,
          wrong: 20,
          blank: 3,
          percentage: 73,
          isPass: true,
          timeSpentSeconds: 6120,
          timestamp: Date.now() - 86400000 * 2,
          details: { categoryStats: { 'Pharmacology': { total: 25, correct: 19 }, 'Med-Surg': { total: 30, correct: 22 } } }
        });
        this.saveExamResult(s1.id, {
          id: Date.now() - 86400000 * 4,
          title: 'SATA Specialist Drill (50 Qs)',
          sourceBank: 'NCLEX Practice Bank 4',
          totalQuestions: 50,
          correct: 36,
          wrong: 14,
          blank: 0,
          percentage: 72,
          isPass: true,
          timeSpentSeconds: 3200,
          timestamp: Date.now() - 86400000 * 4,
          details: { categoryStats: { 'Safety': { total: 20, correct: 15 } } }
        });
        this.saveBookmark(s1.id, 1);
        this.saveBookmark(s1.id, 4);
        this.saveBookmark(s1.id, 18);
      }
    }
  }

  // --- USER OPERATIONS ---
  getUserByUsername(username) {
    username = String(username).trim().toLowerCase();
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT id, username, password_hash, salt, name, role, created_at FROM users WHERE username = ?');
      return stmt.get(username) || null;
    } else {
      const data = this.readJson();
      return data.users.find(u => u.username.toLowerCase() === username) || null;
    }
  }

  getUserById(id) {
    id = Number(id);
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?');
      return stmt.get(id) || null;
    } else {
      const data = this.readJson();
      const u = data.users.find(u => u.id === id);
      if (!u) return null;
      return { id: u.id, username: u.username, name: u.name, role: u.role, created_at: u.created_at };
    }
  }

  createUser(username, password, name, role = 'student') {
    username = String(username).trim().toLowerCase();
    name = String(name).trim() || username;
    const { hash, salt } = hashPassword(password);
    const createdAt = new Date().toISOString();

    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare(`
        INSERT INTO users (username, password_hash, salt, name, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const res = stmt.run(username, hash, salt, name, role, createdAt);
      return { id: res.lastInsertRowid, username, name, role, created_at: createdAt };
    } else {
      const data = this.readJson();
      const newId = (data.users.length > 0 ? Math.max(...data.users.map(u => u.id)) : 0) + 1;
      const user = { id: newId, username, password_hash: hash, salt, name, role, created_at: createdAt };
      data.users.push(user);
      this.writeJson(data);
      return { id: newId, username, name, role, created_at: createdAt };
    }
  }

  authenticate(username, password) {
    const user = this.getUserByUsername(username);
    if (!user) return null;
    const isValid = verifyPassword(password, user.password_hash, user.salt);
    if (!isValid) return null;
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
  }

  // --- SESSIONS ---
  createSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); // 30 days

    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)');
      stmt.run(token, userId, createdAt, expiresAt);
    } else {
      const data = this.readJson();
      data.sessions[token] = { user_id: userId, created_at: createdAt, expires_at: expiresAt };
      this.writeJson(data);
    }
    return token;
  }

  getUserByToken(token) {
    if (!token) return null;
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT u.id, u.username, u.name, u.role
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > datetime('now')
      `);
      return stmt.get(token) || null;
    } else {
      const data = this.readJson();
      const session = data.sessions[token];
      if (!session) return null;
      if (new Date(session.expires_at) < new Date()) {
        delete data.sessions[token];
        this.writeJson(data);
        return null;
      }
      return this.getUserById(session.user_id);
    }
  }

  deleteSession(token) {
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('DELETE FROM sessions WHERE token = ?');
      stmt.run(token);
    } else {
      const data = this.readJson();
      delete data.sessions[token];
      this.writeJson(data);
    }
  }

  // --- EXAM RESULTS & HISTORY ---
  getExamHistory(userId) {
    userId = Number(userId);
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare(`
        SELECT id, title, source_bank as sourceBank, total_questions as totalQuestions,
               correct, wrong, blank, percentage, is_pass as isPass,
               time_spent_seconds as timeSpentSeconds, timestamp, details_json as detailsJson
        FROM exam_results
        WHERE user_id = ?
        ORDER BY timestamp DESC
      `);
      const rows = stmt.all(userId);
      return rows.map(r => ({
        ...r,
        isPass: Boolean(r.isPass),
        details: r.detailsJson ? JSON.parse(r.detailsJson) : null
      }));
    } else {
      const data = this.readJson();
      return (data.exam_results || [])
        .filter(r => r.user_id === userId)
        .sort((a, b) => b.timestamp - a.timestamp);
    }
  }

  saveExamResult(userId, examRecord) {
    userId = Number(userId);
    const id = examRecord.id || Date.now();
    const title = examRecord.title || 'Practice Exam';
    const sourceBank = examRecord.sourceBank || 'All Banks';
    const totalQ = Number(examRecord.totalQuestions || 0);
    const correct = Number(examRecord.correct || 0);
    const wrong = Number(examRecord.wrong || 0);
    const blank = Number(examRecord.blank || 0);
    const pct = Number(examRecord.percentage || 0);
    const isPass = examRecord.isPass ? 1 : 0;
    const timeSpent = Number(examRecord.timeSpentSeconds || 0);
    const ts = Number(examRecord.timestamp || Date.now());
    const detailsJson = JSON.stringify(examRecord.details || examRecord.items || {});

    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare(`
        INSERT OR REPLACE INTO exam_results
        (id, user_id, title, source_bank, total_questions, correct, wrong, blank, percentage, is_pass, time_spent_seconds, timestamp, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, userId, title, sourceBank, totalQ, correct, wrong, blank, pct, isPass, timeSpent, ts, detailsJson);
    } else {
      const data = this.readJson();
      if (!data.exam_results) data.exam_results = [];
      const item = {
        id,
        user_id: userId,
        title,
        sourceBank,
        totalQuestions: totalQ,
        correct,
        wrong,
        blank,
        percentage: pct,
        isPass: Boolean(isPass),
        timeSpentSeconds: timeSpent,
        timestamp: ts,
        details: examRecord.details || null
      };
      const idx = data.exam_results.findIndex(r => r.id === id);
      if (idx !== -1) data.exam_results[idx] = item;
      else data.exam_results.unshift(item);
      this.writeJson(data);
    }
  }

  clearExamHistory(userId) {
    userId = Number(userId);
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('DELETE FROM exam_results WHERE user_id = ?');
      stmt.run(userId);
    } else {
      const data = this.readJson();
      data.exam_results = (data.exam_results || []).filter(r => r.user_id !== userId);
      this.writeJson(data);
    }
  }

  // --- BOOKMARKS ---
  getBookmarks(userId) {
    userId = Number(userId);
    if (this.useSqlite) {
      const stmt = this.sqliteDb.prepare('SELECT question_id FROM bookmarks WHERE user_id = ?');
      const rows = stmt.all(userId);
      return rows.map(r => r.question_id);
    } else {
      const data = this.readJson();
      return (data.bookmarks && data.bookmarks[userId]) || [];
    }
  }

  toggleBookmark(userId, questionId) {
    userId = Number(userId);
    questionId = Number(questionId);
    if (this.useSqlite) {
      const checkStmt = this.sqliteDb.prepare('SELECT question_id FROM bookmarks WHERE user_id = ? AND question_id = ?');
      const exists = checkStmt.get(userId, questionId);
      if (exists) {
        this.sqliteDb.prepare('DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?').run(userId, questionId);
        return false;
      } else {
        this.sqliteDb.prepare('INSERT INTO bookmarks (user_id, question_id, saved_at) VALUES (?, ?, ?)').run(userId, questionId, new Date().toISOString());
        return true;
      }
    } else {
      const data = this.readJson();
      if (!data.bookmarks) data.bookmarks = {};
      if (!data.bookmarks[userId]) data.bookmarks[userId] = [];
      const idx = data.bookmarks[userId].indexOf(questionId);
      let isSaved = false;
      if (idx !== -1) {
        data.bookmarks[userId].splice(idx, 1);
        isSaved = false;
      } else {
        data.bookmarks[userId].push(questionId);
        isSaved = true;
      }
      this.writeJson(data);
      return isSaved;
    }
  }

  saveBookmark(userId, questionId) {
    userId = Number(userId);
    questionId = Number(questionId);
    if (this.useSqlite) {
      this.sqliteDb.prepare('INSERT OR IGNORE INTO bookmarks (user_id, question_id, saved_at) VALUES (?, ?, ?)').run(userId, questionId, new Date().toISOString());
    } else {
      const data = this.readJson();
      if (!data.bookmarks) data.bookmarks = {};
      if (!data.bookmarks[userId]) data.bookmarks[userId] = [];
      if (!data.bookmarks[userId].includes(questionId)) {
        data.bookmarks[userId].push(questionId);
        this.writeJson(data);
      }
    }
  }

  // --- ADMIN STATS ---
  getAdminOverview() {
    let usersList = [];
    let recentExams = [];

    if (this.useSqlite) {
      const userStmt = this.sqliteDb.prepare(`
        SELECT u.id, u.username, u.name, u.role, u.created_at,
               COUNT(e.id) as exams_taken,
               COALESCE(AVG(e.percentage), 0) as avg_score,
               COALESCE(SUM(e.correct), 0) as total_correct,
               COALESCE(SUM(e.total_questions), 0) as total_questions
        FROM users u
        LEFT JOIN exam_results e ON u.id = e.user_id
        GROUP BY u.id
        ORDER BY u.id ASC
      `);
      usersList = userStmt.all().map(u => ({
        ...u,
        avg_score: Math.round(u.avg_score)
      }));

      const recentStmt = this.sqliteDb.prepare(`
        SELECT e.id, u.username, u.name, e.title, e.percentage, e.is_pass, e.timestamp, e.time_spent_seconds
        FROM exam_results e
        JOIN users u ON e.user_id = u.id
        ORDER BY e.timestamp DESC
        LIMIT 20
      `);
      recentExams = recentStmt.all().map(e => ({
        ...e,
        is_pass: Boolean(e.is_pass)
      }));
    } else {
      const data = this.readJson();
      usersList = data.users.map(u => {
        const uExams = (data.exam_results || []).filter(e => e.user_id === u.id);
        const avg = uExams.length > 0 ? Math.round(uExams.reduce((s, e) => s + e.percentage, 0) / uExams.length) : 0;
        return {
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          created_at: u.created_at,
          exams_taken: uExams.length,
          avg_score: avg
        };
      });

      recentExams = (data.exam_results || []).slice(0, 20).map(e => {
        const u = data.users.find(usr => usr.id === e.user_id) || {};
        return {
          id: e.id,
          username: u.username || 'unknown',
          name: u.name || 'Unknown Student',
          title: e.title,
          percentage: e.percentage,
          is_pass: e.isPass,
          timestamp: e.timestamp,
          time_spent_seconds: e.timeSpentSeconds
        };
      });
    }

    const totalStudents = usersList.filter(u => u.role === 'student').length;
    let totalAttempts = 0;
    let totalPass = 0;
    recentExams.forEach(e => {
      totalAttempts++;
      if (e.is_pass) totalPass++;
    });

    return {
      totalStudents,
      totalExamsRecorded: usersList.reduce((s, u) => s + (u.exams_taken || 0), 0),
      users: usersList,
      recentExams
    };
  }
}

const db = new DatabaseManager();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};
