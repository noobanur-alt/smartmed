const mongoose = require('mongoose');
const deviceSchema = new mongoose.Schema({
  deviceId      : { type: String, default: 'SM-BOX-001' },
  status        : { type: String, default: 'offline' },
  lidOpen       : { type: Boolean, default: false },
  temperature   : { type: Number, default: 0 },
  fanRunning    : { type: Boolean, default: false },
  pillCount     : { type: Number, default: 30 },
  totalPills    : { type: Number, default: 30 },
  currentTime   : { type: String },
  ip            : { type: String },
  lastSeen      : { type: Date },
  pendingCommand: { type: Object, default: null },
  activityLog   : [{
    event: String, data: String,
    pillCount: Number,
    time: { type: Date, default: Date.now }
  }]
}, { timestamps: true });
module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);