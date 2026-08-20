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

// Os emails eram a única superfície da marca fora da app — e a única que
// continuou laranja depois de a paleta ter mudado para azul. Aqui não há
// tokens: nenhum cliente de email resolve var(--accent) de forma fiável, e
// metade nem sequer lê <style>. Fica o hex do acento do tema claro, porque um
// email é lido sobre branco.
//
// O botão era #FCA311 com texto preto. Preto sobre o azul novo dá 3,65:1 e
// falha os 4,5:1; branco dá 5,76:1 e passa. Não é detalhe: se o botão não se
// lê, ninguém verifica a conta nem repõe a password.
const ACENTO = '#1A6B9F'
const SOBRE_ACENTO = '#FFFFFF'

/** As duas mensagens eram o mesmo HTML copiado, e foi por isso que a correcção
 *  da cor teve de ser feita em quatro sítios em vez de um. */
function moldura({ texto, rotuloBotao, ligacao, rodape }) {
  return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:${ACENTO};margin-bottom:8px">Memovoy</h2>
        <p>${texto}</p>
        <a href="${ligacao}"
           style="display:inline-block;margin-top:20px;padding:12px 24px;background:${ACENTO};color:${SOBRE_ACENTO};border-radius:8px;text-decoration:none;font-weight:700">
          ${rotuloBotao}
        </a>
        <p style="margin-top:24px;font-size:12px;color:#666">
          ${rodape}
        </p>
      </div>`
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
    html: moldura({
      texto:       'Olá! Confirma o teu endereço de email para activar a tua conta.',
      rotuloBotao: 'Verificar email',
      ligacao:     link,
      rodape:      'Este link expira em 24 horas. Se não criaste esta conta, ignora este email.',
    }),
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
    html: moldura({
      texto:       'Clica no botão abaixo para criar uma nova password. O link expira em 1 hora.',
      rotuloBotao: 'Repor password',
      ligacao:     link,
      rodape:      'Se não pediste uma reposição de password, ignora este email.',
    }),
  })
}
