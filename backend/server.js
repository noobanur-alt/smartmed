const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const cron     = require('node-cron');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'SmartMed Backend is running!', status: 'online' });
});

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/medicines', require('./routes/medicines'));
app.use('/api/schedule',  require('./routes/schedule'));
app.use('/api/device',    require('./routes/device'));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('MongoDB error:', err));

// ── Cron job: runs every minute ──
// Checks if any dose time has passed and marks it missed
cron.schedule('* * * * *', async () => {
  try {
    const Schedule = require('./models/Schedule');
    const now      = new Date();
    const nowTime  = now.getHours().toString().padStart(2,'0') + ':' +
                     now.getMinutes().toString().padStart(2,'0');
    const todayStr = now.toDateString();

    const schedules = await Schedule.find({ isActive: true });

    for (const schedule of schedules) {
      for (const time of schedule.times) {
        // Only check times that have passed
        if (time > nowTime) continue;

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
          console.log('Missed dose marked:', schedule.medicineName, time);
        }
      }
    }
  } catch (err) {
    console.error('Cron error:', err.message);
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('SmartMed server running on port ' + PORT);
});