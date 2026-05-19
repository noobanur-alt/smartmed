const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name      : { type: String, required: true, trim: true },
  email     : { type: String, required: true, unique: true, lowercase: true },
  password  : { type: String, required: true },
  patientId : { type: String },
  age       : { type: Number },
  phone     : { type: String },
  deviceId  : { type: String, default: 'SM-BOX-001' },
  createdAt : { type: Date, default: Date.now }
});

UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);