const express = require('express');
const router = express.Router();
const db = require('../db/database');

// List available demo users for instant reviewer switching
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, email, name, role, company_id, company_name FROM users').all();
  res.json({ users });
});

// Get current logged-in user profile
router.get('/me', (req, res) => {
  const userId = req.headers['x-user-id'] || 'usr_recruiter_priya';
  const user = db.prepare('SELECT id, email, name, role, company_id, company_name FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
});

// Login or switch role
router.post('/switch-role', (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT id, email, name, role, company_id, company_name FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Invalid user ID' });
  }
  res.json({ success: true, user });
});

module.exports = router;
