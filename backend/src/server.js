const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { seedDatabase } = require('./db/seed');

const authRoutes = require('./routes/auth');
const requisitionsRoutes = require('./routes/requisitions');
const candidatesRoutes = require('./routes/candidates');
const pipelineRoutes = require('./routes/pipeline');
const clientRoutes = require('./routes/client');
const dpdpRoutes = require('./routes/dpdp');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for frontend
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Company A AI Screening & Client Shortlist Portal'
  });
});

// Seed / Reset Database endpoint (for reviewers)
app.post('/api/admin/reset-sample-data', (req, res) => {
  try {
    seedDatabase();
    res.json({ success: true, message: 'Database reset and re-seeded with realistic sample data successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/requisitions', requisitionsRoutes);
app.use('/api/candidates', candidatesRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/dpdp', dpdpRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serve built frontend assets if dist exists
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Backend API Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
