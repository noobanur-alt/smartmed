const mongoose = require('mongoose');

const DoseLogSchema = new mongoose.Schema({
  scheduledTime : { type: String },
  takenAt       : { type: Date },
  status        : {
    type    : String,
    enum    : ['taken', 'missed', 'pending', 'skipped'],
    default : 'pending'
  },
  date          : { type: Date, default: Date.now }
});

const ScheduleSchema = new mongoose.Schema({
  userId : {
    type     : mongoose.Schema.Types.ObjectId,
    ref      : 'User',
    required : true
  },
  medicineId : {
    type : mongoose.Schema.Types.ObjectId,
    ref  : 'Medicine'
  },
  medicineName : { type: String, required: true },
  dosage       : { type: String },
  quantity     : { type: String, default: '1 tablet' },
  times        : [{ type: String }],
  foodInstruction : { type: String, default: 'After meal' },
  repeat       : {
    type    : String,
    enum    : ['daily', 'once', 'weekdays', 'weekends'],
    default : 'daily'
  },
  isActive  : { type: Boolean, default: true },
  doseLogs  : [DoseLogSchema],
  createdAt : { type: Date, default: Date.now }
});

module.exports = mongoose.model('Schedule', ScheduleSchema);