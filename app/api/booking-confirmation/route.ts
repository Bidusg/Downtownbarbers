import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { config } from '@/lib/config'

const resend = new Resend(process.env.RESEND_API_KEY)

interface Payload {
  name: string
  email: string
  date: string
  time: string
  barber: string
  service?: string
}

function html(d: Payload) {
  return `<!DOCTYPE html>
<html lang="nb">
<head><meta charset="UTF-8"><title>Timebekreftelse</title></head>
<body style="margin:0;padding:0;background:#100F0D;font-family:'Inter',system-ui,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#100F0D;padding:48px 24px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="padding-bottom:28px;">
    <p style="margin:0 0 2px;color:#F3F0E7;font-size:9px;letter-spacing:.38em;font-family:Georgia,serif;">DOWNTOWN</p>
    <p style="margin:0;color:#F3F0E7;font-size:24px;letter-spacing:.18em;font-weight:700;font-family:Georgia,serif;">BARBERS</p>
  </td></tr>
  <tr><td style="border-top:1px solid #2A2820;padding-bottom:32px;"></td></tr>
  <tr><td style="padding-bottom:20px;">
    <p style="margin:0;color:#F3F0E7;font-size:15px;line-height:1.75;">Hei ${d.name},</p>
  </td></tr>
  <tr><td style="padding-bottom:28px;">
    <p style="margin:0;color:#F3F0E7;font-size:15px;line-height:1.75;">din time er bekreftet hos Downtown Barbers.</p>
  </td></tr>
  <tr><td style="padding-bottom:28px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1C1A17;border:1px solid #2A2820;">
    <tr><td style="padding:22px 26px;">
      ${d.service ? `<p style="margin:0 0 4px;color:#7A756E;font-size:10px;letter-spacing:.28em;">TJENESTE</p>
      <p style="margin:0 0 18px;color:#F3F0E7;font-size:15px;">${d.service}</p>` : ''}
      <p style="margin:0 0 4px;color:#7A756E;font-size:10px;letter-spacing:.28em;">DATO &amp; TID</p>
      <p style="margin:0 0 18px;color:#F3F0E7;font-size:15px;">${d.date} kl ${d.time}</p>
      <p style="margin:0 0 4px;color:#7A756E;font-size:10px;letter-spacing:.28em;">BARBER</p>
      <p style="margin:0;color:#F3F0E7;font-size:15px;">${d.barber}</p>
    </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding-left:16px;border-left:3px solid #1B4032;padding-bottom:28px;">
    <p style="margin:0 0 4px;color:#7A756E;font-size:10px;letter-spacing:.28em;">ADRESSE</p>
    <p style="margin:0;color:#F3F0E7;font-size:15px;">Osterhaus' gate 10, Oslo</p>
  </td></tr>
  <tr><td style="padding-bottom:36px;">
    <p style="margin:0 0 5px;color:#7A756E;font-size:13px;">Spørsmål? Ring oss på</p>
    <a href="tel:+4746358764" style="color:#3D8A69;font-size:17px;text-decoration:none;font-weight:500;">+47 463 58 764</a>
  </td></tr>
  <tr><td style="border-top:1px solid #2A2820;padding-top:18px;">
    <p style="margin:0;color:#2A2820;font-size:10px;letter-spacing:.12em;">© 2025 Downtown Barbers · Osterhaus' gate 10, Oslo</p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Payload>
  const { name, email, date, time, barber, service } = body

  if (!name || !email || !date || !time || !barber) {
    return NextResponse.json({ error: 'Manglende felt' }, { status: 400 })
  }

  const { error } = await resend.emails.send({
    from: config.email.from,
    to: [email],
    subject: `Timebekreftelse – ${date} kl ${time}`,
    html: html({ name, email, date, time, barber, service }),
    text: `Hei ${name}, din time er bekreftet hos Downtown Barbers. ${date} kl ${time} med ${barber}. Adresse: Osterhaus' gate 10, Oslo. Spørsmål? Ring +47 463 58 764`,
  })

  if (error) {
    console.error('[resend]', error)
    return NextResponse.json({ error: 'Kunne ikke sende e-post' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
