const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// ==========================================
// CONFIGURATION
// ==========================================
const RESEND_API_KEY = process.env.RESEND_API_KEY || "re_hCDRpzaV_5ugSAwtg6yB6qJ9xk6Qbaw87";
// IMPORTANT: Use notifications@ for transactional emails (better deliverability)
// You MUST verify vaultxwallet.website in Resend dashboard and add DNS records
const FROM_EMAIL = "VaultX <notifications@vaultxwallet.website>";
const REPLY_TO_EMAIL = "VaultX Support <support@vaultxwallet.website>";
const WEBSITE_URL = "https://vaultxwallet.website";
const ALLOWED_ORIGINS = [
  "https://vaultxwallet.website",
  "https://vaultx-wallet-crypto.web.app",
  "https://vaultx-wallet-crypto.firebaseapp.com",
  "http://localhost:5000",
  "http://localhost:3000",
  "http://127.0.0.1:5500"
];

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/', (req, res) => {
  res.json({ status: 'VaultX Email Server is running', timestamp: new Date().toISOString() });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'VaultX Email API' });
});

// ==========================================
// EMAIL ENDPOINT
// ==========================================
app.post('/send-email', async (req, res) => {
  try {
    const { to, subject, message, html, text, websiteUrl, emailType, category } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields: to, subject, message' });
    }

    // Determine email type for headers
    const isTransactional = emailType === 'transactional' || 
                           category === 'deposit' || 
                           category === 'withdrawal' ||
                           category === 'password_reset' ||
                           category === 'notification';

    // Build HTML if not provided
    const finalHtml = html || `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#12121a;color:#ffffff;border:1px solid #2a2a3a;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#00d4aa,#7c3aed);padding:32px 24px;text-align:center;">
        <div style="font-size:48px;margin-bottom:8px;">🔐</div>
        <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:1px;">VaultX</h1>
        <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Secure Crypto Wallet</p>
    </div>
    <div style="padding:32px 24px;">
        <h2 style="margin:0 0 16px;font-size:18px;color:#00d4aa;">${subject}</h2>
        <div style="white-space:pre-line;line-height:1.7;color:#a0a0b0;font-size:14px;">${message.replace(/\n/g, "<br>")}</div>
        <div style="margin-top:28px;text-align:center;">
            <a href="${websiteUrl || WEBSITE_URL}" style="display:inline-block;background:linear-gradient(135deg,#00d4aa,#7c3aed);color:#ffffff;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;">Open VaultX Wallet</a>
        </div>
    </div>
    <div style="border-top:1px solid #2a2a3a;padding:20px 24px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#6b6b7b;">VaultX Secure Crypto Wallet • <a href="${websiteUrl || WEBSITE_URL}" style="color:#00d4aa;text-decoration:none;">${websiteUrl || WEBSITE_URL}</a></p>
        <p style="margin:8px 0 0;font-size:11px;color:#4a4a5a;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
</div>
</body>
</html>`;

    const finalText = text || (message + `

Open your wallet: ${websiteUrl || WEBSITE_URL}

VaultX Secure Crypto Wallet • ${websiteUrl || WEBSITE_URL}
Automated message — do not reply.`);

    // Anti-spam / deliverability headers
    // NOTE: For best deliverability, verify your domain in Resend dashboard:
    // 1. Go to https://resend.com/domains
    // 2. Add "vaultxwallet.website"
    // 3. Add the DNS records (DKIM, SPF, MX) to your domain registrar
    // 4. Wait for verification (usually 15 minutes)
    const emailHeaders = {
      'X-Priority': '1',
      'X-Mailer': 'VaultX-Secure-Email/1.0',
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      'Precedence': isTransactional ? 'transactional' : 'bulk',
      'X-Email-Type': isTransactional ? 'transactional' : 'notification',
      'X-Category': category || 'general',
      'Feedback-ID': `vaultx:${category || 'general'}:vaultxwallet`,
      'X-Entity-Ref-ID': `vaultx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };

    // Add List-Unsubscribe only for non-transactional emails
    if (!isTransactional) {
      emailHeaders['List-Unsubscribe'] = `<mailto:unsubscribe@vaultxwallet.website?subject=Unsubscribe>, <https://vaultxwallet.website/unsubscribe>`;
      emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: to,
        subject: subject,
        html: finalHtml,
        text: finalText,
        reply_to: REPLY_TO_EMAIL,
        headers: emailHeaders
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend API error:', errText);
      return res.status(500).json({ error: 'Failed to send email via Resend', details: errText });
    }

    const resData = await response.json();
    console.log('Email sent via Resend:', resData.id, 'to:', to, 'type:', isTransactional ? 'transactional' : 'bulk');
    return res.json({ success: true, id: resData.id });

  } catch (error) {
    console.error('Email send error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`VaultX Email Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
