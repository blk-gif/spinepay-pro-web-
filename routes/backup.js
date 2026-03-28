'use strict';

const express = require('express');
const router  = express.Router();
const { runBackup, getBackupHistory, getBackupStats } = require('../services/backup');

// GET /api/backup/status
router.get('/status', async (req, res) => {
  try {
    const stats = await getBackupStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/history
router.get('/history', async (req, res) => {
  try {
    const history = await getBackupHistory(30);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/run
router.post('/run', async (req, res) => {
  try {
    console.log('[Backup] Manual backup triggered by:', req.session.staff.username);
    const result = await runBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
