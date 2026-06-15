const express    = require('express');
const router     = express.Router();
const protect    = require('../middleware/auth');
const deviceAuth = require('../middleware/deviceauth');
const Device     = require('../models/Device');

// ── Helper: send command to ESP32 ──
async function sendToESP32(command, data = {}) {
  const ESP32_IP = process.env.ESP32_IP;
  const url      = `http://${ESP32_IP}/${command}`;
  try {
    const response = await fetch(url, {
      method  : 'POST',
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify(data),
      signal  : AbortSignal.timeout(5000)
    });
    const result = await response.json();
    return { success: true, result };
  } catch (err) {
    console.log('ESP32 not reachable — simulating:', command);
    return {
      success   : true,
      simulated : true,
      message   : `Command "${command}" simulated (ESP32 offline)`
    };
  }
}

// ════════════════════════════════════════════════════════════
//  FRONTEND ROUTES (JWT protected)
// ════════════════════════════════════════════════════════════

// GET /api/device/status
router.get('/status', protect, async (req, res) => {
  try {
    const ESP32_IP = process.env.ESP32_IP;
    let online     = false;
    let deviceData = {};
    try {
      const response = await fetch(`http://${ESP32_IP}/status`, {
        signal: AbortSignal.timeout(3000)
      });
      deviceData = await response.json();
      online     = true;
    } catch {
      deviceData = {
        lidStatus : 'closed',
        battery   : 78,
        wifi      : -62,
        uptime    : 8040,
        buzzer    : true,
        faceAuth  : true,
        lastSync  : new Date().toISOString()
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

// POST /api/device/open-lid
router.post('/open-lid', protect, async (req, res) => {
  try {
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'open_lid' } },
      { upsert: true }
    );
    res.json({ success: true, message: 'Lid open command sent!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/close-lid
router.post('/close-lid', protect, async (req, res) => {
  try {
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'close_lid' } },
      { upsert: true }
    );
    res.json({ success: true, message: 'Lid close command sent!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/buzz
router.post('/buzz', protect, async (req, res) => {
  try {
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'buzz' } },
      { upsert: true }
    );
    res.json({ success: true, message: 'Buzzer command sent!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/sync
router.post('/sync', protect, async (req, res) => {
  try {
    const Schedule = require('../models/Schedule');
    const now      = new Date();
    const dayName  = now.toLocaleDateString('en-US',
      { weekday: 'long' }).toLowerCase();
    const schedules = await Schedule.find({
      userId: req.user._id, isActive: true
    });
    const todayMeds = [];
    schedules.forEach(s => {
      const applies =
        s.repeat === 'daily' || s.repeat === 'once' ||
        (s.repeat === 'weekdays' && !['saturday','sunday'].includes(dayName)) ||
        (s.repeat === 'weekends' &&  ['saturday','sunday'].includes(dayName));
      if (applies) {
        s.times.forEach(time => {
          todayMeds.push({ name: s.medicineName, time, dose: s.quantity });
        });
      }
    });
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'sync' } },
      { upsert: true }
    );
    res.json({
      success   : true,
      message   : `Schedule synced! ${todayMeds.length} doses sent to box.`,
      medicines : todayMeds
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/pill-taken
router.post('/pill-taken', protect, async (req, res) => {
  try {
    const { medicineName, time } = req.body;
    const Schedule = require('../models/Schedule');
    const schedule = await Schedule.findOne({ medicineName, isActive: true });
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
          scheduledTime: time,
          takenAt      : new Date(),
          status       : 'taken',
          date         : new Date()
        });
      }
      await schedule.save();
    }
    res.json({ success: true, message: 'Dose recorded!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/settings
router.post('/settings', protect, async (req, res) => {
  try {
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'settings', data: req.body } },
      { upsert: true }
    );
    res.json({ success: true, message: 'Settings saved and sent to box!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/device/restart
router.post('/restart', protect, async (req, res) => {
  try {
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: { command: 'restart' } },
      { upsert: true }
    );
    res.json({ success: true, message: 'Restart command sent to box!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  ESP32 ROUTES (device secret key — NO JWT)
// ════════════════════════════════════════════════════════════

// GET /api/device/command — ESP32 polls every 10 seconds
router.get('/command', deviceAuth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: 'SM-BOX-001' });
    if (!device || !device.pendingCommand) {
      return res.json({ command: 'none' });
    }
    const cmd = device.pendingCommand;
    await Device.updateOne(
      { deviceId: 'SM-BOX-001' },
      { pendingCommand: null }
    );
    res.json({ command: cmd.command, pillCount: cmd.pillCount });
  } catch(err) {
    res.json({ command: 'none' });
  }
});

// GET /api/device/schedule — ESP32 fetches today's schedule
router.get('/schedule', deviceAuth, async (req, res) => {
  try {
    const Schedule = require('../models/Schedule');
    const todayStr = new Date().toDateString();
    const schedules = await Schedule.find({ isActive: true });
    const result    = [];
    schedules.forEach(s => {
      s.times.forEach(time => {
        const alreadyTaken = s.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time &&
          log.status === 'taken'
        );
        result.push({
          medicineName   : s.medicineName,
          dosage         : s.dosage,
          quantity       : s.quantity,
          time,
          status         : alreadyTaken ? 'taken' : 'pending',
          foodInstruction: s.foodInstruction
        });
      });
    });
    res.json({ success: true, schedule: result });
  } catch(err) {
    res.json({ success: false, schedule: [] });
  }
});

// POST /api/device/status-update — ESP32 sends status
router.post('/status-update', deviceAuth, async (req, res) => {
  try {
    const { status, lidOpen, temperature,
            fanRunning, pillCount, totalPills,
            currentTime, ip } = req.body;
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      {
        status, lidOpen, temperature,
        fanRunning, pillCount, totalPills,
        currentTime, ip, lastSeen: new Date()
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false });
  }
});

// POST /api/device/event — ESP32 sends events
router.post('/event', deviceAuth, async (req, res) => {
  try {
    const { event, data, pillCount } = req.body;
    console.log(`ESP32 Event: ${event} — ${data}`);
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      {
        $push: {
          activityLog: { event, data, pillCount, time: new Date() }
        }
      },
      { upsert: true }
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false });
  }
});

// GET /api/device/pill-count — ESP32 loads on startup
router.get('/pill-count', deviceAuth, async (req, res) => {
  try {
    const device = await Device.findOne({ deviceId: 'SM-BOX-001' });
    res.json({
      success    : true,
      pillCount  : device?.pillCount  || 30,
      totalPills : device?.totalPills || 30
    });
  } catch(err) {
    res.json({ success: false, pillCount: 30, totalPills: 30 });
  }
});

// POST /api/device/pill-count — ESP32 updates count
router.post('/pill-count', deviceAuth, async (req, res) => {
  try {
    const { pillCount, totalPills } = req.body;
    await Device.findOneAndUpdate(
      { deviceId: 'SM-BOX-001' },
      { pillCount, totalPills },
      { upsert: true }
    );
    res.json({ success: true });
  } catch(err) {
    res.json({ success: false });
  }
});

module.exports = router;