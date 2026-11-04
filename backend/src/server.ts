import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import fs from 'node:fs';

import { ensureSeeded, seedDatabase } from './db/seed';
import { authMiddleware, requireRole } from './middleware/auth';
import { getRequestToken, destroySession, clearSessionCookie } from './services/auth_service';

import authRoutes from './routes/auth';
import requisitionsRoutes from './routes/requisitions';
import candidatesRoutes from './routes/candidates';
import pipelineRoutes from './routes/pipeline';
import clientRoutes from './routes/client';
import dpdpRoutes from './routes/dpdp';
import analyticsRoutes from './routes/analytics';

ensureSeeded();

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

const configuredOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  // Same-origin requests have no Origin header. In development, allow other
  // local origins. In production, only allow explicitly configured origins.
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && configuredOrigins.length === 0) {
      return callback(null, true);
    }
    callback(null, configuredOrigins.includes(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Shortlist — Company A screening workspace'
  });
});

// Reviewers can restore the demo dataset from the delivery-head account.
app.post('/api/admin/reset-sample-data', authMiddleware, requireRole(['delivery_head']), (req, res) => {
  try {
    destroySession(getRequestToken(req));
    seedDatabase();
    clearSessionCookie(res);
    res.json({
      success: true,
      message: 'Demo data restored. Sign in again to continue.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/requisitions', requisitionsRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/dpdp', dpdpRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found.' });
});

const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Shortlist API running at http://localhost:${PORT}`);
  });
}

export default app;
