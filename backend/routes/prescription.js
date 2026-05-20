const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/auth');
const Medicine = require('../models/Medicine');
const Schedule = require('../models/Schedule');

router.use(protect);

// ── Helper: call Gemini AI ──
async function analyzeWithGemini(ocrText) {
 const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const prompt = `You are a medical prescription parser for an Indian pharmacy system.
Extract all medicines from this prescription text.
Return ONLY a valid JSON array, no explanation, no markdown backticks.

Each medicine object must have exactly these keys:
- name (medicine name only)
- dosage (strength like "500mg", "5mg")
- frequency (one of: "Once daily", "Twice daily", "Three times daily", "Once weekly", "As needed")
- duration (like "5 days", "1 month", "Ongoing")
- instructions (one of: "After meal", "Before meal", "Empty stomach", "With water", "With milk", "No restriction")
- times (array of times like ["08:00"] or ["08:00","20:00"] or ["08:00","14:00","20:00"])

If no medicines found return empty array [].

Prescription text:
"""
${ocrText}
"""`;

  const response = await fetch(url, {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }]
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  const rawText = data.candidates[0].content.parts[0].text;
  const clean   = rawText.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ────────────────────────────────
// POST /api/prescription/analyze
// Send OCR text to Gemini AI
// ────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { ocrText } = req.body;

    if (!ocrText || ocrText.trim().length < 10) {
      return res.status(400).json({
        success : false,
        message : 'No prescription text provided'
      });
    }

    const medicines = await analyzeWithGemini(ocrText);

    res.json({
      success   : true,
      count     : medicines.length,
      medicines
    });

  } catch (err) {
    console.error('Prescription analyze error:', err.message);
    res.status(500).json({
      success : false,
      message : 'Failed to analyze prescription: ' + err.message
    });
  }
});

// ────────────────────────────────
// POST /api/prescription/save
// Save extracted medicines to DB
// ────────────────────────────────
router.post('/save', async (req, res) => {
  try {
    const { medicines } = req.body;

    if (!medicines || medicines.length === 0) {
      return res.status(400).json({
        success : false,
        message : 'No medicines to save'
      });
    }

    const savedMedicines = [];
    const savedSchedules = [];

    for (const med of medicines) {
      const medicine = await Medicine.create({
        userId          : req.user._id,
        name            : med.name,
        dosage          : med.dosage          || '',
        quantity        : '1 tablet',
        frequency       : med.frequency       || 'Once daily',
        times           : med.times           || ['08:00'],
        duration        : med.duration        || 'Ongoing',
        foodInstruction : med.instructions    || 'After meal',
        notes           : 'Added via prescription scan'
      });

      savedMedicines.push(medicine);

      const schedule = await Schedule.create({
        userId          : req.user._id,
        medicineId      : medicine._id,
        medicineName    : med.name,
        dosage          : med.dosage,
        quantity        : '1 tablet',
        times           : med.times           || ['08:00'],
        foodInstruction : med.instructions    || 'After meal',
        repeat          : 'daily'
      });

      savedSchedules.push(schedule);
    }

    res.status(201).json({
      success        : true,
      message        : `${savedMedicines.length} medicines saved and scheduled!`,
      savedMedicines,
      savedSchedules
    });

  } catch (err) {
    console.error('Prescription save error:', err.message);
    res.status(500).json({
      success : false,
      message : err.message
    });
  }
});

module.exports = router;