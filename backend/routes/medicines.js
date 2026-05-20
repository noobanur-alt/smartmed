const express   = require('express');
const router    = express.Router();
const Medicine  = require('../models/Medicine');
const protect   = require('../middleware/auth');

// ── All routes below require login ──
router.use(protect);

// ────────────────────────────────
// GET /api/medicines
// Get all medicines for logged in user
// ────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const medicines = await Medicine.find({
      userId   : req.user._id,
      isActive : true
    }).sort({ createdAt: -1 });

    res.json({
      success  : true,
      count    : medicines.length,
      medicines
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// POST /api/medicines
// Add a new medicine
// ────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      name, dosage, quantity, frequency,
      times, duration, foodInstruction, notes
    } = req.body;

    if (!name || !dosage) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name and dosage are required'
      });
    }

    const medicine = await Medicine.create({
      userId : req.user._id,
      name,
      dosage,
      quantity,
      frequency,
      times       : times || [],
      duration,
      foodInstruction,
      notes
    });

    res.status(201).json({
      success  : true,
      message  : 'Medicine added successfully!',
      medicine
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// PUT /api/medicines/:id
// Update a medicine
// ────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findOne({
      _id    : req.params.id,
      userId : req.user._id
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    const updated = await Medicine.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success  : true,
      message  : 'Medicine updated!',
      medicine : updated
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ────────────────────────────────
// DELETE /api/medicines/:id
// Delete a medicine
// ────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const medicine = await Medicine.findOne({
      _id    : req.params.id,
      userId : req.user._id
    });

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found'
      });
    }

    // Soft delete — just mark inactive
    await Medicine.findByIdAndUpdate(req.params.id, { isActive: false });

    res.json({
      success : true,
      message : 'Medicine removed!'
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;