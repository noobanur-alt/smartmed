const router = require('express').Router();

router.get('/test', (req, res) => {
  res.json({ message: 'Medicines route working!' });
});

module.exports = router;