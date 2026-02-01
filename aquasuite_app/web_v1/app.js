const state = {
  token: null,
  user: null,
  locations: [],
  locationId: null,
  view: 'schedule',
  scheduleMode: 'mine'
}

const qs = (id) => document.getElementById(id)

const loginView = qs('loginView')
const appView = qs('appView')
const loginForm = qs('loginForm')
const loginError = qs('loginError')
const userInfo = qs('userInfo')
const logoutBtn = qs('logoutBtn')
const locationSelect = qs('locationSelect')
const dateSelect = qs('dateSelect')
const scheduleList = qs('scheduleList')
const uploadForm = qs('uploadForm')
const rosterFile = qs('rosterFile')
const uploadStatus = qs('uploadStatus')
const uploadList = qs('uploadList')
const reportSummary = qs('reportSummary')
const myScheduleBtn = qs('myScheduleBtn')
const fullRosterBtn = qs('fullRosterBtn')

const scheduleView = qs('scheduleView')
const uploadsView = qs('uploadsView')
const reportsView = qs('reportsView')

const tabs = document.querySelectorAll('.tab')

function setAuth(token, user) {
  state.token = token
  state.user = user
  localStorage.setItem('aqua_token', token || '')
  localStorage.setItem('aqua_user', JSON.stringify(user || null))
}

function loadStoredAuth() {
  const token = localStorage.getItem('aqua_token')
  const user = localStorage.getItem('aqua_user')
  if (token && user) {
    state.token = token
    state.user = JSON.parse(user)
  }
}

async function apiFetch(path, options = {}) {
  const headers = options.headers || {}
  if (state.token) headers.Authorization = `Bearer ${state.token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`/api${path}`, {
    ...options,
    headers
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw data
  return data
}

function setView(view) {
  state.view = view
  scheduleView.classList.toggle('hidden', view !== 'schedule')
  uploadsView.classList.toggle('hidden', view !== 'uploads')
  reportsView.classList.toggle('hidden', view !== 'reports')
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view))
}

function setScheduleMode(mode) {
  state.scheduleMode = mode
  myScheduleBtn.classList.toggle('btn', mode === 'mine')
  fullRosterBtn.classList.toggle('btn', mode === 'all')
  loadSchedule()
}

function formatTime(time) {
  if (!time) return '—'
  return time.slice(0, 5)
}

async function loadLocations() {
  const data = await apiFetch('/locations')
  state.locations = data.locations || []
  locationSelect.innerHTML = ''
  state.locations.forEach((loc) => {
    const opt = document.createElement('option')
    opt.value = loc.id
    opt.textContent = loc.name
    locationSelect.appendChild(opt)
  })
  state.locationId = state.locations[0]?.id || null
  locationSelect.value = state.locationId || ''
}

async function loadSchedule() {
  if (!state.locationId) return
  const date = dateSelect.value
  if (!date) return
  const endpoint = state.scheduleMode === 'mine' ? '/class-instances/mine' : '/class-instances'
  const data = await apiFetch(`${endpoint}?locationId=${state.locationId}&date=${date}`)
  renderSchedule(data.classes || [])
  renderReport(data.classes || [])
}

function renderSchedule(classes) {
  scheduleList.innerHTML = ''
  if (!classes.length) {
    scheduleList.innerHTML = '<p class="muted">No classes for this date.</p>'
    return
  }
  classes.forEach((c) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    const title = document.createElement('div')
    title.innerHTML = `<strong>${c.class_name}</strong><div class="meta">${formatTime(c.start_time)} - ${formatTime(c.end_time)}</div>`

    const instructor = document.createElement('div')
    const subLabel = c.is_sub ? '<span class="meta">(Sub)</span>' : ''
    instructor.innerHTML = `<div>${c.actual_instructor || c.scheduled_instructor || 'TBD'} ${subLabel}</div><div class="meta">Scheduled: ${c.scheduled_instructor || '—'}</div>`

    item.appendChild(title)
    item.appendChild(instructor)
    scheduleList.appendChild(item)
  })
}

async function loadUploads() {
  if (!state.locationId) return
  const data = await apiFetch(`/roster-uploads?locationId=${state.locationId}`)
  uploadList.innerHTML = ''
  ;(data.uploads || []).forEach((u) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<div><strong>${u.original_filename}</strong><div class="meta">${new Date(u.uploaded_at).toLocaleString()}</div></div><div class="meta">${u.parse_status}</div>`
    uploadList.appendChild(item)
  })
}

function renderReport(classes) {
  if (!classes.length) {
    reportSummary.innerHTML = '<p class="muted">No classes to summarize.</p>'
    return
  }
  const byInstructor = new Map()
  classes.forEach((c) => {
    const key = c.actual_instructor || c.scheduled_instructor || 'Unassigned'
    byInstructor.set(key, (byInstructor.get(key) || 0) + 1)
  })
  reportSummary.innerHTML = ''
  byInstructor.forEach((count, name) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<div><strong>${name}</strong></div><div class="meta">Classes: ${count}</div>`
    reportSummary.appendChild(item)
  })
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  loginError.textContent = ''
  try {
    const payload = {
      username: qs('username').value,
      pin: qs('pin').value
    }
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    setAuth(data.token, data.user)
    await bootstrapApp()
  } catch (err) {
    loginError.textContent = err?.error || 'Login failed'
  }
})

logoutBtn.addEventListener('click', () => {
  setAuth(null, null)
  state.locations = []
  state.locationId = null
  loginView.classList.remove('hidden')
  appView.classList.add('hidden')
})

locationSelect.addEventListener('change', () => {
  state.locationId = locationSelect.value
  loadSchedule()
  loadUploads()
})

dateSelect.addEventListener('change', () => {
  loadSchedule()
})

myScheduleBtn.addEventListener('click', () => setScheduleMode('mine'))
fullRosterBtn.addEventListener('click', () => setScheduleMode('all'))

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setView(tab.dataset.view)
    if (tab.dataset.view === 'uploads') loadUploads()
  })
})

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  uploadStatus.textContent = ''
  const file = rosterFile.files[0]
  if (!file || !state.locationId) return

  const formData = new FormData()
  formData.append('file', file)

  try {
    const dateParam = dateSelect.value
    const data = await apiFetch(`/uploads/roster?locationId=${state.locationId}&date=${dateParam}` , {
      method: 'POST',
      body: formData
    })
    uploadStatus.textContent = `Uploaded. Classes inserted: ${data.classesInserted}`
    loadUploads()
    loadSchedule()
  } catch (err) {
    uploadStatus.textContent = err?.error || 'Upload failed'
  }
})

async function bootstrapApp() {
  if (!state.token) return
  loginView.classList.add('hidden')
  appView.classList.remove('hidden')

  userInfo.textContent = state.user ? `${state.user.firstName} ${state.user.lastName} • ${state.user.roleLabel || state.user.roleKey || ''}` : ''

  await loadLocations()
  dateSelect.value = new Date().toISOString().slice(0, 10)

  const roleKey = state.user?.roleKey || ''
  state.scheduleMode = roleKey === 'staff' ? 'mine' : 'all'
  setScheduleMode(state.scheduleMode)
  setView('schedule')
}

loadStoredAuth()
if (state.token) {
  bootstrapApp().catch(() => {
    setAuth(null, null)
  })
}
