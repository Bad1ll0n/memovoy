import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  })

  return transporter
}

const FROM = process.env.EMAIL_FROM ?? 'Memovoy <noreply@memovoy.app>'
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

export async function sendVerificationEmail(email, token) {
  const link = `${FRONTEND_URL}/auth/verify-email?token=${token}`
  const t = getTransporter()

  if (!t) {
    console.log(`[email] SMTP not configured. Verification link for ${email}: ${link}`)
    return
  }

  await t.sendMail({
    from: FROM,
    to: email,
    subject: 'Verifica o teu email — Memovoy',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#FCA311;margin-bottom:8px">Memovoy</h2>
        <p>Olá! Confirma o teu endereço de email para activar a tua conta.</p>
        <a href="${link}"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:#FCA311;color:#000;border-radius:8px;text-decoration:none;font-weight:700">
          Verificar email
        </a>
        <p style="margin-top:24px;font-size:12px;color:#888">
          Este link expira em 24 horas. Se não criaste esta conta, ignora este email.
        </p>
      </div>`,
  })
}

export async function sendPasswordResetEmail(email, token) {
  const link = `${FRONTEND_URL}/auth/reset-password?token=${token}`
  const t = getTransporter()

  if (!t) {
    console.log(`[email] SMTP not configured. Reset link for ${email}: ${link}`)
    return
  }

  await t.sendMail({
    from: FROM,
    to: email,
    subject: 'Repõe a tua password — Memovoy',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#FCA311;margin-bottom:8px">Memovoy</h2>
        <p>Clica no botão abaixo para criar uma nova password. O link expira em 1 hora.</p>
        <a href="${link}"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:#FCA311;color:#000;border-radius:8px;text-decoration:none;font-weight:700">
          Repor password
        </a>
        <p style="margin-top:24px;font-size:12px;color:#888">
          Se não pediste uma reposição de password, ignora este email.
        </p>
      </div>`,
  })
}
