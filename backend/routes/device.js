const router = require('express').Router();

router.get('/test', (req, res) => {
  res.json({ message: 'Device route working!' });
});

module.exports = router;