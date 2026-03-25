require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Admin credentials ──────────────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@vantahiring.ca';
const ADMIN_PASSWORD = 'hiring_admin';

// Simple token store (in production use JWT or sessions)
const activeTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !activeTokens.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Database ─────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS applicants (
      id            SERIAL PRIMARY KEY,
      submitted_at  TIMESTAMPTZ DEFAULT NOW(),
      full_name     TEXT NOT NULL,
      email         TEXT,
      phone         TEXT NOT NULL,
      date_of_birth DATE NOT NULL,
      marital_status TEXT NOT NULL,
      id_image_data TEXT,
      id_image_type TEXT,
      nda_agreed    BOOLEAN NOT NULL DEFAULT FALSE,
      avail_weekends  BOOLEAN NOT NULL DEFAULT FALSE,
      avail_evenings  BOOLEAN NOT NULL DEFAULT FALSE,
      on_call       BOOLEAN NOT NULL DEFAULT FALSE,
      has_license   BOOLEAN NOT NULL DEFAULT FALSE,
      startup_ok    BOOLEAN NOT NULL DEFAULT FALSE,
      has_second_job BOOLEAN NOT NULL DEFAULT FALSE,
      second_job_details TEXT,
      other_commitments  TEXT,
      status        TEXT NOT NULL DEFAULT 'new'
    );
  `);

  // Add email column if it doesn't exist (for existing databases)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE applicants ADD COLUMN IF NOT EXISTS email TEXT;
    EXCEPTION WHEN others THEN NULL;
    END $$;
  `);

  console.log('✓ Database table ready');
}

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer (ID image in memory → store as base64 in DB) ──────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are accepted'));
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = generateToken();
    activeTokens.add(token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Admin logout
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  activeTokens.delete(token);
  res.json({ success: true });
});

// Submit application
app.post('/api/apply', upload.single('id_image'), async (req, res) => {
  try {
    const {
      full_name, email, phone, date_of_birth, marital_status,
      nda_agreed, avail_weekends, avail_evenings, on_call,
      has_license, startup_ok, has_second_job, second_job_details,
      other_commitments,
    } = req.body;

    const toBool = (v) => v === 'true' || v === 'on' || v === '1' || v === true;

    let id_image_data = null;
    let id_image_type = null;
    if (req.file) {
      id_image_data = req.file.buffer.toString('base64');
      id_image_type = req.file.mimetype;
    }

    const result = await pool.query(
      `INSERT INTO applicants
        (full_name, email, phone, date_of_birth, marital_status,
         id_image_data, id_image_type, nda_agreed,
         avail_weekends, avail_evenings, on_call,
         has_license, startup_ok, has_second_job, second_job_details,
         other_commitments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id, submitted_at`,
      [
        full_name, email || null, phone, date_of_birth, marital_status,
        id_image_data, id_image_type, toBool(nda_agreed),
        toBool(avail_weekends), toBool(avail_evenings), toBool(on_call),
        toBool(has_license), toBool(startup_ok), toBool(has_second_job),
        second_job_details || null, other_commitments || null,
      ]
    );

    res.json({ success: true, id: result.rows[0].id, submitted_at: result.rows[0].submitted_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: list all applicants (no image data, just metadata)
app.get('/api/applicants', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, submitted_at, full_name, email, phone, date_of_birth, marital_status,
             nda_agreed, avail_weekends, avail_evenings, on_call,
             has_license, startup_ok, has_second_job, second_job_details,
             other_commitments, status,
             CASE WHEN id_image_data IS NOT NULL THEN true ELSE false END AS has_id_image
      FROM applicants ORDER BY submitted_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: get single applicant with image
app.get('/api/applicants/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM applicants WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update applicant status
app.patch('/api/applicants/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE applicants SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch((err) => {
  console.error('DB init failed:', err);
  process.exit(1);
});
