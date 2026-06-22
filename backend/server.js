const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const cron     = require('node-cron');
const Schedule = require('./models/Schedule');
const Device   = require('./models/Device');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message : 'SmartMed Backend is running!',
    version : '1.0.0',
    status  : 'online'
  });
});

app.use('/api/auth',         require('./routes/auth'));
app.use('/api/medicines',    require('./routes/medicines'));
app.use('/api/schedule',     require('./routes/schedule'));
app.use('/api/device',       require('./routes/device'));
app.use('/api/prescription', require('./routes/prescription'));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', method: req.method, path: req.path });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('MongoDB error:', err));

// ── Grace period: dose only marked missed after this many minutes ──
const GRACE_MINUTES = 15;

cron.schedule('* * * * *', async () => {
  const now     = new Date();
  const nowTime = now.getHours().toString().padStart(2, '0') + ':' +
                  now.getMinutes().toString().padStart(2, '0');
  console.log('Cron tick — server time:', nowTime);

  try {
    const todayStr  = now.toDateString();
    const schedules = await Schedule.find({ isActive: true });

    // ── Pass 1: exact time → buzz + write pending log ──
    for (const schedule of schedules) {
      for (const time of schedule.times) {
        if (time !== nowTime) continue;

        const alreadyLogged = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        if (!alreadyLogged) {
          // Send buzz to ESP32
          await Device.findOneAndUpdate(
            {},
            {
              pendingCommand : 'buzz',
              $push : {
                activityLog : {
                  action    : `Reminder: ${schedule.medicineName} at ${time}`,
                  timestamp : now
                }
              }
            },
            { sort: { updatedAt: -1 }, upsert: true }
          );

          // Write pending log so Pass 2 knows this was buzzed
          schedule.doseLogs.push({
            scheduledTime : time,
            status        : 'pending',
            date          : now
          });
          await schedule.save();
          console.log(`🔔 Buzzer triggered: ${schedule.medicineName} at ${time}`);
        }
      }
    }

    // ── Pass 2: grace period expired + still pending → mark missed ──
    for (const schedule of schedules) {
      for (const time of schedule.times) {
        const [h, m]      = time.split(':').map(Number);
        const slotMinutes = h * 60 + m;
        const nowMinutes  = now.getHours() * 60 + now.getMinutes();
        const minutesPast = nowMinutes - slotMinutes;

        // Only process slots past grace period
        if (minutesPast <= GRACE_MINUTES) continue;

        const existingLog = schedule.doseLogs.find(log =>
          new Date(log.date).toDateString() === todayStr &&
          log.scheduledTime === time
        );

        // Already taken — nothing to do
        if (existingLog && existingLog.status === 'taken') continue;

        // Still pending after grace period → mark missed
        if (existingLog && existingLog.status === 'pending') {
          existingLog.status = 'missed';
          await schedule.save();
          console.log(`❌ Missed: ${schedule.medicineName} at ${time}`);
          continue;
        }

        // No log at all (server was down during buzz minute)
        if (!existingLog) {
          schedule.doseLogs.push({
            scheduledTime : time,
            status        : 'missed',
            date          : now
          });
          await schedule.save();
          console.log(`❌ Missed (no log): ${schedule.medicineName} at ${time}`);
        }
      }
    }

  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

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