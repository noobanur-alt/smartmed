const express  = require('express');
const router   = express.Router();
const Schedule = require('../models/Schedule');
const protect  = require('../middleware/auth');

router.use(protect);

// GET /api/schedule
router.get('/', async (req, res) => {
  try {
    const schedules = await Schedule.find({
      userId   : req.user._id,
      isActive : true
    }).sort({ createdAt: -1 });
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/today
router.get('/today', async (req, res) => {
  try {
    const schedules = await Schedule.find({
      userId   : req.user._id,
      isActive : true
    });

    const today    = new Date();
    const dayName  = today.toLocaleDateString('en-US',
      { weekday: 'long' }).toLowerCase();
    const todayStr = today.toDateString();

    const todaySchedule = [];

    schedules.forEach(schedule => {
      const applies =
        schedule.repeat === 'daily' ||
        schedule.repeat === 'once'  ||
        (schedule.repeat === 'weekdays' &&
          !['saturday','sunday'].includes(dayName)) ||
        (schedule.repeat === 'weekends' &&
          ['saturday','sunday'].includes(dayName));

      if (!applies) return;

      schedule.times.forEach(time => {
        const todayLog = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        todaySchedule.push({
          scheduleId      : schedule._id,
          medicineName    : schedule.medicineName,
          dosage          : schedule.dosage,
          quantity        : schedule.quantity,
          time,
          foodInstruction : schedule.foodInstruction,
          status          : todayLog ? todayLog.status : 'pending',
          logId           : todayLog ? todayLog._id : null
        });
      });
    });

    todaySchedule.sort((a, b) => a.time.localeCompare(b.time));

    res.json({
      success  : true,
      date     : todayStr,
      total    : todaySchedule.length,
      taken    : todaySchedule.filter(d => d.status === 'taken').length,
      pending  : todaySchedule.filter(d => d.status === 'pending').length,
      missed   : todaySchedule.filter(d => d.status === 'missed').length,
      schedule : todaySchedule
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/schedule/history
router.get('/history', async (req, res) => {
  try {
    const schedules = await Schedule.find({ userId: req.user._id });
    const logs   = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    schedules.forEach(schedule => {
      schedule.doseLogs.forEach(log => {
        if (new Date(log.date) >= cutoff) {
          logs.push({
            medicineName  : schedule.medicineName,
            dosage        : schedule.dosage,
            scheduledTime : log.scheduledTime,
            takenAt       : log.takenAt,
            status        : log.status,
            date          : log.date
          });
        }
      });
    });

    logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ success: true, total: logs.length, logs });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/schedule
router.post('/', async (req, res) => {
  try {
    const {
      medicineId, medicineName, dosage,
      quantity, times, foodInstruction, repeat
    } = req.body;

    if (!medicineName || !times || times.length === 0) {
      return res.status(400).json({
        success : false,
        message : 'Medicine name and at least one time are required'
      });
    }

    const schedule = await Schedule.create({
      userId : req.user._id,
      medicineId,
      medicineName,
      dosage,
      quantity,
      times,
      foodInstruction,
      repeat : repeat || 'daily'
    });

    res.status(201).json({
      success  : true,
      message  : 'Schedule created!',
      schedule
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/schedule/:id/taken
router.post('/:id/taken', async (req, res) => {
  try {
    const { time } = req.body;

    const schedule = await Schedule.findOne({
      _id    : req.params.id,
      userId : req.user._id
    });

    if (!schedule) {
      return res.status(404).json({
        success : false,
        message : 'Schedule not found'
      });
    }

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
    res.json({ success: true, message: 'Dose marked as taken!' });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/schedule/all  ← MUST be before /:id
router.delete('/all', async (req, res) => {
  try {
    await Schedule.deleteMany({ userId: req.user._id });
    res.json({ success: true, message: 'All schedules cleared!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/schedule/:id
router.delete('/:id', async (req, res) => {
  try {
    await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isActive: false }
    );
    res.json({ success: true, message: 'Schedule removed!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;