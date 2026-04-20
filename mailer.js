// mailer.js — Envoi des emails via iCloud
// En mode "console" (si SMTP_USER n'est pas configuré dans .env),
// le code s'affiche simplement dans le terminal — pratique pour tester.

const nodemailer = require('nodemailer');

const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  // iCloud : smtp.mail.me.com, port 587, STARTTLS
  transporter = nodemailer.createTransport({
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,          // STARTTLS
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

async function sendLoginCode(toEmail, code) {
  const subject = 'Votre code de connexion';
  const text = `Bonjour,\n\nVoici votre code de connexion : ${code}\n\n` +
               `Ce code est valable 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.\n`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#1f2937">Votre code de connexion</h2>
      <p>Voici votre code :</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f3f4f6;padding:16px 24px;border-radius:12px;text-align:center;color:#111827">${code}</p>
      <p style="color:#6b7280;font-size:14px">Ce code est valable <strong>10 minutes</strong>.<br>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
    </div>`;

  if (!transporter) {
    // Mode console — aucun email n'est envoyé, le code apparaît dans le terminal
    console.log('\n======================================');
    console.log(`  [MODE CONSOLE] Code pour ${toEmail}`);
    console.log(`  >>>  ${code}  <<<`);
    console.log('======================================\n');
    return { mocked: true };
  }

  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to: toEmail,
    subject,
    text,
    html
  });
  return { mocked: false, messageId: info.messageId };
}

module.exports = { sendLoginCode };
