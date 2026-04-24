import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

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

  container.innerHTML = data.length
    ? data.map(n => `
        <div class="note">
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.content)}</p>
          <time>${new Date(n.created_at).toLocaleString()}</time>
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

loadNotes()
