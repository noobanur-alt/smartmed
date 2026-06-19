const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const cron     = require('node-cron');
const Schedule = require('./models/Schedule');
const Device   = require('./models/Device');
require('dotenv').config();

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json());

// ── Test route ──
app.get('/', (req, res) => {
  res.json({
    message : 'SmartMed Backend is running!',
    version : '1.0.0',
    status  : 'online',
    routes  : [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET  /api/auth/me',
      'GET  /api/medicines',
      'POST /api/medicines',
      'PUT  /api/medicines/:id',
      'DEL  /api/medicines/:id',
      'GET  /api/schedule',
      'GET  /api/schedule/today',
      'POST /api/schedule',
      'POST /api/schedule/:id/taken',
      'GET  /api/schedule/history',
      'GET  /api/device/status',
      'POST /api/device/open-lid',
      'POST /api/device/close-lid',
      'POST /api/device/buzz',
      'POST /api/device/sync',
      'POST /api/device/pill-taken',
      'POST /api/prescription/analyze',
      'POST /api/prescription/save',
    ]
  });
});

// ── Routes ──
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/medicines',    require('./routes/medicines'));
app.use('/api/schedule',     require('./routes/schedule'));
app.use('/api/device',       require('./routes/device'));
app.use('/api/prescription', require('./routes/prescription'));

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({
    error   : 'Route not found',
    method  : req.method,
    path    : req.path
  });
});

// ── MongoDB connection ──
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('MongoDB error:', err));

// ════════════════════════════════════════════════════════════
//  SINGLE CRON JOB — runs every minute
//  Pass 1: exact-time match → triggers buzzer on ESP32
//  Pass 2: time already passed + not logged → marks missed
//  (Previously there were TWO separate cron.schedule blocks
//   racing each other on the same documents — that has been
//   merged into this one block to remove the race condition.)
// ════════════════════════════════════════════════════════════
cron.schedule('* * * * *', async () => {
  const now     = new Date();
  const nowTime = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');
  console.log('Cron tick — server time:', nowTime);

  try {
    const todayStr  = now.toDateString();
    const schedules = await Schedule.find({ isActive: true });

    // ── Pass 1: exact-time match → trigger buzzer ──
    for (const schedule of schedules) {
      for (const time of schedule.times) {
        if (time !== nowTime) continue;

        const alreadyLogged = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        if (!alreadyLogged) {
          await Device.findOneAndUpdate(
            {},
            {
              pendingCommand: 'buzz',
              $push: {
                activityLog: {
                  action    : `Reminder: ${schedule.medicineName} at ${time}`,
                  timestamp : now
                }
              }
            },
            { sort: { updatedAt: -1 }, new: true }
          );
          console.log(`🔔 Buzzer triggered: ${schedule.medicineName} at ${time}`);
        }
      }
    }

    // ── Pass 2: time already passed and never logged → mark missed ──
    for (const schedule of schedules) {
      for (const time of schedule.times) {
        if (time >= nowTime) continue; // only strictly-past times here

        const alreadyLogged = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        if (!alreadyLogged) {
          schedule.doseLogs.push({
            scheduledTime : time,
            status        : 'missed',
            date          : now
          });
          await schedule.save();
          console.log(`Missed: ${schedule.medicineName} at ${time}`);
        }
      }
    }

  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

// ── Start server ──
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('');
  console.log('================================');
  console.log(' SmartMed Server running!');
  console.log(' Port    : ' + PORT);
  console.log(' Backend : http://localhost:' + PORT);
  console.log('================================');
  console.log('');
});