const mongoose = require('mongoose');

const MedicineSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true
  },
  quantity: {
    type: String,
    default: '1 tablet'
  },
  frequency: {
    type: String,
    enum: ['Once daily', 'Twice daily', 'Three times daily', 'Once weekly', 'As needed'],
    default: 'Once daily'
  },
  times: [{
    type: String
  }],
  duration: {
    type: String,
    default: 'Ongoing'
  },
  foodInstruction: {
    type: String,
    default: 'After meal'
  },
  notes: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Medicine', MedicineSchema);