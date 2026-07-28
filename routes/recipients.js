const express = require('express');
const { getRecipients, addRecipient, removeRecipient, toggleRecipient } = require('../services/database');
const { sendTestEmail } = require('../services/email');
const { logInfo, logError } = require('../services/logger');

const router = express.Router();

// Get recipients
router.get('/', (req, res) => {
  res.json(getRecipients());
});

// Add recipient
router.post('/', (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  
  try {
    addRecipient(email, name);
    logInfo(`Added recipient: ${email}`);
    res.json({ success: true, message: 'Recipient added' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    throw e;
  }
});

// Remove recipient
router.delete('/:id', (req, res) => {
  const recipient = removeRecipient(req.params.id);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
  
  logInfo(`Removed recipient: ${recipient.email}`);
  res.json({ success: true, message: 'Recipient removed' });
});

// Toggle recipient active status
router.patch('/:id/toggle', (req, res) => {
  const recipient = toggleRecipient(req.params.id);
  if (!recipient) return res.status(404).json({ error: 'Recipient not found' });
  
  logInfo(`Toggled recipient ${recipient.email}: ${recipient.is_active ? 'active' : 'inactive'}`);
  res.json({ success: true, recipient });
});

// Send test email
router.post('/test', async (req, res) => {
  try {
    const recipients = await sendTestEmail();
    res.json({ success: true, message: 'Test email sent', recipients });
  } catch (e) {
    logError('Test email failed', e);
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
