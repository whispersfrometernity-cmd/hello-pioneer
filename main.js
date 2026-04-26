import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
let notesCache = []

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_LABEL = {
  sent:      { icon: '·',  color: '#999',   label: 'sent'      },
  delivered: { icon: '✓',  color: '#2a7a2a', label: 'delivered' },
  opened:    { icon: '👁', color: '#1a6a9a', label: 'opened'    },
  clicked:   { icon: '↗',  color: '#1a6a9a', label: 'clicked'   },
  bounced:   { icon: '✗',  color: '#c0392b', label: 'bounced'   },
}

function buildActivityFeed(noteId, eventsMap) {
  const events = eventsMap[noteId]
  if (!events || events.length === 0) return ''

  // Latest event per recipient
  const byRecipient = {}
  for (const e of events) {
    if (!byRecipient[e.recipient]) byRecipient[e.recipient] = e
  }

  const rows = Object.values(byRecipient).map(e => {
    const s = STATUS_LABEL[e.event_type] || { icon: '·', color: '#999', label: e.event_type }
    return `<li class="activity-row">
      <span class="activity-icon" style="color:${s.color}">${s.icon}</span>
      <span class="activity-email">${esc(e.recipient)}</span>
      <span class="activity-status" style="color:${s.color}">${s.label}</span>
      <span class="activity-time">${timeAgo(e.created_at)}</span>
    </li>`
  }).join('')

  return `<ul class="activity-feed">${rows}</ul>`
}

async function loadNotes() {
  const container = document.getElementById('notes')

  const { data, error } = await supabase
    .from('notes')
    .select('id, title, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    container.innerHTML = `<p class="error">Could not load notes: ${esc(error.message)}</p>`
    return
  }

  notesCache = data

  // Fetch email events for all loaded notes in one query
  const noteIds = data.map(n => n.id).filter(Boolean)
  let eventsMap = {}

  if (noteIds.length > 0) {
    const { data: events } = await supabase
      .from('email_events')
      .select('message_id, note_id, recipient, event_type, created_at')
      .in('note_id', noteIds)
      .order('created_at', { ascending: false })

    if (events) {
      for (const e of events) {
        const key = e.note_id
        if (!eventsMap[key]) eventsMap[key] = []
        eventsMap[key].push(e)
      }
    }
  }

  container.innerHTML = data.length
    ? data.map((n, i) => `
        <div class="note">
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.content)}</p>
          <time>${new Date(n.created_at).toLocaleString()}</time>
          ${buildActivityFeed(n.id, eventsMap)}
          <div class="note-footer">
            <button class="share-btn" data-i="${i}">Share via email</button>
          </div>
          <div class="share-form" id="sf-${i}">
            <input type="email" id="se-${i}" placeholder="Recipient email address" />
            <div class="share-row">
              <button class="send-share-btn" data-i="${i}">Send</button>
              <button class="cancel-share-btn" data-i="${i}">Cancel</button>
            </div>
            <p class="share-msg" id="sm-${i}"></p>
          </div>
        </div>`).join('')
    : '<p>No notes yet — be the first!</p>'
}

async function ensureSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) return session.user
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

document.getElementById('submit').addEventListener('click', async () => {
  const title   = document.getElementById('title').value.trim()
  const content = document.getElementById('content').value.trim()
  const status  = document.getElementById('status')

  if (!title || !content) {
    status.textContent = 'Please enter both a title and content.'
    return
  }

  status.textContent = 'Posting…'

  try {
    const user = await ensureSession()
    const { error } = await supabase
      .from('notes')
      .insert({ title, content, user_id: user.id })
    if (error) throw error
    document.getElementById('title').value = ''
    document.getElementById('content').value = ''
    status.textContent = 'Posted!'
    await loadNotes()
  } catch (err) {
    status.textContent = `Error: ${esc(err.message)}`
  }
})

document.getElementById('notes').addEventListener('click', async (e) => {
  const i = e.target.dataset.i
  if (i === undefined) return

  if (e.target.classList.contains('share-btn')) {
    const form = document.getElementById(`sf-${i}`)
    form.style.display = form.style.display === 'block' ? 'none' : 'block'
    if (form.style.display === 'block') document.getElementById(`se-${i}`).focus()
    return
  }

  if (e.target.classList.contains('cancel-share-btn')) {
    document.getElementById(`sf-${i}`).style.display = 'none'
    return
  }

  if (e.target.classList.contains('send-share-btn')) {
    const to  = document.getElementById(`se-${i}`).value.trim()
    const msg = document.getElementById(`sm-${i}`)

    if (!to) { msg.textContent = 'Please enter an email address.'; return }

    const note = notesCache[parseInt(i)]
    e.target.disabled = true
    msg.style.color   = '#555'
    msg.textContent   = 'Sending…'

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, title: note.title, content: note.content, noteId: note.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send')
      msg.style.color = '#2a7a2a'
      msg.textContent = `Sent to ${to}!`
      document.getElementById(`se-${i}`).value = ''
      // Reload to show the new "sent" row in the activity feed
      setTimeout(() => loadNotes(), 1000)
    } catch (err) {
      msg.style.color = 'red'
      msg.textContent = `Error: ${esc(err.message)}`
    } finally {
      e.target.disabled = false
    }
  }
})

loadNotes()
