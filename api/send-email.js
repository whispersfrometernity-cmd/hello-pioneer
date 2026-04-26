const { Resend } = require('resend')
const { createClient } = require('@supabase/supabase-js')

const resend = new Resend(process.env.RESEND_API_KEY)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const APP_URL = 'https://hello-pioneer-tau.vercel.app'

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to, title, content, noteId } = req.body

  if (!to || !title || !content) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Invalid email address' })
  }

  const safeTitle   = title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const safeContent = content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#000;padding:32px 40px;">
            <p style="margin:0;color:#fff;font-size:22px;font-weight:600;letter-spacing:-0.5px;">Pioneer Species</p>
            <p style="margin:8px 0 0;color:#888;font-size:13px;">Someone shared a note with you</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;font-size:20px;color:#111;">${safeTitle}</h2>
            <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#333;">${safeContent}</p>
            <a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#000;color:#fff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:500;">View all notes →</a>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#999;">Shared from <a href="${APP_URL}" style="color:#555;text-decoration:none;">Pioneer Species</a></p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const tags = noteId ? [{ name: 'note_id', value: noteId }] : []

  const { data: emailData, error: sendError } = await resend.emails.send({
    from: 'Pioneer Species <onboarding@resend.dev>',
    to: [to],
    subject: `A note was shared with you: "${title}"`,
    html,
    tags,
  })

  if (sendError) return res.status(500).json({ error: sendError.message })

  // Record the sent event (fire-and-forget — don't block the response)
  if (emailData?.id) {
    supabase.from('email_events').insert({
      message_id: emailData.id,
      note_id:    noteId || null,
      recipient:  to,
      event_type: 'sent',
    }).then()
  }

  return res.status(200).json({ success: true })
}
