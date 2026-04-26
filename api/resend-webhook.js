const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const event = req.body
  const eventType  = (event.type || '').replace('email.', '')   // 'delivered', 'opened', etc.
  const messageId  = event.data?.email_id
  const recipientArr = event.data?.to
  const recipient  = Array.isArray(recipientArr) ? recipientArr[0] : recipientArr

  if (!messageId || !recipient || !eventType) {
    return res.status(400).json({ error: 'Missing required event fields' })
  }

  // Prefer note_id from Resend tags; fall back to the 'sent' row for this message
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
