const express = require('express');
const router  = express.Router();
const protect = require('../middleware/auth');

router.use(protect);

// ── Helper: send command to ESP32 ──
async function sendToESP32(command, data = {}) {
  const ESP32_IP = process.env.ESP32_IP;
  const url      = `http://${ESP32_IP}/${command}`;

  try {
    const response = await fetch(url, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(data),
      signal  : AbortSignal.timeout(5000) // 5 second timeout
    });

    const result = await response.json();
    return { success: true, result };

  } catch (err) {
    // ESP32 not connected — return simulation for development
    console.log('ESP32 not reachable — simulating response for:', command);
    return {
      success   : true,
      simulated : true,
      message   : `Command "${command}" simulated (ESP32 offline)`
    };
  }
}

// ────────────────────────────────
// GET /api/device/status
// Get current device status
// ────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    const ESP32_IP = process.env.ESP32_IP;

    // Try to ping ESP32
    let online    = false;
    let deviceData = {};

    try {
      const response = await fetch(`http://${ESP32_IP}/status`, {
        signal: AbortSignal.timeout(3000)
      });
      deviceData = await response.json();
      online     = true;
    } catch {
      // ESP32 offline — return mock data for development
      deviceData = {
        lidStatus  : 'closed',
        battery    : 78,
        wifi       : -62,
        uptime     : 8040,
        buzzer     : true,
        faceAuth   : true,
        lastSync   : new Date().toISOString()
      };
    }

    res.json({
      success  : true,
      online,
      deviceId : req.user.deviceId || 'SM-BOX-001',
      ip       : ESP32_IP,
      ...deviceData
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/open-lid
// Open the medicine box lid
// ────────────────────────────────
router.post('/open-lid', async (req, res) => {
  try {
    const result = await sendToESP32('open-lid', {
      userId : req.user._id,
      name   : req.user.name
    });

    res.json({
      success : true,
      message : 'Lid open command sent!',
      ...result
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/close-lid
// Close the medicine box lid
// ────────────────────────────────
router.post('/close-lid', async (req, res) => {
  try {
    const result = await sendToESP32('close-lid');

    res.json({
      success : true,
      message : 'Lid close command sent!',
      ...result
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/buzz
// Trigger the buzzer alarm
// ────────────────────────────────
router.post('/buzz', async (req, res) => {
  try {
    const { duration = 3 } = req.body;

    const result = await sendToESP32('buzz', { duration });

    res.json({
      success : true,
      message : `Buzzer triggered for ${duration} seconds!`,
      ...result
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/sync
// Push today's schedule to ESP32
// ────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const Schedule = require('../models/Schedule');

    // Get today's schedule for this user
    const schedules = await Schedule.find({
      userId   : req.user._id,
      isActive : true
    });

    const now      = new Date();
    const dayName  = now.toLocaleDateString('en-US',
      { weekday: 'long' }).toLowerCase();

    const todayMeds = [];
    schedules.forEach(s => {
      const applies =
        s.repeat === 'daily' ||
        s.repeat === 'once'  ||
        (s.repeat === 'weekdays' &&
          !['saturday','sunday'].includes(dayName)) ||
        (s.repeat === 'weekends' &&
          ['saturday','sunday'].includes(dayName));

      if (applies) {
        s.times.forEach(time => {
          todayMeds.push({
            name : s.medicineName,
            time,
            dose : s.quantity
          });
        });
      }
    });

    // Send schedule to ESP32
    const result = await sendToESP32('sync-schedule', {
      date     : now.toDateString(),
      medicines: todayMeds
    });

    res.json({
      success   : true,
      message   : `Schedule synced! ${todayMeds.length} doses sent to box.`,
      medicines : todayMeds,
      ...result
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/pill-taken
// Called BY ESP32 when sensor detects pill taken
// ESP32 hits this endpoint automatically
// ────────────────────────────────
router.post('/pill-taken', async (req, res) => {
  try {
    const { medicineName, time, deviceId } = req.body;

    console.log('Pill taken signal from ESP32:',
      medicineName, 'at', time);

    // Find and update the schedule
    const Schedule = require('../models/Schedule');

    const schedule = await Schedule.findOne({
      medicineName,
      isActive : true
    });

    if (schedule) {
      const todayStr = new Date().toDateString();
      const existing = schedule.doseLogs.find(log =>
        new Date(log.date).toDateString() === todayStr &&
        log.scheduledTime === time
      );

      if (existing) {
        existing.status  = 'taken';
        existing.takenAt = new Date();
      } else {
        schedule.doseLogs.push({
          scheduledTime : time,
          takenAt       : new Date(),
          status        : 'taken',
          date          : new Date()
        });
      }
      await schedule.save();
    }

    res.json({ success: true, message: 'Dose recorded!' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/settings
// Update box settings
// ────────────────────────────────
router.post('/settings', async (req, res) => {
  try {
    const { buzzer, faceAuth, autoClose, lcdDisplay,
            buzzerVolume, reminderRepeat } = req.body;

    const result = await sendToESP32('settings', {
      buzzer, faceAuth, autoClose,
      lcdDisplay, buzzerVolume, reminderRepeat
    });

    res.json({
      success : true,
      message : 'Settings saved and sent to box!',
      ...result
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/device/restart
// Restart the ESP32
// ────────────────────────────────
router.post('/restart', async (req, res) => {
  try {
    const result = await sendToESP32('restart');
    res.json({
      success : true,
      message : 'Restart command sent to box!',
      ...result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;