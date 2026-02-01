const state = {
  token: null,
  user: null,
  locations: [],
  locationId: null,
  date: null,
  view: 'roster',
  rosterMode: 'mine',
  rosterEntries: [],
  filteredEntries: [],
  selectedBlock: null,
  instructorFilter: 'all',
  search: '',
  sortBy: 'instructor'
}

const el = (id) => document.getElementById(id)

const loginPanel = el('loginPanel')
const appPanel = el('appPanel')
const loginForm = el('loginForm')
const loginError = el('loginError')
const locationSelect = el('locationSelect')
const dateSelect = el('dateSelect')
const timeBlocks = el('timeBlocks')
const selectedBlock = el('selectedBlock')
const rosterTable = el('rosterTable')
const rosterMeta = el('rosterMeta')
const rosterEmpty = el('rosterEmpty')
const rosterSearch = el('rosterSearch')
const searchClear = el('searchClear')
const sortBy = el('sortBy')
const instructorFilter = el('instructorFilter')
const bulkMarkPresent = el('bulkMarkPresent')
const bulkClearAttendance = el('bulkClearAttendance')
const uploadForm = el('uploadForm')
const rosterFile = el('rosterFile')
const uploadStatus = el('uploadStatus')
const uploadList = el('uploadList')
const reportList = el('reportList')
const userInfo = el('userInfo')
const logoutBtn = el('logoutBtn')
const timeBlockDate = el('timeBlockDate')

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
  const res = await fetch(`/api${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw data
  return data
}

function formatTime(time) {
  if (!time) return ''
  const [hh, mm] = time.split(':')
  const h = parseInt(hh, 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${mm} ${suffix}`
}

function setView(view) {
  state.view = view
  el('viewRoster').classList.toggle('hidden', view !== 'roster')
  el('viewUploads').classList.toggle('hidden', view !== 'uploads')
  el('viewReports').classList.toggle('hidden', view !== 'reports')
  document.querySelectorAll('.page-tabs .tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.view === view)
  })
}

function setRosterMode(mode) {
  state.rosterMode = mode
  document.querySelectorAll('#scheduleToggle .tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.mode === mode)
  })
  loadRosterEntries()
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

async function loadRosterEntries() {
  if (!state.locationId || !state.date) return
  const endpoint = state.rosterMode === 'mine' ? '/roster-entries/mine' : '/roster-entries'
  const data = await apiFetch(`${endpoint}?locationId=${state.locationId}&date=${state.date}`)
  state.rosterEntries = data.entries || []
  buildTimeBlocks()
  buildInstructorFilter()
  applyFilters()
  renderReports()
}

function buildTimeBlocks() {
  const times = [...new Set(state.rosterEntries.map((r) => r.start_time))]
  times.sort()
  if (!state.selectedBlock || !times.includes(state.selectedBlock)) {
    state.selectedBlock = times[0] || null
  }

  timeBlocks.innerHTML = ''
  times.forEach((time) => {
    const btn = document.createElement('button')
    btn.textContent = formatTime(time)
    btn.classList.toggle('active', time === state.selectedBlock)
    btn.addEventListener('click', () => {
      state.selectedBlock = time
      document.querySelectorAll('#timeBlocks button').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      applyFilters()
    })
    timeBlocks.appendChild(btn)
  })

  selectedBlock.textContent = state.selectedBlock ? formatTime(state.selectedBlock) : 'None'
  timeBlockDate.textContent = state.date || ''
}

function buildInstructorFilter() {
  const instructors = new Set()
  state.rosterEntries.forEach((r) => {
    if (r.actual_instructor) instructors.add(r.actual_instructor)
    else if (r.scheduled_instructor) instructors.add(r.scheduled_instructor)
    else if (r.instructor_name) instructors.add(r.instructor_name)
  })
  const list = Array.from(instructors).sort()
  instructorFilter.innerHTML = ''
  const allOpt = document.createElement('option')
  allOpt.value = 'all'
  allOpt.textContent = 'All'
  instructorFilter.appendChild(allOpt)
  list.forEach((name) => {
    const opt = document.createElement('option')
    opt.value = name
    opt.textContent = name
    instructorFilter.appendChild(opt)
  })
  instructorFilter.value = state.instructorFilter || 'all'
}

function applyFilters() {
  const search = state.search.toLowerCase()
  const selected = state.selectedBlock
  let filtered = state.rosterEntries

  if (selected) {
    filtered = filtered.filter((r) => r.start_time === selected)
  }
  if (state.instructorFilter !== 'all') {
    filtered = filtered.filter((r) => (r.actual_instructor || r.scheduled_instructor || r.instructor_name) === state.instructorFilter)
  }
  if (search) {
    filtered = filtered.filter((r) => {
      const hay = [r.swimmer_name, r.actual_instructor, r.scheduled_instructor, r.program, r.level, r.zone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(search)
    })
  }

  filtered.sort((a, b) => {
    if (state.sortBy === 'name') {
      return (a.swimmer_name || '').localeCompare(b.swimmer_name || '')
    }
    const instA = (a.actual_instructor || a.scheduled_instructor || a.instructor_name || '')
    const instB = (b.actual_instructor || b.scheduled_instructor || b.instructor_name || '')
    if (instA === instB) return (a.swimmer_name || '').localeCompare(b.swimmer_name || '')
    return instA.localeCompare(instB)
  })

  state.filteredEntries = filtered
  rosterMeta.textContent = `(${filtered.length} swimmers)`
  renderRoster()
}

function renderRoster() {
  rosterTable.innerHTML = ''
  if (!state.filteredEntries.length) {
    rosterEmpty.classList.remove('hidden')
    return
  }
  rosterEmpty.classList.add('hidden')

  state.filteredEntries.forEach((entry) => {
    const tr = document.createElement('tr')
    tr.className = 'roster-row'
    if (entry.attendance_auto_absent) tr.classList.add('auto-absent')
    if (entry.attendance === 1) tr.classList.add('present')
    if (entry.attendance === 0) tr.classList.add('absent')

    const attendanceCell = document.createElement('td')
    const attendanceWrap = document.createElement('div')
    attendanceWrap.className = 'attendance-btns'
    const presentBtn = document.createElement('button')
    presentBtn.textContent = '✅'
    presentBtn.classList.toggle('active', entry.attendance === 1)
    presentBtn.addEventListener('click', () => updateAttendance(entry.id, 1))

    const absentBtn = document.createElement('button')
    absentBtn.textContent = '❌'
    absentBtn.classList.toggle('active', entry.attendance === 0)
    absentBtn.addEventListener('click', () => updateAttendance(entry.id, 0))

    const clearBtn = document.createElement('button')
    clearBtn.textContent = '⭘'
    clearBtn.addEventListener('click', () => updateAttendance(entry.id, null))

    attendanceWrap.appendChild(presentBtn)
    attendanceWrap.appendChild(absentBtn)
    attendanceWrap.appendChild(clearBtn)
    attendanceCell.appendChild(attendanceWrap)

    const swimmerCell = document.createElement('td')
    const flags = []
    if (entry.flag_first_time) flags.push('⭐')
    if (entry.flag_makeup) flags.push('🔄')
    if (entry.flag_policy) flags.push('📜')
    if (entry.flag_owes) flags.push('💳')
    if (entry.flag_trial) flags.push('🧪')

    const flagHtml = flags.map((f) => `<span class="flag-chip">${f}</span>`).join('')
    swimmerCell.innerHTML = `<div><strong>${entry.swimmer_name || ''}</strong></div><div>${flagHtml}</div>`

    const ageCell = document.createElement('td')
    ageCell.textContent = entry.age_text || ''

    const programCell = document.createElement('td')
    programCell.textContent = entry.program || entry.class_name || ''

    const levelCell = document.createElement('td')
    levelCell.textContent = entry.level || ''

    const instructorCell = document.createElement('td')
    const actual = entry.actual_instructor || entry.instructor_name || ''
    const scheduled = entry.scheduled_instructor || ''
    const subLabel = entry.is_sub ? ' (Sub)' : ''
    instructorCell.innerHTML = `<div>${actual}${subLabel}</div><div class="tiny muted">${scheduled ? `Scheduled: ${scheduled}` : ''}</div>`

    const zoneCell = document.createElement('td')
    zoneCell.textContent = entry.zone !== null && entry.zone !== undefined ? `Zone ${entry.zone}` : ''

    tr.appendChild(attendanceCell)
    tr.appendChild(swimmerCell)
    tr.appendChild(ageCell)
    tr.appendChild(programCell)
    tr.appendChild(levelCell)
    tr.appendChild(instructorCell)
    tr.appendChild(zoneCell)

    rosterTable.appendChild(tr)
  })
}

async function updateAttendance(rosterEntryId, attendance) {
  try {
    await apiFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify({ rosterEntryId, attendance })
    })
    const entry = state.rosterEntries.find((r) => r.id === rosterEntryId)
    if (entry) entry.attendance = attendance
    applyFilters()
  } catch (err) {
    alert(err?.error || 'Attendance update failed')
  }
}

async function bulkAttendance(attendance) {
  if (!state.selectedBlock) return
  try {
    await apiFetch('/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        date: state.date,
        start_time: state.selectedBlock,
        attendance
      })
    })
    state.rosterEntries.forEach((entry) => {
      if (entry.start_time === state.selectedBlock) entry.attendance = attendance
    })
    applyFilters()
  } catch (err) {
    alert(err?.error || 'Bulk attendance failed')
  }
}

function renderReports() {
  const counts = new Map()
  state.rosterEntries.forEach((entry) => {
    const name = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || 'Unassigned'
    counts.set(name, (counts.get(name) || 0) + 1)
  })
  reportList.innerHTML = ''
  if (!counts.size) {
    reportList.innerHTML = '<div class="hint">No roster data loaded.</div>'
    return
  }
  Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([name, count]) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${name}</strong><div class="muted tiny">${count} swimmers</div>`
    reportList.appendChild(item)
  })
}

async function loadUploads() {
  if (!state.locationId) return
  const data = await apiFetch(`/roster-uploads?locationId=${state.locationId}`)
  uploadList.innerHTML = ''
  ;(data.uploads || []).forEach((upload) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<div><strong>${upload.original_filename}</strong><div class="tiny muted">${new Date(upload.uploaded_at).toLocaleString()}</div></div><div class="tiny muted">${upload.parse_status}</div>`
    uploadList.appendChild(item)
  })
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  loginError.textContent = ''
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: el('username').value,
        pin: el('pin').value
      })
    })
    setAuth(data.token, data.user)
    await bootstrap()
  } catch (err) {
    loginError.textContent = err?.error || 'Login failed'
  }
})

logoutBtn.addEventListener('click', () => {
  setAuth(null, null)
  loginPanel.classList.remove('hidden')
  appPanel.classList.add('hidden')
})

locationSelect.addEventListener('change', () => {
  state.locationId = locationSelect.value
  loadRosterEntries()
  loadUploads()
})

dateSelect.addEventListener('change', () => {
  state.date = dateSelect.value
  loadRosterEntries()
})

rosterSearch.addEventListener('input', () => {
  state.search = rosterSearch.value
  searchClear.classList.toggle('hidden', !state.search)
  applyFilters()
})

searchClear.addEventListener('click', () => {
  rosterSearch.value = ''
  state.search = ''
  searchClear.classList.add('hidden')
  applyFilters()
})

sortBy.addEventListener('change', () => {
  state.sortBy = sortBy.value
  applyFilters()
})

instructorFilter.addEventListener('change', () => {
  state.instructorFilter = instructorFilter.value
  applyFilters()
})

bulkMarkPresent.addEventListener('click', () => bulkAttendance(1))
bulkClearAttendance.addEventListener('click', () => bulkAttendance(null))

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!state.locationId) return
  const file = rosterFile.files[0]
  if (!file) return

  const formData = new FormData()
  formData.append('file', file)
  uploadStatus.textContent = 'Uploading…'

  try {
    const data = await apiFetch(`/uploads/roster?locationId=${state.locationId}&date=${state.date}`, {
      method: 'POST',
      body: formData
    })
    uploadStatus.textContent = `Upload complete. Classes: ${data.classesInserted}, Swimmers: ${data.swimmersInserted}`
    await loadUploads()
    await loadRosterEntries()
  } catch (err) {
    uploadStatus.textContent = err?.error || 'Upload failed'
  }
})

document.querySelectorAll('.page-tabs .tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    setView(tab.dataset.view)
    if (tab.dataset.view === 'uploads') loadUploads()
  })
})

document.querySelectorAll('#scheduleToggle .tab').forEach((tab) => {
  tab.addEventListener('click', () => setRosterMode(tab.dataset.mode))
})

async function bootstrap() {
  loginPanel.classList.add('hidden')
  appPanel.classList.remove('hidden')

  userInfo.textContent = state.user ? `${state.user.firstName} ${state.user.lastName} • ${state.user.roleLabel || state.user.roleKey || ''}` : ''
  await loadLocations()

  state.date = new Date().toISOString().slice(0, 10)
  dateSelect.value = state.date

  const roleKey = state.user?.roleKey || ''
  state.rosterMode = roleKey === 'staff' ? 'mine' : 'all'
  setRosterMode(state.rosterMode)
  setView('roster')
}

loadStoredAuth()
if (state.token) {
  bootstrap().catch(() => setAuth(null, null))
}
