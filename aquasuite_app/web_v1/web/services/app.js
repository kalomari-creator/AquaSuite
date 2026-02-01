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
  sortBy: 'instructor',
  staff: [],
  version: null,
  reportPreflight: null,
  observationRoster: [],
  observationSwimmers: [],
  rosterNoteEntryId: null
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
const addSwimmerBtn = el('addSwimmerBtn')
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
const retentionTable = el('retentionTable')
const reportFile = el('reportFile')
const reportPreflightBtn = el('reportPreflightBtn')
const reportPreflight = el('reportPreflight')
const reportConfirm = el('reportConfirm')
const reportUploadBtn = el('reportUploadBtn')
const reportStatus = el('reportStatus')
const obsFormTab = el('obsFormTab')
const obsDashTab = el('obsDashTab')
const obsFormPanel = el('obsFormPanel')
const obsDashboardPanel = el('obsDashboardPanel')
const obsDate = el('obsDate')
const obsClassSelect = el('obsClassSelect')
const obsInstructor = el('obsInstructor')
const obsLoadRosterBtn = el('obsLoadRosterBtn')
const obsRosterStatus = el('obsRosterStatus')
const obsSwimmerList = el('obsSwimmerList')
const obsAddSwimmer = el('obsAddSwimmer')
const obsNotes = el('obsNotes')
const obsSaveBtn = el('obsSaveBtn')
const obsResetBtn = el('obsResetBtn')
const obsSaveStatus = el('obsSaveStatus')
const obsDashboardList = el('obsDashboardList')
const obsRefreshBtn = el('obsRefreshBtn')
const rosterNoteModal = el('rosterNoteModal')
const rosterNoteClose = el('rosterNoteClose')
const rosterNoteSave = el('rosterNoteSave')
const rosterNoteClear = el('rosterNoteClear')
const rosterNoteText = el('rosterNoteText')
const addSwimmerModal = el('addSwimmerModal')
const addSwimmerClose = el('addSwimmerClose')
const addSwimmerSave = el('addSwimmerSave')
const addSwimmerStatus = el('addSwimmerStatus')
const addSwimmerName = el('addSwimmerName')
const addSwimmerAge = el('addSwimmerAge')
const addSwimmerProgram = el('addSwimmerProgram')
const addSwimmerLevel = el('addSwimmerLevel')
const addSwimmerInstructor = el('addSwimmerInstructor')
const addSwimmerZone = el('addSwimmerZone')
const userInfo = el('userInfo')
const logoutBtn = el('logoutBtn')
const timeBlockDate = el('timeBlockDate')
const staffList = el('staffList')
const staffSearch = el('staffSearch')
const instructorVariants = el('instructorVariants')
const refreshVariants = el('refreshVariants')
const intakeList = el('intakeList')
const intakeStatusFilter = el('intakeStatusFilter')
const intakeBadge = el('intakeBadge')
const gmailConnectBtn = el('gmailConnectBtn')
const gmailStatus = el('gmailStatus')
const locationAdminList = el('locationAdminList')
const announcerTab = el('announcerTab')
const revBtn = el('revBtn')
const revModal = el('revModal')
const revClose = el('revClose')
const revContent = el('revContent')
const filtersToggle = el('filtersToggle')
const filtersPanel = el('filtersPanel')
const rosterActionDock = el('rosterActionDock')

const layoutPrefKey = 'layoutMode'
const mediaCoarse = window.matchMedia('(pointer: coarse)')
const mediaNoHover = window.matchMedia('(hover: none)')
let layoutPref = localStorage.getItem(layoutPrefKey) || 'auto'
localStorage.setItem(layoutPrefKey, layoutPref)
let lastLayout = null

function detectLayoutMode() {
  const uaMobile = !!(navigator.userAgentData && navigator.userAgentData.mobile)
  const touchPoints = navigator.maxTouchPoints || 0
  const coarse = mediaCoarse.matches
  const noHover = mediaNoHover.matches
  const minDim = Math.min(window.innerWidth || 0, window.innerHeight || 0)

  if (uaMobile || (coarse && noHover && minDim <= 600)) return 'phone'
  if ((coarse || touchPoints > 0) && minDim <= 1024) return 'tablet'
  return 'desktop'
}

function resolveLayoutMode() {
  layoutPref = localStorage.getItem(layoutPrefKey) || 'auto'
  if (layoutPref === 'auto') return detectLayoutMode()
  return layoutPref
}

function checkOverflow() {
  const over = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  document.documentElement.dataset.overflow = over ? 'true' : 'false'
}

function applyLayoutMode() {
  const mode = resolveLayoutMode()
  if (mode !== lastLayout) {
    document.documentElement.dataset.layout = mode
    lastLayout = mode
  }

  if (filtersPanel) {
    if (mode === 'phone') filtersPanel.classList.remove('open')
    else filtersPanel.classList.add('open')
  }

  if (filtersToggle) {
    const expanded = filtersPanel && filtersPanel.classList.contains('open')
    filtersToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  checkOverflow()
}

let layoutTimer
function scheduleLayoutUpdate() {
  clearTimeout(layoutTimer)
  layoutTimer = setTimeout(applyLayoutMode, 120)
}

window.addEventListener('resize', scheduleLayoutUpdate)
window.addEventListener('orientationchange', scheduleLayoutUpdate)
mediaCoarse.addEventListener('change', scheduleLayoutUpdate)
mediaNoHover.addEventListener('change', scheduleLayoutUpdate)

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

async function loadVersion() {
  try {
    const res = await fetch('/version.json')
    if (!res.ok) throw new Error('missing')
    state.version = await res.json()
  } catch {
    state.version = { version: '0.1', builtAt: 'unknown', notes: ['Version info unavailable'] }
  }
}

function showRevModal() {
  if (!state.version) return
  revContent.innerHTML = ''
  const item = document.createElement('div')
  item.className = 'list-item'
  item.innerHTML = `<div><strong>Version ${state.version.version}</strong></div><div class="muted tiny">Built: ${state.version.builtAt}</div>`
  revContent.appendChild(item)
  ;(state.version.notes || []).forEach((note) => {
    const row = document.createElement('div')
    row.className = 'list-item'
    row.textContent = note
    revContent.appendChild(row)
  })
  revModal.classList.remove('hidden')
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
  ['roster','uploads','reports','observations','staff','intakes','locations','announcer'].forEach((v) => {
    const panel = el(`view${v[0].toUpperCase()}${v.slice(1)}`)
    if (panel) panel.classList.toggle('hidden', v !== view)
  })
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
  const data = await apiFetch("/locations")
  const locations = Array.isArray(data.locations) ? data.locations : []
  state.locations = locations
  locationSelect.innerHTML = ""
  locations.forEach((loc) => {
    const opt = document.createElement("option")
    opt.value = loc.id
    opt.textContent = loc.name
    locationSelect.appendChild(opt)
  })
  state.locationId = locations[0]?.id || null
  locationSelect.value = state.locationId || ""
  applyLocationFeatures()
}

function getLocationFeatures(loc) {
  const base = {
    roster_enabled: true,
    announcer_enabled: false,
    reports_enabled: false,
    observations_enabled: false
  }
  const merged = { ...base, ...(loc?.features || {}) }
  if (loc?.announcer_enabled) merged.announcer_enabled = true
  return merged
}

function applyLocationFeatures() {
  const loc = state.locations.find((l) => l.id === state.locationId)
  const features = getLocationFeatures(loc)

  const rosterTab = document.querySelector('.page-tabs .tab[data-view="roster"]')
  const uploadsTab = document.querySelector('.page-tabs .tab[data-view="uploads"]')
  const reportsTab = document.querySelector('.page-tabs .tab[data-view="reports"]')
  const staffTab = document.querySelector('.page-tabs .tab[data-view="staff"]')
  const intakesTab = document.querySelector('.page-tabs .tab[data-view="intakes"]')
  const observationsTab = document.querySelector('.page-tabs .tab[data-view="observations"]')
  const locationsTab = document.querySelector('.page-tabs .tab[data-view="locations"]')
  const announcerTabEl = document.querySelector('.page-tabs .tab[data-view="announcer"]')

  const rosterOnly = features.roster_enabled && !features.announcer_enabled && !features.reports_enabled && !features.observations_enabled

  if (rosterTab) rosterTab.classList.toggle("hidden", !features.roster_enabled)
  if (uploadsTab) uploadsTab.classList.toggle("hidden", rosterOnly)
  if (reportsTab) reportsTab.classList.toggle("hidden", !features.reports_enabled)
  if (staffTab) staffTab.classList.toggle("hidden", rosterOnly)
  if (intakesTab) intakesTab.classList.toggle("hidden", rosterOnly)
  if (observationsTab) observationsTab.classList.toggle("hidden", !features.observations_enabled)
  if (locationsTab) {
    const isAdmin = ["owner", "exec_admin"].includes(state.user?.roleKey || "")
    locationsTab.classList.toggle("hidden", rosterOnly || !isAdmin)
  }
  if (announcerTabEl) announcerTabEl.classList.toggle("hidden", !features.announcer_enabled)

  if (rosterOnly && state.view !== "roster") setView("roster")
  if (!features.announcer_enabled && state.view === "announcer") setView("roster")
  if (!features.observations_enabled && state.view === "observations") setView("roster")
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
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  const times = [...new Set(rosterEntries.map((r) => r.start_time))]
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
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  rosterEntries.forEach((r) => {
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
  const search = (state.search || "").toLowerCase()
  const selected = state.selectedBlock
  let filtered = Array.isArray(state.rosterEntries) ? state.rosterEntries.slice() : []

  if (selected) {
    filtered = filtered.filter((r) => r.start_time === selected)
  }
  if (state.instructorFilter !== 'all') {
    filtered = filtered.filter((r) => (r.actual_instructor || r.scheduled_instructor || r.instructor_name) === state.instructorFilter)
  }
  if (search) {
    filtered = filtered.filter((r) => {
      const hay = [r.swimmer_name, r.actual_instructor, r.scheduled_instructor, r.program, r.level]
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


function setObsTab(tab) {
  const isForm = tab === 'form'
  obsFormTab.classList.toggle('active', isForm)
  obsDashTab.classList.toggle('active', !isForm)
  obsFormPanel.classList.toggle('hidden', !isForm)
  obsDashboardPanel.classList.toggle('hidden', isForm)
}

function renderObservationSwimmers() {
  obsSwimmerList.innerHTML = ''
  if (!state.observationSwimmers.length) {
    obsSwimmerList.innerHTML = '<div class="hint">No swimmers yet. Add manually or load roster.</div>'
    return
  }
  state.observationSwimmers.forEach((swimmer, idx) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${swimmer.name}</strong>`

    const scoresRow = document.createElement('div')
    scoresRow.className = 'row'

    const fields = ['technique','engagement','safety','progress']
    fields.forEach((field) => {
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '1'
      input.max = '5'
      input.placeholder = field
      input.value = swimmer.scores?.[field] || ''
      input.addEventListener('input', () => {
        swimmer.scores = swimmer.scores || {}
        swimmer.scores[field] = input.value ? Number(input.value) : null
      })
      scoresRow.appendChild(input)
    })

    const note = document.createElement('textarea')
    note.value = swimmer.notes || ''
    note.placeholder = 'Swimmer notes'
    note.addEventListener('input', () => {
      swimmer.notes = note.value
    })

    const removeBtn = document.createElement('button')
    removeBtn.className = 'secondary miniBtn'
    removeBtn.textContent = 'Remove'
    removeBtn.addEventListener('click', () => {
      state.observationSwimmers.splice(idx, 1)
      renderObservationSwimmers()
    })

    item.appendChild(scoresRow)
    item.appendChild(note)
    item.appendChild(removeBtn)
    obsSwimmerList.appendChild(item)
  })
}

async function loadObservationClasses() {
  if (!state.locationId) return
  const dateVal = obsDate.value || new Date().toISOString().slice(0, 10)
  obsDate.value = dateVal
  obsRosterStatus.textContent = 'Loading roster classes…'
  try {
    const data = await apiFetch(`/class-instances?locationId=${state.locationId}&date=${dateVal}`)
    state.observationRoster = data.classes || []
    obsClassSelect.innerHTML = ''
    const defaultOpt = document.createElement('option')
    defaultOpt.value = ''
    defaultOpt.textContent = 'Select class'
    obsClassSelect.appendChild(defaultOpt)

    state.observationRoster.forEach((cls) => {
      const opt = document.createElement('option')
      opt.value = cls.id
      opt.textContent = `${formatTime(cls.start_time)} ${cls.class_name}`
      obsClassSelect.appendChild(opt)
    })

    obsRosterStatus.textContent = state.observationRoster.length
      ? `Loaded ${state.observationRoster.length} classes.`
      : 'No roster loaded for this date — manual entry available.'
  } catch (err) {
    obsRosterStatus.textContent = err?.error || 'Failed to load roster classes.'
  }
}

async function loadObservationSwimmersFromRoster() {
  const classId = obsClassSelect.value
  if (!classId) {
    obsRosterStatus.textContent = 'Select a class first.'
    return
  }
  const cls = state.observationRoster.find((c) => c.id === classId)
  if (!cls) return

  try {
    const data = await apiFetch(`/roster-entries?locationId=${state.locationId}&date=${cls.class_date}`)
    const swimmers = (data.entries || []).filter((e) => e.start_time === cls.start_time)
    state.observationSwimmers = swimmers.map((s) => ({ name: s.swimmer_name, scores: {}, notes: '' }))
    renderObservationSwimmers()
    obsInstructor.value = cls.actual_instructor || cls.scheduled_instructor || ''
    obsRosterStatus.textContent = swimmers.length ? `Loaded ${swimmers.length} swimmers.` : 'No swimmers found for this class.'
  } catch (err) {
    obsRosterStatus.textContent = err?.error || 'Failed to load roster swimmers.'
  }
}

async function saveObservation() {
  if (!state.locationId) return
  if (!obsDate.value) {
    obsSaveStatus.textContent = 'Select a class date.'
    return
  }

  obsSaveStatus.textContent = 'Saving...'
  try {
    const payload = {
      locationId: state.locationId,
      instructorName: obsInstructor.value || null,
      classDate: obsDate.value || null,
      classTime: (() => {
        const cls = state.observationRoster.find((c) => c.id === obsClassSelect.value)
        return cls?.start_time || null
      })(),
      notes: obsNotes.value || null,
      swimmers: state.observationSwimmers
    }
    await apiFetch('/observations', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    obsSaveStatus.textContent = 'Observation saved.'
  } catch (err) {
    obsSaveStatus.textContent = err?.error || 'Save failed.'
  }
}

async function loadObservationDashboard() {
  if (!state.locationId) return
  try {
    const data = await apiFetch(`/observations?locationId=${state.locationId}`)
    obsDashboardList.innerHTML = ''
    if (!data.observations || !data.observations.length) {
      obsDashboardList.innerHTML = '<div class="hint">No observations yet.</div>'
      return
    }
    data.observations.forEach((obs) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      item.innerHTML = `<strong>${obs.instructor_name || 'Instructor'}</strong>
        <div class="muted tiny">${obs.class_date || '—'} ${obs.class_time || ''}</div>
        <div class="muted tiny">${obs.notes || ''}</div>`
      obsDashboardList.appendChild(item)
    })
  } catch (err) {
    obsDashboardList.innerHTML = `<div class="hint">${err?.error || 'Failed to load observations.'}</div>`
  }
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
    attendanceCell.dataset.label = 'Attendance'
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
    swimmerCell.dataset.label = 'Swimmer'
    const flags = []
    if (entry.flag_first_time) flags.push('⭐')
    if (entry.flag_makeup) flags.push('🔄')
    if (entry.flag_policy) flags.push('📜')
    if (entry.flag_owes) flags.push('💳')
    if (entry.flag_trial) flags.push('🧪')

    const flagHtml = flags.map((f) => `<span class="flag-chip">${f}</span>`).join('')
    const localBadge = entry.local_only ? '<span class="flag-chip">Local</span>' : ''
    swimmerCell.innerHTML = `<div><strong>${entry.swimmer_name || ''}</strong></div><div>${flagHtml}${localBadge}</div>`

    const ageCell = document.createElement('td')
    ageCell.dataset.label = 'Age'
    ageCell.textContent = entry.age_text || ''

    const programCell = document.createElement('td')
    programCell.dataset.label = 'Type'
    programCell.textContent = entry.program || entry.class_name || ''

    const levelCell = document.createElement('td')
    levelCell.dataset.label = 'Level'
    levelCell.textContent = entry.level || ''

    const instructorCell = document.createElement('td')
    instructorCell.dataset.label = 'Instructor'
    const actual = entry.actual_instructor || entry.instructor_name || ''
    const scheduled = entry.scheduled_instructor || ''
    const subLabel = entry.is_sub ? ' (Sub)' : ''
    instructorCell.innerHTML = `<div>${actual}${subLabel}</div><div class="tiny muted">${scheduled ? `Scheduled: ${scheduled}` : ''}</div>`

    const zoneCell = document.createElement('td')
    zoneCell.dataset.label = 'Zone'
    zoneCell.textContent = entry.zone ?? ''

    const actionCell = document.createElement('td')
    actionCell.dataset.label = 'Action'
    const noteBtn = document.createElement('button')
    noteBtn.className = 'secondary miniBtn'
    const hasNote = !!localStorage.getItem(getRosterNoteKey(entry.id))
    noteBtn.textContent = hasNote ? 'Notes ✓' : 'Notes'
    noteBtn.addEventListener('click', () => openRosterNote(entry.id))
    actionCell.appendChild(noteBtn)

    tr.appendChild(attendanceCell)
    tr.appendChild(swimmerCell)
    tr.appendChild(ageCell)
    tr.appendChild(programCell)
    tr.appendChild(levelCell)
    tr.appendChild(instructorCell)
    tr.appendChild(zoneCell)
    tr.appendChild(actionCell)

    rosterTable.appendChild(tr)
  })
}


async function updateAttendance(rosterEntryId, attendance) {
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    const entry = rosterEntries.find((r) => r.id === rosterEntryId)
  if (entry?.local_only) {
    entry.attendance = attendance
    applyFilters()
    return
  }
  try {
    await apiFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify({ rosterEntryId, attendance })
    })
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
    const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    rosterEntries.forEach((entry) => {
      if (entry.start_time === state.selectedBlock) entry.attendance = attendance
    })
    applyFilters()
  } catch (err) {
    alert(err?.error || 'Bulk attendance failed')
  }
}


function renderReportPreflight(data) {
  reportPreflight.innerHTML = ''
  if (!data) return
  const item = document.createElement('div')
  item.className = 'list-item'
  item.innerHTML = `<strong>${data.reportType || 'unknown'}</strong>`
  const locRow = document.createElement('div')
  locRow.className = 'muted tiny'
  locRow.textContent = `Detected location: ${data.detectedLocationName || 'unknown'}`
  const rangeRow = document.createElement('div')
  rangeRow.className = 'muted tiny'
  const rangeText = (data.dateRanges || []).map((r) => r.raw || `${r.start || ''} ${r.end || ''}`.trim()).join(', ')
  rangeRow.textContent = `Date range: ${rangeText || 'unknown'}`
  item.appendChild(locRow)
  item.appendChild(rangeRow)
  reportPreflight.appendChild(item)
}

async function runReportPreflight() {
  if (!state.locationId) return
  const file = reportFile?.files?.[0]
  if (!file) {
    reportStatus.textContent = 'Select a report file first.'
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  reportStatus.textContent = 'Running preflight...'
  try {
    const data = await apiFetch(`/reports/preflight?locationId=${state.locationId}`, {
      method: 'POST',
      body: formData
    })
    state.reportPreflight = data
    renderReportPreflight(data)
    reportStatus.textContent = 'Preflight OK.'
  } catch (err) {
    reportStatus.textContent = err?.code || err?.error || 'Preflight failed'
    state.reportPreflight = null
    renderReportPreflight(null)
  }
}

async function uploadReport() {
  if (!state.locationId) return
  if (!reportConfirm.checked) {
    reportStatus.textContent = 'Please confirm the report location before upload.'
    return
  }
  const file = reportFile?.files?.[0]
  if (!file) {
    reportStatus.textContent = 'Select a report file first.'
    return
  }

  const formData = new FormData()
  formData.append('file', file)
  reportStatus.textContent = 'Uploading report...'
  try {
    const data = await apiFetch(`/reports/upload?locationId=${state.locationId}`, {
      method: 'POST',
      body: formData
    })
    reportStatus.textContent = `Report uploaded (${data.preflight?.reportType || 'unknown'})`
  } catch (err) {
    reportStatus.textContent = err?.code || err?.error || 'Report upload failed'
  }
}


async function loadRetentionAnalytics() {
  if (!state.locationId) return
  try {
    const data = await apiFetch(`/analytics/retention?locationId=${state.locationId}`)
    renderRetention(data.summary || [])
  } catch {
    renderRetention([])
  }
}

function renderRetention(summary) {
  retentionTable.innerHTML = ''
  if (!summary.length) {
    retentionTable.innerHTML = '<div class="hint">No retention data yet.</div>'
    return
  }
  summary.forEach((item) => {
    const latest = item.latest || {}
    const row = document.createElement('div')
    row.className = 'list-item'
    row.innerHTML = `<strong>${item.instructorName}</strong>
      <div class="muted tiny">Latest: ${latest.retention_percent || '—'}% (${latest.ending_headcount || '—'} / ${latest.starting_headcount || '—'})</div>
      <div class="muted tiny">Delta: ${item.retentionDelta === null ? '—' : item.retentionDelta.toFixed(2)}%</div>`
    retentionTable.appendChild(row)
  })
}


function getRosterNoteKey(entryId) {
  return `roster_note_${entryId}`
}

function openRosterNote(entryId) {
  state.rosterNoteEntryId = entryId
  const stored = localStorage.getItem(getRosterNoteKey(entryId)) || ''
  rosterNoteText.value = stored
  rosterNoteModal.classList.remove('hidden')
}

function closeRosterNote() {
  rosterNoteModal.classList.add('hidden')
  state.rosterNoteEntryId = null
}

function saveRosterNote() {
  if (!state.rosterNoteEntryId) return
  localStorage.setItem(getRosterNoteKey(state.rosterNoteEntryId), rosterNoteText.value || '')
  closeRosterNote()
  renderRoster()
}

function clearRosterNote() {
  if (!state.rosterNoteEntryId) return
  localStorage.removeItem(getRosterNoteKey(state.rosterNoteEntryId))
  rosterNoteText.value = ''
  renderRoster()
}

function openAddSwimmer() {
  addSwimmerStatus.textContent = ''
  addSwimmerName.value = ''
  addSwimmerAge.value = ''
  addSwimmerProgram.value = ''
  addSwimmerLevel.value = ''
  addSwimmerInstructor.value = ''
  addSwimmerZone.value = ''
  addSwimmerModal.classList.remove('hidden')
}

function closeAddSwimmer() {
  addSwimmerModal.classList.add('hidden')
}

function addLocalSwimmer() {
  if (!state.locationId || !state.date) return
  const name = (addSwimmerName.value || '').trim()
  if (!name) {
    addSwimmerStatus.textContent = 'Swimmer name is required.'
    return
  }
  const entry = {
    id: `local_${Date.now()}`,
    location_id: state.locationId,
    class_date: state.date,
    start_time: state.selectedBlock || null,
    swimmer_name: name,
    age_text: addSwimmerAge.value || null,
    program: addSwimmerProgram.value || null,
    level: addSwimmerLevel.value || null,
    instructor_name: addSwimmerInstructor.value || null,
    scheduled_instructor: addSwimmerInstructor.value || null,
    actual_instructor: addSwimmerInstructor.value || null,
    zone: addSwimmerZone.value ? Number(addSwimmerZone.value) : null,
    is_sub: false,
    attendance: null,
    attendance_auto_absent: false,
    flag_first_time: false,
    flag_makeup: false,
    flag_policy: false,
    flag_owes: false,
    flag_trial: false,
    local_only: true
  }
  state.rosterEntries.push(entry)
  applyFilters()
  closeAddSwimmer()
}

function renderReports() {
  const counts = new Map()
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  rosterEntries.forEach((entry) => {
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

async function loadStaff() {
  if (!state.locationId) return
  const data = await apiFetch(`/staff?locationId=${state.locationId}`)
  state.staff = data.staff || []
  renderStaffList()
}

function renderStaffList() {
  const query = (staffSearch.value || '').toLowerCase()
  const staff = Array.isArray(state.staff) ? state.staff : []
  const items = staff.filter((s) => {
    const hay = `${s.first_name} ${s.last_name} ${s.email} ${s.phone || ''}`.toLowerCase()
    return hay.includes(query)
  })
  staffList.innerHTML = ''
  items.forEach((s) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${s.first_name} ${s.last_name}</strong>
      <div class="muted tiny">${s.email} • ${s.phone || 'No phone'}</div>
      <div class="muted tiny">${s.permission_level || 'Staff'} • PIN ${s.pin || '—'} • Hire ${s.hire_date || '—'}</div>`
    staffList.appendChild(item)
  })
}

async function loadInstructorVariants() {
  if (!state.locationId) return
  const data = await apiFetch(`/instructor-variants?locationId=${state.locationId}&sinceDays=90`)
  instructorVariants.innerHTML = ''
  ;(data.variants || []).forEach((v) => {
    const item = document.createElement('div')
    item.className = 'list-item'

    const select = document.createElement('select')
    const empty = document.createElement('option')
    empty.value = ''
    empty.textContent = 'Select staff'
    select.appendChild(empty)
    const staff = Array.isArray(state.staff) ? state.staff : []
    staff.forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.first_name} ${s.last_name}`
      if (v.matched_staff_id === s.id) opt.selected = true
      select.appendChild(opt)
    })

    const applyBtn = document.createElement('button')
    applyBtn.className = 'secondary miniBtn'
    applyBtn.textContent = 'Apply'
    applyBtn.addEventListener('click', async () => {
      if (!select.value) return
      await apiFetch('/instructor-aliases', {
        method: 'POST',
        body: JSON.stringify({ locationId: state.locationId, staffId: select.value, aliasRaw: v.name_raw })
      })
      await apiFetch('/instructor-aliases/apply', {
        method: 'POST',
        body: JSON.stringify({ locationId: state.locationId, staffId: select.value, aliasRaw: v.name_raw })
      })
      loadRosterEntries()
      loadInstructorVariants()
    })

    item.innerHTML = `<strong>${v.name_raw}</strong>
      <div class="muted tiny">Seen ${v.count_seen} times • Last ${new Date(v.last_seen_at).toLocaleDateString()}</div>`
    item.appendChild(select)
    item.appendChild(applyBtn)
    instructorVariants.appendChild(item)
  })
}

async function loadIntakes() {
  await loadGmailStatus()
  const status = intakeStatusFilter.value
  const url = status ? `/intakes?status=${status}` : '/intakes'
  const data = await apiFetch(url)
  intakeList.innerHTML = ''

  const newCount = (data.intakes || []).filter((i) => i.status === 'new').length
  intakeBadge.textContent = `${newCount} new`

  ;(data.intakes || []).forEach((i) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${i.client_name || 'Unknown'}</strong>
      <div class="muted tiny">${i.location_name || i.location_name_raw || 'Unassigned'} • ${i.status}</div>
      <div class="muted tiny">${i.contact_email || ''} ${i.contact_phone || ''}</div>`

    const statusSelect = document.createElement('select')
    ;['new','contacted','scheduled','enrolled','closed'].forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s
      opt.textContent = s
      if (i.status === s) opt.selected = true
      statusSelect.appendChild(opt)
    })

    const notes = document.createElement('textarea')
    notes.value = i.notes || ''
    notes.placeholder = 'Notes'

    const saveBtn = document.createElement('button')
    saveBtn.className = 'secondary miniBtn'
    saveBtn.textContent = 'Save'
    saveBtn.addEventListener('click', async () => {
      await apiFetch(`/intakes/${i.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: statusSelect.value, notes: notes.value })
      })
      loadIntakes()
    })

    item.appendChild(statusSelect)
    item.appendChild(notes)
    item.appendChild(saveBtn)
  intakeList.appendChild(item)
  })
}

async function loadGmailStatus() {
  try {
    const data = await apiFetch('/integrations/gmail/status')
    gmailStatus.textContent = data.connected ? `Gmail: connected` : 'Gmail: not connected'
  } catch {
    gmailStatus.textContent = 'Gmail: error'
  }
}

function renderLocationAdmin() {
  locationAdminList.innerHTML = ''
  state.locations.forEach((loc) => {
    const item = document.createElement('div')
    item.className = 'list-item'

    const emailTag = document.createElement('input')
    emailTag.value = loc.email_tag || ''
    emailTag.placeholder = 'email tag'

    const hubspotTag = document.createElement('input')
    hubspotTag.value = loc.hubspot_tag || ''
    hubspotTag.placeholder = 'hubspot tag'

    const intakeEnabled = document.createElement('input')
    intakeEnabled.type = 'checkbox'
    intakeEnabled.checked = !!loc.intake_enabled

    const announcerEnabled = document.createElement('input')
    announcerEnabled.type = 'checkbox'
    announcerEnabled.checked = !!loc.announcer_enabled

    const saveBtn = document.createElement('button')
    saveBtn.className = 'secondary miniBtn'
    saveBtn.textContent = 'Save'
    saveBtn.addEventListener('click', async () => {
      await apiFetch(`/locations/${loc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email_tag: emailTag.value,
          hubspot_tag: hubspotTag.value,
          intake_enabled: intakeEnabled.checked,
          announcer_enabled: announcerEnabled.checked
        })
      })
    })

    item.innerHTML = `<strong>${loc.name}</strong><div class="muted tiny">${loc.code}</div>`
    item.appendChild(emailTag)
    item.appendChild(hubspotTag)

    const toggles = document.createElement('div')
    toggles.className = 'row'
    toggles.innerHTML = '<span class="muted tiny">Intake enabled</span>'
    toggles.appendChild(intakeEnabled)
    toggles.innerHTML += '<span class="muted tiny">Announcer enabled</span>'
    toggles.appendChild(announcerEnabled)
    item.appendChild(toggles)

    item.appendChild(saveBtn)
    locationAdminList.appendChild(item)
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
  applyLocationFeatures()
  loadRosterEntries()
  loadUploads()
  loadStaff()
  loadInstructorVariants()
  state.reportPreflight = null
  if (reportConfirm) reportConfirm.checked = false
  if (reportPreflight) reportPreflight.innerHTML = ''
  if (reportStatus) reportStatus.textContent = ''
  state.observationRoster = []
  state.observationSwimmers = []
  if (obsDate) obsDate.value = state.date || ''
  if (obsClassSelect) obsClassSelect.innerHTML = ''
  if (obsRosterStatus) obsRosterStatus.textContent = ''
  if (obsSwimmerList) obsSwimmerList.innerHTML = ''
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

filtersToggle?.addEventListener('click', () => {
  if (!filtersPanel) return
  const isOpen = filtersPanel.classList.toggle('open')
  filtersToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false')
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
addSwimmerBtn?.addEventListener('click', openAddSwimmer)
addSwimmerClose?.addEventListener('click', closeAddSwimmer)
addSwimmerSave?.addEventListener('click', addLocalSwimmer)
rosterNoteClose?.addEventListener('click', closeRosterNote)
rosterNoteSave?.addEventListener('click', saveRosterNote)
rosterNoteClear?.addEventListener('click', clearRosterNote)
rosterNoteModal?.addEventListener('click', (e) => { if (e.target === rosterNoteModal) closeRosterNote() })
addSwimmerModal?.addEventListener('click', (e) => { if (e.target === addSwimmerModal) closeAddSwimmer() })
obsFormTab?.addEventListener('click', () => setObsTab('form'))
obsDashTab?.addEventListener('click', () => { setObsTab('dashboard'); loadObservationDashboard() })
obsLoadRosterBtn?.addEventListener('click', () => { loadObservationClasses(); loadObservationSwimmersFromRoster() })
obsAddSwimmer?.addEventListener('click', () => { state.observationSwimmers.push({ name: 'New swimmer', scores: {}, notes: '' }); renderObservationSwimmers() })
obsSaveBtn?.addEventListener('click', saveObservation)
obsResetBtn?.addEventListener('click', () => { state.observationSwimmers = []; obsNotes.value = ''; renderObservationSwimmers(); obsSaveStatus.textContent = '' })
obsRefreshBtn?.addEventListener('click', loadObservationDashboard)

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
    if (tab.dataset.view === 'reports') { renderReports(); loadRetentionAnalytics() }
    if (tab.dataset.view === 'observations') { setObsTab('form'); loadObservationClasses(); renderObservationSwimmers() }
    if (tab.dataset.view === 'staff') { loadStaff(); loadInstructorVariants() }
    if (tab.dataset.view === 'intakes') loadIntakes()
    if (tab.dataset.view === 'locations') renderLocationAdmin()
  })
})

document.querySelectorAll('#scheduleToggle .tab').forEach((tab) => {
  tab.addEventListener('click', () => setRosterMode(tab.dataset.mode))
})

staffSearch.addEventListener('input', renderStaffList)
refreshVariants.addEventListener('click', loadInstructorVariants)
intakeStatusFilter.addEventListener('change', loadIntakes)
gmailConnectBtn.addEventListener('click', async () => {
  try {
    const data = await apiFetch('/integrations/gmail/auth/start')
    if (data.url) window.location.href = data.url
  } catch (err) {
    alert(err?.error || 'Gmail OAuth not configured')
  }
})

reportPreflightBtn?.addEventListener('click', runReportPreflight)
reportUploadBtn?.addEventListener('click', uploadReport)
revBtn.addEventListener('click', showRevModal)
revClose.addEventListener('click', () => revModal.classList.add('hidden'))
revModal.addEventListener('click', (e) => { if (e.target === revModal) revModal.classList.add('hidden') })

async function bootstrap() {
  loginPanel.classList.add('hidden')
  appPanel.classList.remove('hidden')

  await loadVersion()
  userInfo.textContent = state.user ? `${state.user.firstName} ${state.user.lastName} • ${state.user.roleLabel || state.user.roleKey || ''}` : ''
  await loadLocations()

  state.date = new Date().toISOString().slice(0, 10)
  dateSelect.value = state.date

  const roleKey = state.user?.roleKey || ''
  state.rosterMode = roleKey === 'staff' ? 'mine' : 'all'
  setRosterMode(state.rosterMode)
  setView('roster')
}

applyLayoutMode()

loadStoredAuth()
if (state.token) {
  bootstrap().catch(() => setAuth(null, null))
}
