const router = require('express').Router();

router.get('/test', (req, res) => {
  res.json({ message: 'Schedule route working!' });
});

module.exports = router;