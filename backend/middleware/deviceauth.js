// Device authentication for ESP32
const deviceAuth = (req, res, next) => {
  const deviceKey = req.headers['x-device-key'];
  
  if (!deviceKey || deviceKey !== process.env.ESP32_SECRET_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized device'
    });
  }
  next();
};

module.exports = deviceAuth;