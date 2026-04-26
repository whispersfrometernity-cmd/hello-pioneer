const { Webhook } = require('svix')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Read raw body from stream (needed for HMAC signature check)
function readRawBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', c => chunks.push(Buffer.from(c)))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString()
      // Fall back to re-stringifying parsed body if stream was already consumed
      resolve(raw || JSON.stringify(req.body))
    })
    req.on('error', () => resolve(JSON.stringify(req.body)))
  })
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET
  let event

  if (secret) {
    const wh = new Webhook(secret)
    try {
      const rawBody = await readRawBody(req)
      event = wh.verify(rawBody, {
        'svix-id':        req.headers['svix-id'],
        'svix-timestamp': req.headers['svix-timestamp'],
        'svix-signature': req.headers['svix-signature'],
      })
    } catch {
      return res.status(401).json({ error: 'Invalid signature' })
    }
  } else {
    event = req.body
  }

  const eventType    = (event.type || '').replace('email.', '')
  const messageId    = event.data?.email_id
  const recipientArr = event.data?.to
  const recipient    = Array.isArray(recipientArr) ? recipientArr[0] : recipientArr

  if (!messageId || !recipient || !eventType) {
    return res.status(400).json({ error: 'Missing required event fields' })
  }

  let noteId = event.data?.tags?.find(t => t.name === 'note_id')?.value || null

  if (!noteId) {
    const { data } = await supabase
      .from('email_events')
      .select('note_id')
      .eq('message_id', messageId)
      .eq('event_type', 'sent')
      .limit(1)
      .single()
    noteId = data?.note_id || null
  }

  const { error } = await supabase.from('email_events').insert({
    message_id: messageId,
    note_id:    noteId,
    recipient,
    event_type: eventType,
  })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(200).json({ success: true })
}
