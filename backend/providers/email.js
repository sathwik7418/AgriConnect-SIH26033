const https = require('https');

class EmailProvider {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.senderEmail = process.env.BREVO_SENDER_EMAIL;
    this.senderName = process.env.BREVO_SENDER_NAME || 'AgriConnect';
  }

  isConfigured() {
    return !!this.apiKey && this.apiKey !== 'mock' && !!this.senderEmail;
  }

  sendVerificationOTP(email, otp) {
    const subject = 'Verify your AgriConnect account';
    const textContent = `AgriConnect: Verify your email address. Your verification code is: ${otp}. This code expires in 5 minutes. If you did not create an AgriConnect account, you can safely ignore this email.`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #16a34a; text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 10px; margin-bottom: 20px;">AgriConnect</h2>
        <h3 style="color: #333333;">Verify your email address</h3>
        <p style="color: #666666; font-size: 16px;">Thank you for registering with AgriConnect. Please use the following 6-digit verification code to complete your registration:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #1e293b; background-color: #f1f5f9; padding: 10px 25px; border-radius: 8px; border: 1px solid #cbd5e1;">${otp}</span>
        </div>
        <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">This code expires in <strong>5 minutes</strong>.</p>
        <p style="color: #666666; font-size: 14px; border-top: 1px solid #e2e8f0; padding-top: 15px;">If you did not create an AgriConnect account, you can safely ignore this email.</p>
      </div>
    `;

    if (!this.isConfigured()) {
      console.log(`[BREVO EMAIL MOCK] Verification OTP for ${email}: ${otp}`);
      return Promise.resolve({ success: true, mock: true });
    }

    const payload = JSON.stringify({
      sender: {
        name: this.senderName,
        email: this.senderEmail
      },
      to: [
        {
          email: email
        }
      ],
      subject: subject,
      htmlContent: htmlContent,
      textContent: textContent
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': this.apiKey,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, messageId: JSON.parse(responseBody).messageId });
          } else {
            reject(new Error(`Brevo API Error (${res.statusCode}): ${responseBody}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Network error calling Brevo API: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout calling Brevo API'));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = new EmailProvider();
