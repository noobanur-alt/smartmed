const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const cron     = require('node-cron');
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

// ────────────────────────────────────────
// Cron job — runs every minute
// Checks if any dose time passed and
// marks it as missed if not taken
// ────────────────────────────────────────
cron.schedule('* * * * *', async () => {
  try {
    const Schedule = require('./models/Schedule');
    const now      = new Date();

    // Current time as HH:MM string
    const nowTime  = now.getHours().toString().padStart(2, '0') + ':' +
                     now.getMinutes().toString().padStart(2, '0');
    const todayStr = now.toDateString();

    const schedules = await Schedule.find({ isActive: true });

    for (const schedule of schedules) {
      for (const time of schedule.times) {

        // Only process times that have passed
        if (time >= nowTime) continue;

        // Check if already logged for today
        const alreadyLogged = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        // If not logged — mark as missed
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

// ── Also sync schedule to ESP32 every hour ──
cron.schedule('0 * * * *', async () => {
  try {
    console.log('Hourly ESP32 sync running...');
    // This will auto-sync when ESP32 is connected
    // The device route handles the actual sync logic
  } catch (err) {
    console.error('Hourly sync error:', err.message);
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