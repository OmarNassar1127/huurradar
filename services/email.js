const nodemailer = require('nodemailer');
const { logInfo, logError } = require('./logger');
const { getRecipientEmails } = require('./database');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendNotification(listing) {
  const recipients = getRecipientEmails();
  if (recipients.length === 0) {
    logInfo("No recipients configured, skipping notification");
    return;
  }

  const subject = `🏠 New Match: ${listing.street || 'New Listing'} - €${listing.price}`;

  // AI analysis section (always shown)
  const isError = listing.aiAnalysis?.startsWith('⚠️');
  const aiSection = `
      <div style="background: ${isError ? '#fef3e8' : '#e8f4fd'}; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${isError ? '#e67e22' : '#3498db'};">
        <h4 style="margin: 0 0 10px 0; color: ${isError ? '#d35400' : '#2980b9'};">🤖 AI Analysis - Income Requirements</h4>
        <p style="margin: 0; color: #34495e; white-space: pre-line;">${listing.aiAnalysis || 'No analysis available'}</p>
      </div>
  `;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="color: #2c3e50; margin: 0;">🏠 New House Match!</h2>
        <a href="${listing.listingUrl}" style="display: inline-block; background: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 14px;">View Listing →</a>
      </div>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 10px 0;">${listing.street || 'Address not available'}</h3>
        <p style="color: #666; margin: 5px 0;">${listing.city || ''} ${listing.zipcode || ''}</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
        <table style="width: 100%;">
          <tr>
            <td><strong>Price:</strong></td>
            <td>€${listing.price || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>Size:</strong></td>
            <td>${listing.livingArea || 'N/A'} m²</td>
          </tr>
          <tr>
            <td><strong>Rooms:</strong></td>
            <td>${listing.totalRooms || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>Platform:</strong></td>
            <td>${listing.platform || 'Unknown'}</td>
          </tr>
        </table>
      </div>
      ${aiSection}
      ${listing.imageUrl ? `<img src="${listing.imageUrl}" style="width: 100%; border-radius: 8px; margin-bottom: 20px;">` : ''}
      <p style="color: #999; font-size: 12px; margin-top: 30px;">Sent by HuurRadar 🏠</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      html,
    });
    logInfo(`Notification sent for: ${listing.street}`);
  } catch (error) {
    logError("Failed to send notification", error);
  }
}

async function sendTestEmail() {
  const recipients = getRecipientEmails();
  if (recipients.length === 0) {
    throw new Error('No recipients configured');
  }
  
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: recipients.join(', '),
    subject: "🧪 HuurRadar Test Email",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>✅ HuurRadar Email Test</h2>
        <p>This is a test email from your HuurRadar instance.</p>
        <p>If you received this, email notifications are working correctly!</p>
        <p><small>Sent at: ${new Date().toISOString()}</small></p>
      </div>
    `,
  });
  
  logInfo('Test email sent successfully');
  return recipients;
}

module.exports = {
  sendNotification,
  sendTestEmail
};
