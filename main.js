import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
let notesCache = []

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function loadNotes() {
  const container = document.getElementById('notes')
  const { data, error } = await supabase
    .from('notes')
    .select('title, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    container.innerHTML = `<p class="error">Could not load notes: ${esc(error.message)}</p>`
    return
  }

  notesCache = data

  container.innerHTML = data.length
    ? data.map((n, i) => `
        <div class="note">
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.content)}</p>
          <time>${new Date(n.created_at).toLocaleString()}</time>
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
  const title = document.getElementById('title').value.trim()
  const content = document.getElementById('content').value.trim()
  const status = document.getElementById('status')

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
    const to = document.getElementById(`se-${i}`).value.trim()
    const msg = document.getElementById(`sm-${i}`)

    if (!to) { msg.textContent = 'Please enter an email address.'; return }

    const note = notesCache[parseInt(i)]
    e.target.disabled = true
    msg.style.color = '#555'
    msg.textContent = 'Sending…'

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, title: note.title, content: note.content }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send')
      msg.style.color = '#2a7a2a'
      msg.textContent = `Sent to ${to}!`
      document.getElementById(`se-${i}`).value = ''
    } catch (err) {
      msg.style.color = 'red'
      msg.textContent = `Error: ${esc(err.message)}`
    } finally {
      e.target.disabled = false
    }
  }
})

loadNotes()
