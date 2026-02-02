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
  manualOverride: false,
  instructorFilter: 'all',
  search: '',
  sortBy: 'instructor',
  staff: [],
  version: null,
  reportPreflight: null,
  observationRoster: [],
  observationSwimmers: [],
  rosterNoteEntryId: null,
  adminUsers: [],
  defaultLocationKey: null,
  noteEntityType: null,
  noteEntityId: null,
  classInstances: [],
  activityEvents: []
}

const el = (id) => document.getElementById(id)
const API_BASE = '/api'
const PRIVATE_IP_REGEX = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/
function assertSafeEnvironment() {
  const host = window.location.hostname || ''
  if (PRIVATE_IP_REGEX.test(host)) {
    throw new Error('internal_ip_not_allowed')
  }
  if (API_BASE.startsWith('http')) {
    const baseHost = new URL(API_BASE).hostname || ''
    if (PRIVATE_IP_REGEX.test(baseHost)) {
      throw new Error('internal_api_base_not_allowed')
    }
  }
}

let envOk = true

const loginPanel = el('loginPanel')
const appPanel = el('appPanel')
const loginForm = el('loginForm')
const loginError = el('loginError')
const locationSelect = el('locationSelect')
const dateSelect = el('dateSelect')
const timeBlocks = el('timeBlocks')
const timeActive = el('timeActive')
const timeBlockToggle = el('timeBlockToggle')
const timeBlockStatus = el('timeBlockStatus')
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
const uploadRosterFile = el('uploadRosterFile')
const rosterUploadStatus = el('rosterUploadStatus')
const uploadStatusUploads = el('uploadStatusUploads')
const uploadConfirmBtn = el('uploadConfirmBtn')
const uploadConfirmModal = el('uploadConfirmModal')
const uploadConfirmSummary = el('uploadConfirmSummary')
const uploadConfirmRun = el('uploadConfirmRun')
const uploadConfirmClose = el('uploadConfirmClose')
const uploadList = el('uploadList')
const reportList = el('reportList')
const retentionTable = el('retentionTable')
const reportFile = el('reportFile')
const reportPreflightBtn = el('reportPreflightBtn')
const reportPreflight = el('reportPreflight')
const reportConfirm = el('reportConfirm')
const reportUploadBtn = el('reportUploadBtn')
const reportStatus = el('reportStatus')
const rosterModeSelect = el('rosterModeSelect')
const todayBtn = el('todayBtn')
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
const sspPassBtn = el('sspPassBtn')
const sspStatus = el('sspStatus')
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
const burgerBtn = el('burgerBtn')
const gearBtn = el('gearBtn')
const navDrawer = el('navDrawer')
const navOverlay = el('navOverlay')
const navCloseBtn = el('navCloseBtn')
const gearMenu = el('gearMenu')
const gearCloseBtn = el('gearCloseBtn')
const contextLocation = el('contextLocation')
const contextDate = el('contextDate')
const deviceFrame = el('deviceFrame')
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
const rosterSaveStatus = el('rosterSaveStatus')

const userAdminCard = el('userAdminCard')
const userAdminFirst = el('userAdminFirst')
const userAdminLast = el('userAdminLast')
const userAdminUsername = el('userAdminUsername')
const userAdminRole = el('userAdminRole')
const userAdminCreate = el('userAdminCreate')
const userAdminStatus = el('userAdminStatus')
const userAdminList = el('userAdminList')
const userAdminLocations = el('userAdminLocations')
const changePinModal = el('changePinModal')
const changePinNew = el('changePinNew')
const changePinConfirm = el('changePinConfirm')
const changePinSave = el('changePinSave')
const changePinStatus = el('changePinStatus')

const activityTab = el('activityTab')
const activityList = el('activityList')
const activityFilter = el('activityFilter')
const activityUserInput = el('activityUserInput')
const activityUserList = el('activityUserList')
const activityFrom = el('activityFrom')
const activityTo = el('activityTo')
const activityPresetToday = el('activityPresetToday')
const activityPreset7 = el('activityPreset7')
const activityPresetWeek = el('activityPresetWeek')
const activityClear = el('activityClear')
const activityStatus = el('activityStatus')
const activityRefresh = el('activityRefresh')
const eodCloseCard = el('eodCloseCard')
const eodCloseBtn = el('eodCloseBtn')
const eodReopenBtn = el('eodReopenBtn')
const eodRefresh = el('eodRefresh')
const eodStatus = el('eodStatus')
const eodSummary = el('eodSummary')
const eodAlerts = el('eodAlerts')
const notificationList = el('notificationList')
const notificationsRefresh = el('notificationsRefresh')
const printRosterBtn = el('printRosterBtn')
const classNoteBtn = el('classNoteBtn')
const printRetentionBtn = el('printRetentionBtn')
const printIntakeBtn = el('printIntakeBtn')
const tourModal = el('tourModal')
const tourTitle = el('tourTitle')
const tourBody = el('tourBody')
const tourSkip = el('tourSkip')
const tourNext = el('tourNext')
const tourDontShow = el('tourDontShow')
const noteInternalToggle = el('noteInternalToggle')
const qaInternalToggle = el('qaInternalToggle')
const commandPaletteBtn = el('commandPaletteBtn')
const commandPaletteModal = el('commandPaletteModal')
const commandPaletteInput = el('commandPaletteInput')
const commandPaletteList = el('commandPaletteList')
const commandPaletteClose = el('commandPaletteClose')
const rosterSaveViewBtn = el('rosterSaveViewBtn')
const rosterSavedViews = el('rosterSavedViews')
const activitySaveViewBtn = el('activitySaveViewBtn')
const activitySavedViews = el('activitySavedViews')
const lineageCard = el('lineageCard')
const lineageClassId = el('lineageClassId')
const lineageLoadBtn = el('lineageLoadBtn')
const lineageOutput = el('lineageOutput')

const qaPanel = el('qaPanel')
const adminTools = el('adminTools')
const qaRoleSelect = el('qaRoleSelect')
const qaLayoutSelect = el('qaLayoutSelect')
const qaResetBtn = el('qaResetBtn')
const obsInstructorMeta = el('obsInstructorMeta')
const obsInstructorOverride = el('obsInstructorOverride')
const integrationStatus = el('integrationStatus')

const locationPrefKey = 'aqua_location_id'
const qaRolePrefKey = 'qa_role_preview'
const layoutPrefKey = 'layoutMode'
const activityFiltersKey = 'activity_filters_v1'
const savedViewsKey = 'savedViews:v1'
const internalToolsKey = 'internal_tools_enabled'
const mediaCoarse = window.matchMedia('(pointer: coarse)')
const mediaNoHover = window.matchMedia('(hover: none)')
let layoutPref = localStorage.getItem(layoutPrefKey) || 'auto'
localStorage.setItem(layoutPrefKey, layoutPref)
let lastLayout = null

function isoDateStart(d) {
  const dt = new Date(d)
  dt.setHours(0,0,0,0)
  return dt.toISOString()
}

function isoDateEnd(d) {
  const dt = new Date(d)
  dt.setHours(23,59,59,999)
  return dt.toISOString()
}

function formatDateInputValue(d) {
  const dt = new Date(d)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth()+1).padStart(2,'0')
  const dd = String(dt.getDate()).padStart(2,'0')
  return `${yyyy}-${mm}-${dd}`
}

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

function applyInternalTools() {
  const role = getEffectiveRoleKey()
  const enabled = localStorage.getItem(internalToolsKey) == 'true'
  if (qaInternalToggle) qaInternalToggle.checked = enabled
  if (lineageCard) lineageCard.classList.toggle('hidden', !(role == 'admin' && enabled))
}

function applyLayoutMode() {
  const mode = resolveLayoutMode()
  if (mode !== lastLayout) {
    document.documentElement.dataset.layout = mode
    lastLayout = mode
  }
  if (deviceFrame) {
    deviceFrame.classList.remove('phone', 'tablet', 'desktop')
    deviceFrame.classList.add(mode)
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

function normalizeRoleKey(key) {
  const raw = String(key || '').trim().toLowerCase()
  if (['owner', 'exec_admin', 'admin'].includes(raw)) return 'admin'
  if (['front_desk', 'virtual_desk', 'manager'].includes(raw)) return 'manager'
  if (['deck', 'staff', 'instructor'].includes(raw)) return 'instructor'
  return 'readonly'
}

function getEffectiveRoleKey() {
  const preview = localStorage.getItem(qaRolePrefKey)
  if (preview) return preview
  return normalizeRoleKey(state.user?.effectiveRoleKey || state.user?.roleKey || '')
}

function applyQaControls() {
  const isAdmin = normalizeRoleKey(state.user?.roleKey || '') === 'admin'
  if (adminTools) adminTools.classList.toggle('hidden', !isAdmin)
  if (!isAdmin) return
  if (qaRoleSelect) qaRoleSelect.value = localStorage.getItem(qaRolePrefKey) || ''
  if (qaLayoutSelect) qaLayoutSelect.value = localStorage.getItem(layoutPrefKey) || 'auto'
}

function canOverrideInstructor() {
  return ['admin', 'manager'].includes(getEffectiveRoleKey())
}


function renderUserAdminLocations(selectedIds = []) {
  if (!userAdminLocations) return
  userAdminLocations.innerHTML = ''
  const locations = Array.isArray(state.locations) ? state.locations : []
  locations.forEach((loc) => {
    const label = document.createElement('label')
    label.className = 'tiny inline'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.value = loc.id
    cb.checked = selectedIds.includes(loc.id)
    label.appendChild(cb)
    const span = document.createElement('span')
    span.textContent = loc.name
    label.appendChild(span)
    userAdminLocations.appendChild(label)
  })
}

function getSelectedAdminLocations(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll('input[type=checkbox]'))
    .filter((i) => i.checked)
    .map((i) => i.value)
}

function applyInstructorOverride() {
  if (!obsInstructorOverride || !obsInstructor) return
  const allowed = canOverrideInstructor()
  obsInstructorOverride.disabled = !allowed
  if (!allowed) obsInstructorOverride.checked = false
  obsInstructor.disabled = !obsInstructorOverride.checked
}

let obsAutoLoadTimer
function scheduleObservationLoad() {
  clearTimeout(obsAutoLoadTimer)
  obsAutoLoadTimer = setTimeout(() => {
    loadObservationSwimmersFromRoster()
  }, 200)
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

function setLoggedOut() {
  setAuth(null, null)
  if (loginPanel) loginPanel.classList.remove('hidden')
  if (appPanel) appPanel.classList.add('hidden')
  closeNavDrawer()
  closeGearMenu()
}

function setLoggedIn() {
  if (loginPanel) loginPanel.classList.add('hidden')
  if (appPanel) appPanel.classList.remove('hidden')
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
  if (!envOk) {
    throw { error: 'environment_not_safe' }
  }
  if (!state.token && path !== '/auth/login') {
    throw { error: 'not_authenticated' }
  }
  const headers = options.headers || {}
  if (state.token) headers.Authorization = `Bearer ${state.token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data && data.error === 'must_change_pin') {
      showChangePinModal()
    }
    throw data
  }
  return data
}



async function loadMeta() {
  try {
    const res = await fetch(`${API_BASE}/meta`)
    if (!res.ok) return
    const data = await res.json().catch(() => ({}))
    state.defaultLocationKey = data.defaultLocationKey || null
  } catch {
    state.defaultLocationKey = null
  }
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

async function loadIntegrationStatus() {
  if (!integrationStatus) return
  try {
    const data = await apiFetch('/integrations/hubspot/status')
    integrationStatus.textContent = `HubSpot: ${data.configured ? 'Configured' : 'Not configured'}`
  } catch {
    integrationStatus.textContent = 'HubSpot: status unavailable'
  }
}

async function showRevModal() {
  if (!revModal || !revContent) return
  revContent.innerHTML = '<div class="hint">Loading revision history…</div>'
  revModal.classList.remove('hidden')
  revModal.style.pointerEvents = 'auto'
  try {
    const params = new URLSearchParams()
    if (state.locationId) params.set('locationId', state.locationId)
    params.set('limit', '50')
    const data = await apiFetch(`/admin/audit-events?${params.toString()}`)
    const events = Array.isArray(data.events) ? data.events : []
    revContent.innerHTML = ''
    if (state.version) {
      const ver = document.createElement('div')
      ver.className = 'list-item'
      ver.innerHTML = `<div><strong>Version ${state.version.version}</strong></div><div class="muted tiny">Built: ${state.version.builtAt}</div>`
      revContent.appendChild(ver)
    }
    if (!events.length) {
      revContent.innerHTML += '<div class="hint">No recent revisions.</div>'
      return
    }
    events.forEach((ev) => {
      const row = document.createElement('div')
      row.className = 'list-item'
      row.innerHTML = `<strong>${ev.event_type}</strong>
        <div class="muted tiny">${ev.message || ''}</div>
        <div class="muted tiny">${ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}</div>`
      revContent.appendChild(row)
    })
  } catch (err) {
    revContent.innerHTML = `<div class="hint">${err?.error || 'Failed to load revisions.'}</div>`
  }
}



function triggerPrint(context) {
  const loc = state.locations.find((l) => l.id === state.locationId)
  const header = document.querySelector('.print-only') || (() => {
    const div = document.createElement('div')
    div.className = 'print-only'
    div.id = 'printHeader'
    document.body.prepend(div)
    return div
  })()
  header.textContent = `${loc?.name || 'Location'} • ${state.date || ''} • ${context}`
  window.print()
}

function showChangePinModal() {
  if (!changePinModal) return
  changePinModal.classList.remove('hidden')
  changePinModal.style.pointerEvents = 'auto'
}


const tourSteps = {
  instructor: {
        roster: ["Today\'s roster and your assigned classes live here.", "Use attendance toggles and notes as you go."],
  },
  manager: {
    roster: ['Review roster coverage and attendance at a glance.', 'Use End of Day Close to lock the day.'],
    intakes: ['Review new intakes and update statuses.', 'Assign owners and follow-ups.']
  },
  admin: {
    staff: ['Manage users, roles, and locations here.'],
    locations: ['Update location settings and feature flags.'],
    activity: ['Review system-wide activity and audits.']
  }
}

let tourIndex = 0
let tourKey = null

function showTour(roleKey, viewKey) {
  const steps = (tourSteps[roleKey] && tourSteps[roleKey][viewKey]) || null
  if (!steps || !tourModal) return
  const key = `tour_${roleKey}_${viewKey}_${state.user?.id || ''}`
  if (localStorage.getItem(key) === 'done') return
  tourKey = key
  tourIndex = 0
  tourDontShow.checked = false
  renderTourStep(steps)
  tourModal.classList.remove('hidden')
  tourModal.style.pointerEvents = 'auto'
}

function renderTourStep(steps) {
  if (!tourTitle || !tourBody) return
  tourTitle.textContent = 'Quick Tour'
  tourBody.textContent = steps[tourIndex] || ''
  if (tourNext) tourNext.textContent = tourIndex >= steps.length - 1 ? 'Done' : 'Next'
}

function closeTour() {
  if (!tourModal) return
  tourModal.classList.add('hidden')
  tourModal.style.pointerEvents = 'none'
}

function hideChangePinModal() {
  if (!changePinModal) return
  changePinModal.classList.add('hidden')
  changePinModal.style.pointerEvents = 'none'
}

function hideRevModal() {
  if (!revModal) return
  revModal.classList.add('hidden')
  revModal.style.pointerEvents = "none"
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
  const views = ["roster","uploads","reports","observations","staff","intakes","locations","activity","notifications","announcer"]
  for (const v of views) {
    const panel = el("view" + v[0].toUpperCase() + v.slice(1))
    if (panel) panel.classList.toggle("hidden", v !== view)
  }
  document.querySelectorAll('.navItem').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view)
  })
  closeGearMenu()
  showTour(getEffectiveRoleKey(), view)
}

function openNavDrawer() {
  if (!navDrawer || !navOverlay) return
  closeGearMenu()
  navDrawer.classList.remove('hidden')
  navOverlay.classList.remove('hidden')
}

function closeNavDrawer() {
  if (!navDrawer || !navOverlay) return
  navDrawer.classList.add('hidden')
  navOverlay.classList.add('hidden')
}

function openGearMenu() {
  if (!gearMenu) return
  closeNavDrawer()
  gearMenu.classList.remove('hidden')
}

function closeGearMenu() {
  if (!gearMenu) return
  gearMenu.classList.add('hidden')
}

function setRosterMode(mode) {
  state.rosterMode = mode
  if (rosterModeSelect) rosterModeSelect.value = mode
  void loadRosterEntries()
}

async function loadLocations() {
  const data = await apiFetch("/locations")
  const locations = Array.isArray(data.locations) ? data.locations : []
  const unique = []
  const seen = new Set()
  locations.forEach((loc) => {
    if (!loc || !loc.id) return
    const key = String(loc.id || loc.location_id || loc.key || loc.location_key || loc.name || '').toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    unique.push(loc)
  })
  unique.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
  const isAdmin = getEffectiveRoleKey() === 'admin'
  if (isAdmin) {
    unique.unshift({ id: 'all', name: 'Global / All Locations', code: 'ALL', state: 'ALL', features: { roster_enabled: true } })
  }
  state.locations = unique
  locationSelect.innerHTML = ""
  unique.forEach((loc) => {
    const opt = document.createElement("option")
    opt.value = loc.id
    opt.textContent = loc.name
    locationSelect.appendChild(opt)
  })
  const storedLocation = localStorage.getItem(locationPrefKey)
  const storedMatch = unique.find((loc) => loc.id === storedLocation)
  const defaultKey = state.defaultLocationKey ? String(state.defaultLocationKey).toUpperCase() : ''
  const defaultMatch = unique.find((loc) => String(loc.state || '').toUpperCase() == defaultKey || String(loc.code || '').toUpperCase() == defaultKey)
  const nyMatch = unique.find((loc) => String(loc.state || '').toUpperCase() == 'NY')
  state.locationId = storedMatch?.id || defaultMatch?.id || nyMatch?.id || unique[0]?.id || null
  locationSelect.value = state.locationId || ""
  if (state.locationId) localStorage.setItem(locationPrefKey, state.locationId)
  if (rosterModeSelect) rosterModeSelect.disabled = state.locationId === 'all'
  applyLocationFeatures()
  applyInternalTools()
  updateContext()
  renderSavedViews('roster')
  renderSavedViews('activity')

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

function updateContext() {
  if (contextLocation) {
    const loc = state.locations.find((l) => l.id === state.locationId)
    contextLocation.textContent = loc ? loc.name : 'Location'
  }
  if (contextDate) contextDate.textContent = state.date || ''
}

function applyLocationFeatures() {
  const loc = state.locations.find((l) => l.id === state.locationId)
  const features = getLocationFeatures(loc)
  const role = getEffectiveRoleKey()

  const rosterTab = document.querySelector('.navItem[data-view="roster"]')
  const uploadsTab = document.querySelector('.navItem[data-view="uploads"]')
  const reportsTab = document.querySelector('.navItem[data-view="reports"]')
  const staffTab = document.querySelector('.navItem[data-view="staff"]')
  const intakesTab = document.querySelector('.navItem[data-view="intakes"]')
  const observationsTab = document.querySelector('.navItem[data-view="observations"]')
  const locationsTab = document.querySelector('.navItem[data-view="locations"]')
  const announcerTabEl = document.querySelector('.navItem[data-view="announcer"]')
  const activityTabEl = document.querySelector('.navItem[data-view="activity"]')
  const notificationsTabEl = document.querySelector('.navItem[data-view="notifications"]')

  const rosterOnly = features.roster_enabled && !features.announcer_enabled && !features.reports_enabled && !features.observations_enabled

  const roleGated = {
    uploads: role === 'admin' || role === 'manager',
    reports: role === 'admin' || role === 'manager',
    staff: role === 'admin' || role === 'manager',
    intakes: role === 'admin' || role === 'manager',
    observations: role !== 'readonly',
    locations: role === 'admin'
  }

  if (rosterTab) rosterTab.classList.toggle("hidden", !features.roster_enabled)
  if (uploadsTab) uploadsTab.classList.toggle("hidden", rosterOnly || !roleGated.uploads)
  if (reportsTab) reportsTab.classList.toggle("hidden", !features.reports_enabled || !roleGated.reports)
  if (staffTab) staffTab.classList.toggle("hidden", rosterOnly || !roleGated.staff)
  if (intakesTab) intakesTab.classList.toggle("hidden", rosterOnly || !roleGated.intakes)
  if (observationsTab) observationsTab.classList.toggle("hidden", !features.observations_enabled || !roleGated.observations)
  if (locationsTab) {
    const isAdmin = getEffectiveRoleKey() === 'admin'
    locationsTab.classList.toggle("hidden", rosterOnly || !roleGated.locations || !isAdmin)
  }
  if (announcerTabEl) announcerTabEl.classList.toggle("hidden", !features.announcer_enabled)
  if (activityTabEl) activityTabEl.classList.toggle("hidden", role !== "admin")
  if (notificationsTabEl) notificationsTabEl.classList.toggle("hidden", !(role === "admin" || role === "manager" || role === "instructor"))
  if (eodCloseCard) eodCloseCard.classList.toggle("hidden", !(role === "admin" || role === "manager"))

  if (rosterOnly && state.view !== "roster") setView("roster")
  if (!features.announcer_enabled && state.view === "announcer") setView("roster")
  if (!features.observations_enabled && state.view === "observations") setView("roster")
}


async function loadClassInstances() {
  if (!state.locationId || !state.date || state.locationId === 'all') { state.classInstances = []; return }
  try {
    const data = await apiFetch(`/class-instances?locationId=${state.locationId}&date=${state.date}`)
    state.classInstances = Array.isArray(data.classes) ? data.classes : []
  } catch {
    state.classInstances = []
  }
}

function renderEodSummary() {
  if (!eodSummary) return
  const entries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  const total = entries.length
  const present = entries.filter((e) => e.attendance === 'present').length
  const absent = entries.filter((e) => e.attendance === 'absent').length
  const unknown = entries.filter((e) => !e.attendance || e.attendance === 'unknown').length
  const classes = new Set(entries.map((e) => e.class_name)).size
  eodSummary.textContent = `Classes ${classes} • Swimmers ${total} • Present ${present} • Absent ${absent} • Unknown ${unknown}`
}

async function checkAutoAdvance() {
  if (state.view !== 'roster') return
  if (!state.selectedBlock || !state.date) return
  const tz = 'America/New_York'
  const classes = Array.isArray(state.classInstances) ? state.classInstances : []
  const current = classes.find((c) => c.start_time == state.selectedBlock)
  if (!current || !current.end_time) return
  const end = parseDateTimeInTz(state.date, current.end_time, tz)
  const threshold = new Date(end.getTime() - 3 * 60 * 1000)
  const now = nowInTimezone(tz)
  if (now >= threshold) {
    const idx = classes.findIndex((c) => c.start_time == state.selectedBlock)
    const next = classes[idx + 1]
    if (next) {
      state.manualOverride = false
      state.selectedBlock = next.start_time
      buildTimeBlocks()
      applyFilters()
    } else {
      if (timeActive) timeActive.textContent = 'End of day. Thank you.'
    }
  }
}

setInterval(checkAutoAdvance, 60000)

async function loadRosterEntries() {
  if (!state.locationId || !state.date) {
    state.rosterEntries = []
    state.filteredEntries = []
    if (rosterTable) rosterTable.innerHTML = ''
    if (rosterEmpty) {
      rosterEmpty.textContent = 'Select a location and date to load roster.'
      rosterEmpty.classList.remove('hidden')
    }
    return
  }
  const endpoint = state.rosterMode === 'mine' ? '/roster-entries/mine' : '/roster-entries'
  try {
    const data = await apiFetch(`${endpoint}?locationId=${state.locationId}&date=${state.date}`)
    state.rosterEntries = data.entries || []
  } catch (err) {
    state.rosterEntries = []
    if (rosterEmpty) {
      const msg = err?.error === 'locationId_and_date_required'
        ? 'Select a location and date to load roster.'
        : (err?.error || 'Failed to load roster.')
      rosterEmpty.textContent = msg
      rosterEmpty.classList.remove('hidden')
    }
  }
  await loadClassInstances()
  buildTimeBlocks()
  buildInstructorFilter()
  applyFilters()
  renderReports()
}

function nowInTimezone(tz) {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
}

function parseDateTimeInTz(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10))
  const [hh, mm] = timeStr.split(':').map((v) => parseInt(v, 10))
  const utc = new Date(Date.UTC(y, m - 1, d, hh, mm, 0))
  const local = new Date(utc.toLocaleString('en-US', { timeZone: tz }))
  return local
}

function getSelectedClassInstance() {
  const classes = Array.isArray(state.classInstances) ? state.classInstances : []
  if (!classes.length) return null
  const match = classes.find((c) => c.start_time === state.selectedBlock)
  return match || classes[0] || null
}

function updateClassNoteButton() {
  if (!classNoteBtn) return
  const cls = getSelectedClassInstance()
  classNoteBtn.disabled = !cls
}

function buildTimeBlocks() {
  if (state.locationId === 'all') {
    if (timeActive) timeActive.textContent = 'Global view: time blocks disabled.'
    if (timeBlocks) timeBlocks.classList.add('hidden')
    return
  }
  const classes = Array.isArray(state.classInstances) ? state.classInstances : []
  const times = classes.map((c) => c.start_time).filter(Boolean)
  if (!times.length) {
    if (timeActive) timeActive.textContent = 'No classes today.'
    if (timeBlocks) timeBlocks.classList.add('hidden')
    return
  }
  const tz = 'America/New_York'
  const now = nowInTimezone(tz)

  // Determine active class
  let active = classes.find((c) => {
    if (!c.start_time || !c.end_time) return false
    const start = parseDateTimeInTz(state.date, c.start_time, tz)
    const end = parseDateTimeInTz(state.date, c.end_time, tz)
    return now >= start && now <= end
  })
  if (!active) {
    active = classes.find((c) => {
      const start = parseDateTimeInTz(state.date, c.start_time, tz)
      return start >= now
    }) || classes[classes.length - 1]
  }

  if (state.manualOverride && state.selectedBlock) {
    active = classes.find((c) => c.start_time == state.selectedBlock) || active
  }

  state.selectedBlock = active ? active.start_time : null

  if (timeActive) {
    const endLabel = active?.end_time ? formatTime(active.end_time) : ''
    const startLabel = active?.start_time ? formatTime(active.start_time) : ''
    const label = startLabel ? `${startLabel}${endLabel && '–' + endLabel}` : ''
    timeActive.textContent = `${label}${active?.class_name ? ' • ' + active.class_name : ''}` || 'No classes today.'
  }

  timeBlocks.innerHTML = ''
  classes.forEach((c) => {
    const btn = document.createElement('button')
    btn.textContent = `${formatTime(c.start_time)} ${c.class_name || ''}`
    btn.classList.toggle('active', c.start_time == state.selectedBlock)
    btn.addEventListener('click', () => {
      state.manualOverride = true
      state.selectedBlock = c.start_time
      buildTimeBlocks()
      applyFilters()
    })
    timeBlocks.appendChild(btn)
  })
  if (timeBlockToggle) timeBlockToggle.textContent = timeBlocks.classList.contains('hidden') ? 'All times' : 'Hide times'
}



async function loadAdminUsers() {
  const role = getEffectiveRoleKey()
  if (role !== 'admin') {
    if (userAdminCard) userAdminCard.classList.add('hidden')
    return
  }
  if (userAdminCard) userAdminCard.classList.remove('hidden')

  try {
    const data = await apiFetch('/admin/users')
    state.adminUsers = Array.isArray(data.users) ? data.users : []
    populateActivityUserList()
    renderAdminUsers()
  } catch (err) {
    if (userAdminStatus) userAdminStatus.textContent = err?.error || 'Failed to load users.'
  }
}

function renderAdminUsers() {
  if (!userAdminList) return
  userAdminList.innerHTML = ''
  const locations = Array.isArray(state.locations) ? state.locations : []
  const users = Array.isArray(state.adminUsers) ? state.adminUsers : []

  users.forEach((u) => {
    const item = document.createElement('div')
    item.className = 'list-item'

    const header = document.createElement('div')
    header.innerHTML = `<strong>${u.first_name || ''} ${u.last_name || ''}</strong> <span class="muted tiny">(${u.username})</span>`
    item.appendChild(header)

    const roleRow = document.createElement('div')
    roleRow.className = 'row'
    const roleSelect = document.createElement('select')
    ;['admin','manager','instructor','readonly'].forEach((rk) => {
      const opt = document.createElement('option')
      opt.value = rk
      opt.textContent = rk
      roleSelect.appendChild(opt)
    })
    roleSelect.value = (u.roles && u.roles[0]) ? u.roles[0] : 'readonly'

    const activeLabel = document.createElement('label')
    activeLabel.className = 'tiny inline'
    const activeCb = document.createElement('input')
    activeCb.type = 'checkbox'
    activeCb.checked = Boolean(u.is_active)
    activeLabel.appendChild(activeCb)
    const activeText = document.createElement('span')
    activeText.textContent = 'Active'
    activeLabel.appendChild(activeText)

    const disabledLabel = document.createElement('label')
    disabledLabel.className = 'tiny inline'
    const disabledCb = document.createElement('input')
    disabledCb.type = 'checkbox'
    disabledCb.checked = Boolean(u.is_disabled)
    disabledLabel.appendChild(disabledCb)
    const disabledText = document.createElement('span')
    disabledText.textContent = 'Disabled'
    disabledLabel.appendChild(disabledText)

    roleRow.appendChild(roleSelect)
    roleRow.appendChild(activeLabel)
    roleRow.appendChild(disabledLabel)
    item.appendChild(roleRow)

    const locRow = document.createElement('div')
    locRow.className = 'row'
    const locContainer = document.createElement('div')
    locContainer.className = 'row'
    const selected = Array.isArray(u.locations) ? u.locations.map((l) => l.location_id) : []
    locations.forEach((loc) => {
      const label = document.createElement('label')
      label.className = 'tiny inline'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.value = loc.id
      cb.checked = selected.includes(loc.id)
      label.appendChild(cb)
      const span = document.createElement('span')
      span.textContent = loc.name
      label.appendChild(span)
      locContainer.appendChild(label)
    })
    locRow.appendChild(locContainer)
    item.appendChild(locRow)

    const actions = document.createElement('div')
    actions.className = 'row'
    const saveBtn = document.createElement('button')
    saveBtn.className = 'secondary miniBtn'
    saveBtn.textContent = 'Save'
    const resetBtn = document.createElement('button')
    resetBtn.className = 'secondary miniBtn'
    resetBtn.textContent = 'Reset PIN'
    const status = document.createElement('span')
    status.className = 'muted tiny'

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving…'
      try {
        const locationIds = Array.from(locContainer.querySelectorAll('input[type=checkbox]'))
          .filter((i) => i.checked)
          .map((i) => i.value)
        await apiFetch(`/admin/users/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            roleKey: roleSelect.value,
            locationIds,
            isActive: activeCb.checked,
            isDisabled: disabledCb.checked
          })
        })
        status.textContent = 'Saved ✓'
      } catch (err) {
        status.textContent = err?.error || 'Save failed'
      }
    })

    resetBtn.addEventListener('click', async () => {
      status.textContent = 'Resetting…'
      try {
        await apiFetch(`/admin/users/${u.id}/reset-pin`, { method: 'POST' })
        status.textContent = 'PIN reset to default'
      } catch (err) {
        status.textContent = err?.error || 'Reset failed'
      }
    })

    actions.appendChild(saveBtn)
    actions.appendChild(resetBtn)
    actions.appendChild(status)
    item.appendChild(actions)

    userAdminList.appendChild(item)
  })
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
  const swimmers = Array.isArray(state.observationSwimmers) ? state.observationSwimmers : []
  obsSwimmerList.innerHTML = ''
  if (!swimmers.length) {
    obsSwimmerList.innerHTML = '<div class="hint">No swimmers yet. Add manually or load roster.</div>'
    return
  }
  swimmers.forEach((swimmer, idx) => {
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
  if (!state.locationId || state.locationId === 'all') {
    if (obsRosterStatus) obsRosterStatus.textContent = 'Select a specific location to load classes.'
    return
  }
  const dateVal = obsDate.value || new Date().toISOString().slice(0, 10)
  obsDate.value = dateVal
  obsRosterStatus.textContent = 'Loading roster classes…'
  try {
    const data = await apiFetch(`/class-instances?locationId=${state.locationId}&date=${dateVal}`)
    state.observationRoster = Array.isArray(data.classes) ? data.classes : []
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
  if (state.locationId === 'all') {
    obsRosterStatus.textContent = 'Select a specific location to load roster.'
    return
  }
  const classId = obsClassSelect.value
  if (!classId) {
    obsRosterStatus.textContent = 'Select a class first.'
    return
  }
  const roster = Array.isArray(state.observationRoster) ? state.observationRoster : []
  const cls = roster.find((c) => c.id === classId)
  if (!cls) return

  obsRosterStatus.textContent = 'Loading roster swimmers…'
  try {
    const data = await apiFetch(`/roster-entries?locationId=${state.locationId}&date=${cls.class_date}`)
    const swimmers = (data.entries || []).filter((e) => e.start_time === cls.start_time)
    state.observationSwimmers = swimmers.map((s) => ({ name: s.swimmer_name, scores: {}, notes: '' }))
    renderObservationSwimmers()

    const scheduled = cls.scheduled_instructor || ''
    const actual = cls.actual_instructor || ''
    const isSub = Boolean(cls.is_sub) && actual && scheduled && actual !== scheduled
    if (!obsInstructorOverride?.checked) {
      obsInstructor.value = actual || scheduled || ''
    }
    if (obsInstructorMeta) {
      obsInstructorMeta.textContent = isSub ? `Subbing for ${scheduled}` : scheduled ? `Scheduled: ${scheduled}` : ''
    }
    applyInstructorOverride()

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
    const observations = Array.isArray(data.observations) ? data.observations : []
    obsDashboardList.innerHTML = ''
    if (!observations.length) {
      obsDashboardList.innerHTML = '<div class="hint">No observations yet.</div>'
      return
    }
    observations.forEach((obs) => {
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

function setRosterStatus(textValue) {
  if (!rosterSaveStatus) return
  rosterSaveStatus.textContent = textValue || ''
}

function renderRoster() {
  if (state.view !== 'roster') return
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
    presentBtn.addEventListener('click', () => updateAttendance(entry.id, entry.attendance === 1 ? null : 1))

    const absentBtn = document.createElement('button')
    absentBtn.textContent = '❌'
    absentBtn.classList.toggle('active', entry.attendance === 0)
    absentBtn.addEventListener('click', () => updateAttendance(entry.id, entry.attendance === 0 ? null : 0))

    attendanceWrap.appendChild(presentBtn)
    attendanceWrap.appendChild(absentBtn)
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
    const locationBadge = entry.location_name ? `<span class="flag-chip">${entry.location_name}</span>` : ''
    swimmerCell.innerHTML = `<div><strong>${entry.swimmer_name || ''}</strong></div><div>${flagHtml}${localBadge}${locationBadge}</div>`

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
    const actual = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || ''
    const scheduled = entry.scheduled_instructor || ''
    const isSub = entry.is_sub && scheduled && actual && actual !== scheduled
    instructorCell.innerHTML = isSub
      ? `<div><strong>${actual}</strong></div><div class="muted tiny">Scheduled: ${scheduled}</div>`
      : `<div><strong>${actual}</strong></div>`

    const zoneCell = document.createElement('td')
    zoneCell.dataset.label = 'Zone'
    zoneCell.textContent = entry.zone ? String(entry.zone) : '—'

    const actionCell = document.createElement('td')
    actionCell.dataset.label = 'Action'
    const noteBtn = document.createElement('button')
    noteBtn.className = 'secondary miniBtn'
    noteBtn.textContent = '+ Note'
    noteBtn.addEventListener('click', () => openRosterNote(entry.id))
    actionCell.appendChild(noteBtn)

    if (entry.instructor_staff_id) {
      const instrNoteBtn = document.createElement('button')
      instrNoteBtn.className = 'secondary miniBtn'
      instrNoteBtn.textContent = 'Instructor Note'
      instrNoteBtn.addEventListener('click', () => openEntityNote('instructor', entry.instructor_staff_id))
      actionCell.appendChild(instrNoteBtn)
    }

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
  setRosterStatus('Saving…')
  if (entry?.local_only) {
    entry.attendance = attendance
    applyFilters()
    setRosterStatus('Saved ✓')
    setTimeout(() => setRosterStatus(''), 1200)
    return
  }
  try {
    await apiFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify({ rosterEntryId, attendance })
    })
    if (entry) entry.attendance = attendance
    applyFilters()
    setRosterStatus('Saved ✓')
    setTimeout(() => setRosterStatus(''), 1200)
  } catch (err) {
    setRosterStatus('Save failed')
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



async function loadDayClosure() {
  if (!state.locationId || !state.date) return
  if (getEffectiveRoleKey() === 'readonly') return
  try {
    const data = await apiFetch(`/closures?locationId=${state.locationId}&date=${state.date}`)
    const closure = data.closure
    if (eodStatus) {
      eodStatus.textContent = closure && !closure.reopened_at ? 'Day is closed.' : 'Day is open.'
    }
  } catch (err) {
    if (eodStatus) eodStatus.textContent = err?.error || 'Failed to load closure.'
  }
}

async function closeDay() {
  if (!state.locationId || !state.date) return
  if (eodStatus) eodStatus.textContent = 'Closing day…'
  try {
    await apiFetch('/closures', { method: 'POST', body: JSON.stringify({ locationId: state.locationId, date: state.date }) })
    if (eodStatus) eodStatus.textContent = 'Day closed.'
  } catch (err) {
    if (eodStatus) eodStatus.textContent = err?.error || 'Close failed.'
  }
}

async function reopenDay() {
  if (!state.locationId || !state.date) return
  if (eodStatus) eodStatus.textContent = 'Reopening…'
  try {
    await apiFetch('/closures/reopen', { method: 'POST', body: JSON.stringify({ locationId: state.locationId, date: state.date }) })
    if (eodStatus) eodStatus.textContent = 'Day reopened.'
  } catch (err) {
    if (eodStatus) eodStatus.textContent = err?.error || 'Reopen failed.'
  }
}

async function refreshAlerts() {
  if (!state.locationId) return
  try {
    await apiFetch('/admin/data-quality/run', { method: 'POST', body: JSON.stringify({ locationId: state.locationId, date: state.date }) })
    const data = await apiFetch(`/alerts?locationId=${state.locationId}`)
    renderAlerts(data.alerts || [])
  } catch (err) {
    if (eodAlerts) eodAlerts.innerHTML = `<div class="hint">${err?.error || 'Failed to load alerts.'}</div>`
  }
}

async function resolveAlert(alertId) {
  if (!alertId) return
  const note = prompt('Resolution note (optional)') || ''
  if (!confirm('Resolve this alert?')) return
  try {
    await apiFetch(`/alerts/${alertId}/resolve`, { method: 'POST', body: JSON.stringify({ note }) })
    refreshAlerts()
  } catch (err) {
    alert(err?.error || 'Failed to resolve alert')
  }
}

function renderAlerts(alerts) {
  if (!eodAlerts) return
  eodAlerts.innerHTML = ''
  const rows = Array.isArray(alerts) ? alerts : []
  if (!rows.length) {
    eodAlerts.innerHTML = '<div class="hint">No unresolved alerts.</div>'
    return
  }
  rows.forEach((a) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    const content = document.createElement('div')
    content.innerHTML = `<strong>${a.type}</strong><div class="muted tiny">${a.message || ''}</div>`
    item.appendChild(content)
    const role = getEffectiveRoleKey()
    if (role == 'admin' || role == 'manager') {
      const btn = document.createElement('button')
      btn.className = 'secondary miniBtn'
      btn.textContent = 'Resolve'
      btn.addEventListener('click', () => resolveAlert(a.id))
      item.appendChild(btn)
    }
    eodAlerts.appendChild(item)
  })
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
  if (!state.locationId || state.locationId === 'all') return
  try {
    const data = await apiFetch(`/analytics/retention?locationId=${state.locationId}`)
    renderRetention(data.summary || [])
  } catch {
    renderRetention([])
  }
}


function applyActivityFilters(filters) {
  if (!filters) return
  if (activityFrom) activityFrom.value = filters.fromDate || ''
  if (activityTo) activityTo.value = filters.toDate || ''
  if (activityFilter) activityFilter.value = filters.eventType || ''
  if (activityUserInput) {
    activityUserInput.value = filters.userLabel || ''
    activityUserInput.dataset.userId = filters.actorUserId || ''
  }
}

function ensureActivityDefaultDates() {
  if (!activityFrom || !activityTo) return
  if (!activityFrom.value && !activityTo.value) {
    const now = new Date()
    activityFrom.value = formatDateInputValue(now)
    activityTo.value = formatDateInputValue(now)
  }
}

function readActivityFilters() {
  const fromDate = activityFrom?.value || ''
  const toDate = activityTo?.value || ''
  const eventType = activityFilter?.value || ''
  const userLabel = activityUserInput?.value || ''
  const actorUserId = (activityUserInput?.dataset || {}).userId || ''
  return { fromDate, toDate, eventType, userLabel, actorUserId }
}

function saveActivityFilters() {
  localStorage.setItem(activityFiltersKey, JSON.stringify(readActivityFilters()))
}

function restoreActivityFilters() {
  const raw = localStorage.getItem(activityFiltersKey)
  if (!raw) return
  try {
    applyActivityFilters(JSON.parse(raw))
    resolveActivityUserId()
  } catch {
    /* no-op */
  }
  ensureActivityDefaultDates()
}

function buildUserLabel(u) {
  const first = (u.first_name || u.firstName || '').trim()
  const last = (u.last_name || u.lastName || '').trim()
  const name = `${first} ${last}`.trim()
  return name || u.username || u.email || 'User'
}

function populateActivityUserList() {
  if (!activityUserList) return
  const users = Array.isArray(state.adminUsers) && state.adminUsers.length
    ? state.adminUsers
    : Array.isArray(state.staff) ? state.staff : []
  activityUserList.innerHTML = ''
  users.forEach((u) => {
    const opt = document.createElement('option')
    opt.value = `${buildUserLabel(u)}${u.username ? ' • ' + u.username : ''}`
    opt.dataset.userId = u.id || u.user_id || ''
    activityUserList.appendChild(opt)
  })
}

function resolveActivityUserId() {
  if (!activityUserInput || !activityUserList) return
  const val = activityUserInput.value || ''
  const escape = window.CSS && CSS.escape ? CSS.escape(val) : val.replace(/\"/g, '\\"')
  const opt = activityUserList.querySelector(`option[value=\"${escape}\"]`)
  activityUserInput.dataset.userId = opt?.dataset?.userId || ''
}

function formatActivityFilterSummary(filters) {
  const parts = []
  if (filters.fromDate || filters.toDate) {
    parts.push(`Dates: ${filters.fromDate || '—'} to ${filters.toDate || '—'}`)
  }
  if (filters.eventType) parts.push(`Type: ${filters.eventType}`)
  if (filters.userLabel) parts.push(`User: ${filters.userLabel}`)
  return parts.length ? parts.join(' • ') : 'No filters'
}

async function loadActivityFeed() {
  if (getEffectiveRoleKey() !== 'admin') return
  ensureActivityDefaultDates()
  resolveActivityUserId()
  if (activityStatus) activityStatus.textContent = 'Loading…'
  if (activityList) activityList.innerHTML = '<div class="hint">Loading activity…</div>'
  const filters = readActivityFilters()
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    if (activityStatus) activityStatus.textContent = 'Start date must be before end date.'
    return
  }
  try {
    const params = new URLSearchParams()
    if (state.locationId) params.set('locationId', state.locationId)
    if (filters.eventType) params.set('eventType', filters.eventType)
    if (filters.fromDate) params.set('from', isoDateStart(filters.fromDate))
    if (filters.toDate) params.set('to', isoDateEnd(filters.toDate))
    if (filters.actorUserId) params.set('actorUserId', filters.actorUserId)
    const data = await apiFetch(`/admin/activity-feed?${params.toString()}`)
    state.activityEvents = Array.isArray(data.events) ? data.events : []
    renderActivityFeed()
    if (activityStatus) activityStatus.textContent = ''
    saveActivityFilters()
  } catch (err) {
    if (activityStatus) activityStatus.textContent = err?.error || 'Failed to load activity.'
    if (activityList) activityList.innerHTML = `<div class="hint">${err?.error || 'Failed to load activity.'}</div>`
  }
}

function renderActivityFeed() {
  if (!activityList) return
  activityList.innerHTML = ''
  const events = Array.isArray(state.activityEvents) ? state.activityEvents : []
  if (!events.length) {
    const summary = formatActivityFilterSummary(readActivityFilters())
    activityList.innerHTML = `<div class="hint">No activity. ${summary}</div>`
    return
  }
  events.forEach((ev) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${ev.event_type}</strong> <span class="muted tiny">${(ev.created_at || '').toString()}</span>`
    activityList.appendChild(item)
  })
}

async function loadNotifications() {
  if (!notificationList) return
  if (!state.locationId || state.locationId === 'all') {
    notificationList.innerHTML = '<div class="hint">Select a specific location to view notifications.</div>'
    return
  }
  notificationList.innerHTML = '<div class="hint">Loading notifications…</div>'
  try {
    const data = await apiFetch(`/notifications?locationId=${state.locationId}`)
    renderNotifications(data.notifications || [])
  } catch (err) {
    notificationList.innerHTML = `<div class="hint">${err?.error || 'Failed to load notifications.'}</div>`
  }
}

function renderNotifications(items) {
  if (!notificationList) return
  notificationList.innerHTML = ''
  if (!items.length) {
    notificationList.innerHTML = '<div class="hint">No notifications yet.</div>'
    return
  }
  items.forEach((n) => {
    const row = document.createElement('div')
    row.className = 'list-item'
    row.innerHTML = `<strong>${n.title || 'Notification'}</strong>
      <div class="muted tiny">${n.message || ''}</div>
      <div class="muted tiny">${n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>`
    notificationList.appendChild(row)
  })
}

function loadSavedViews() {
  try {
    const raw = localStorage.getItem(savedViewsKey)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveSavedViews(list) {
  localStorage.setItem(savedViewsKey, JSON.stringify(list))
}

function getRosterViewState() {
  return {
    locationId: state.locationId,
    date: state.date,
    rosterMode: state.rosterMode,
    selectedBlock: state.selectedBlock,
    instructor: instructorFilter?.value || '',
    search: rosterSearch?.value || '',
    sortBy: sortBy?.value || ''
  }
}

function getActivityViewState() {
  const filters = readActivityFilters()
  return { locationId: state.locationId, ...filters }
}

function renderSavedViews(viewKey) {
  const list = loadSavedViews().filter((v) => v.viewKey == viewKey)
  const container = viewKey == 'activity' ? activitySavedViews : rosterSavedViews
  if (!container) return
  container.innerHTML = ''
  if (!list.length) {
    container.innerHTML = '<div class="hint">No saved views.</div>'
    return
  }
  list.forEach((v) => {
    const row = document.createElement('div')
    row.className = 'list-item'
    const title = document.createElement('div')
    title.innerHTML = `<strong>${v.name}</strong> <span class="muted tiny">${v.locationId ? '• location set' : ''}</span>`
    const actions = document.createElement('div')
    actions.className = 'row'
    const applyBtn = document.createElement('button')
    applyBtn.className = 'secondary miniBtn'
    applyBtn.textContent = 'Apply'
    applyBtn.addEventListener('click', () => applySavedView(v))
    const delBtn = document.createElement('button')
    delBtn.className = 'secondary miniBtn'
    delBtn.textContent = 'Delete'
    delBtn.addEventListener('click', () => {
      const updated = loadSavedViews().filter((x) => x.id != v.id)
      saveSavedViews(updated)
      renderSavedViews(viewKey)
      renderCommandPalette()
    })
    actions.appendChild(applyBtn)
    actions.appendChild(delBtn)
    row.appendChild(title)
    row.appendChild(actions)
    container.appendChild(row)
  })
}

function applySavedView(view) {
  if (view.locationId && view.locationId != state.locationId) {
    state.locationId = view.locationId
    if (locationSelect) locationSelect.value = view.locationId
  }
  if (view.viewKey == 'activity') {
    setView('activity')
    applyActivityFilters(view.filters || {})
    ensureActivityDefaultDates()
    loadActivityFeed()
    return
  }
  if (view.viewKey == 'roster') {
    setView('roster')
    if (view.filters?.date) state.date = view.filters.date
    if (view.filters?.rosterMode) state.rosterMode = view.filters.rosterMode
    if (view.filters?.selectedBlock) state.selectedBlock = view.filters.selectedBlock
    if (sortBy && view.filters?.sortBy) sortBy.value = view.filters.sortBy
    if (instructorFilter && view.filters?.instructor) instructorFilter.value = view.filters.instructor
    if (rosterSearch && view.filters?.search) rosterSearch.value = view.filters.search
    void loadRosterEntries()
  }
}

function saveCurrentView(viewKey) {
  const name = prompt('Name this view')
  if (!name) return
  const list = loadSavedViews()
  const view = {
    id: `${viewKey}-${Date.now()}`,
    name,
    viewKey,
    locationId: state.locationId,
    filters: viewKey == 'activity' ? getActivityViewState() : getRosterViewState()
  }
  list.push(view)
  saveSavedViews(list)
  renderSavedViews(viewKey)
  renderCommandPalette()
}

function renderRetention(summary) {
  const rows = Array.isArray(summary) ? summary : []
  retentionTable.innerHTML = ''
  if (!rows.length) {
    retentionTable.innerHTML = '<div class="hint">No retention data yet.</div>'
    return
  }
  rows.forEach((item) => {
    const latest = item.latest || {}
    const row = document.createElement('div')
    row.className = 'list-item'
    row.innerHTML = `<strong>${item.instructorName}</strong>
      <div class="muted tiny">Latest: ${latest.retention_percent || '—'}% (${latest.ending_headcount || '—'} / ${latest.starting_headcount || '—'})</div>
      <div class="muted tiny">Delta: ${item.retentionDelta === null ? '—' : item.retentionDelta.toFixed(2)}%</div>`
    retentionTable.appendChild(row)
  })
}


let paletteIndex = 0
let paletteItems = []

function buildPaletteCommands() {
  const role = getEffectiveRoleKey()
  const locs = Array.isArray(state.locations) ? state.locations : []
  const commands = []
  const add = (label, action) => commands.push({ label, action })
  add('Roster', () => setView('roster'))
  add('Uploads', () => setView('uploads'))
  add('Reports', () => setView('reports'))
  add('Observations', () => setView('observations'))
  add('Staff', () => setView('staff'))
  add('Intakes', () => setView('intakes'))
  add('Locations', () => setView('locations'))
  if (role == 'admin') add('Activity feed', () => setView('activity'))
  const loc = state.locations.find((l) => l.id === state.locationId)
  const features = getLocationFeatures(loc)
  if (features.announcer_enabled) add('Announcer', () => setView('announcer'))

  add('Roster today', () => { state.date = new Date().toISOString().slice(0,10); void loadRosterEntries(); setView('roster') })

  locs.forEach((loc) => {
    const key = (loc.state || loc.code || '').toString().toUpperCase()
    if (key) {
      add(`Roster ${key} today`, () => {
        state.locationId = loc.id
        if (locationSelect) locationSelect.value = loc.id
        state.date = new Date().toISOString().slice(0,10)
        void loadRosterEntries()
        setView('roster')
      })
    }
  })

  add('Activity feed last 7 days', () => {
    if (role != 'admin') return
    const now = new Date(); const past = new Date(); past.setDate(now.getDate()-6)
    if (activityFrom) activityFrom.value = formatDateInputValue(past)
    if (activityTo) activityTo.value = formatDateInputValue(now)
    setView('activity')
    loadActivityFeed()
  })

  add('Open End of Day Close', () => { setView('roster'); eodCloseCard?.scrollIntoView({ behavior: 'smooth' }) })

  // saved views
  loadSavedViews().forEach((v) => {
    add(`Saved view: ${v.name}`, () => applySavedView(v))
  })

  return commands
}

function renderCommandPalette() {
  if (!commandPaletteList) return
  const query = (commandPaletteInput?.value || '').toLowerCase().trim()
  const all = buildPaletteCommands()
  let filtered = !query ? all : all.filter((c) => c.label.toLowerCase().includes(query))

  if (query.startsWith('instructor:') || query.startsWith('instructor ')) {
    const name = query.replace('instructor:', '').replace('instructor ', '').trim()
    if (name) {
      filtered = filtered.concat([{ label: `Instructor: ${name}`, action: () => { setView('staff'); if (staffSearch) { staffSearch.value = name; renderStaffList() } } }])
    }
  }

  if (query.startsWith('class:') || query.startsWith('class ')) {
    const id = query.replace('class:', '').replace('class ', '').trim()
    if (id) {
      filtered = filtered.concat([{ label: `Class: ${id}`, action: () => { setView('roster'); if (rosterSearch) { rosterSearch.value = id; applyFilters() } } }])
    }
  }

  paletteItems = filtered
  paletteIndex = 0
  commandPaletteList.innerHTML = ''
  if (!filtered.length) {
    commandPaletteList.innerHTML = '<div class="hint">No commands found.</div>'
    return
  }
  filtered.forEach((cmd, idx) => {
    const row = document.createElement('div')
    row.className = 'list-item'
    row.textContent = cmd.label
    row.classList.toggle('active', idx == paletteIndex)
    row.addEventListener('click', () => { cmd.action(); closeCommandPalette() })
    commandPaletteList.appendChild(row)
  })
}

function openCommandPalette() {
  if (!commandPaletteModal || !commandPaletteInput) return
  if (appPanel && appPanel.classList.contains('hidden')) return
  commandPaletteModal.classList.remove('hidden')
  commandPaletteModal.style.pointerEvents = 'auto'
  commandPaletteInput.value = ''
  renderCommandPalette()
  commandPaletteInput.focus()
}

function closeCommandPalette() {
  if (!commandPaletteModal) return
  commandPaletteModal.classList.add('hidden')
  commandPaletteModal.style.pointerEvents = 'none'
}

function getRosterNoteKey(entryId) {
  return `roster_note_${entryId}`
}


async function openEntityNote(entityType, entityId) {
  state.noteEntityType = entityType
  state.noteEntityId = entityId
  state.rosterNoteEntryId = null
  rosterNoteText.value = ''
  if (sspStatus) sspStatus.textContent = ''
  rosterNoteModal.classList.remove('hidden')
  rosterNoteModal.style.pointerEvents = 'auto'
  try {
    const data = await apiFetch(`/notes?entityType=${entityType}&entityId=${entityId}&locationId=${state.locationId}`)
    const noteObj = (data.notes && data.notes[0]) ? data.notes[0] : null
    const note = noteObj ? noteObj.note : ''
    rosterNoteText.value = note || ''
    if (noteInternalToggle) noteInternalToggle.checked = noteObj ? !!noteObj.is_internal : true
  } catch {
    // no-op
  }
}

function openRosterNote(entryId) {
  state.rosterNoteEntryId = entryId
  openEntityNote('roster_entry', entryId)
}

function closeRosterNote() {
  rosterNoteModal.classList.add('hidden')
  state.rosterNoteEntryId = null
  state.noteEntityId = null
}

async function saveRosterNote() {
  const entryId = state.noteEntityId || state.rosterNoteEntryId
  if (!entryId) return
  const value = rosterNoteText.value || ''
  const isInternal = noteInternalToggle ? !!noteInternalToggle.checked : true
  try {
    await apiFetch('/notes', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        entityType: state.noteEntityType || 'roster_entry',
        entityId: entryId,
        note: value,
        isInternal
      })
    })
  } catch {
    localStorage.setItem(getRosterNoteKey(entryId), value)
  }
  closeRosterNote()
  renderRoster()
}

function clearRosterNote() {
  const entryId = state.noteEntityId || state.rosterNoteEntryId
  if (!entryId) return
  localStorage.removeItem(getRosterNoteKey(entryId))
  rosterNoteText.value = ''
  renderRoster()
}

async function markSspPassed() {
  const entryId = state.noteEntityId || state.rosterNoteEntryId
  if (!entryId || !state.locationId) return
  if (sspStatus) sspStatus.textContent = 'Saving SSP…'
  try {
    const cls = getSelectedClassInstance()
    const data = await apiFetch('/ssp/pass', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        rosterEntryId: entryId,
        classInstanceId: cls?.id || null
      })
    })
    if (sspStatus) sspStatus.textContent = 'SSP recorded ✓'
    const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    const entry = rosterEntries.find((r) => r.id === entryId)
    if (entry) entry.ssp_passed = true
    renderRoster()
    loadNotifications()
  } catch (err) {
    if (sspStatus) sspStatus.textContent = err?.error || 'SSP failed'
  }
}

async function loadLineage() {
  if (!lineageClassId || !lineageOutput) return
  const id = (lineageClassId.value || '').trim()
  if (!id) return
  lineageOutput.textContent = 'Loading…'
  try {
    const data = await apiFetch(`/admin/lineage?classInstanceId=${encodeURIComponent(id)}`)
    lineageOutput.textContent = JSON.stringify(data, null, 2)
  } catch (err) {
    lineageOutput.textContent = err?.error || 'Failed to load lineage.'
  }
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
  if (!state.locationId || state.locationId === 'all') {
    if (uploadList) uploadList.innerHTML = '<div class="hint">Select a specific location to view uploads.</div>'
    return
  }
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
  if (!state.locationId || state.locationId === 'all') {
    if (staffList) staffList.innerHTML = '<div class="hint">Select a specific location to view staff.</div>'
    return
  }
  const data = await apiFetch(`/staff?locationId=${state.locationId}`)
  state.staff = data.staff || []
  populateActivityUserList()
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
  if (!state.locationId || state.locationId === 'all') {
    if (instructorVariants) instructorVariants.innerHTML = '<div class="hint">Select a specific location to view variants.</div>'
    return
  }
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
      void loadRosterEntries()
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
  const locations = Array.isArray(state.locations) ? state.locations : []
  locationAdminList.innerHTML = ''
  locations.forEach((loc) => {
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
    setLoggedOut()
  }
})

logoutBtn.addEventListener('click', () => {
  setLoggedOut()
})

locationSelect.addEventListener('change', () => {
  state.locationId = locationSelect.value
  if (state.locationId) localStorage.setItem(locationPrefKey, state.locationId)
  state.manualOverride = false
  state.selectedBlock = null
  if (state.locationId === 'all') {
    state.rosterMode = 'all'
    if (rosterModeSelect) {
      rosterModeSelect.value = 'all'
      rosterModeSelect.disabled = true
    }
  } else if (rosterModeSelect) {
    rosterModeSelect.disabled = false
  }
  applyLocationFeatures()
  applyInternalTools()
  updateContext()
  renderSavedViews('roster')
  renderSavedViews('activity')

  void loadRosterEntries()
  if (state.locationId !== 'all') {
    loadUploads()
    loadStaff()
    loadInstructorVariants()
    loadDayClosure()
    refreshAlerts()
  }
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
  state.manualOverride = false
  state.selectedBlock = null
  void loadRosterEntries()
  loadDayClosure()
  refreshAlerts()
})

rosterModeSelect?.addEventListener('change', () => {
  if (rosterModeSelect.value === 'mine' && state.locationId === 'all') {
    rosterModeSelect.value = 'all'
    return
  }
  setRosterMode(rosterModeSelect.value)
})

todayBtn?.addEventListener('click', () => {
  const today = new Date().toISOString().slice(0, 10)
  state.date = today
  if (dateSelect) dateSelect.value = today
  updateContext()
  void loadRosterEntries()
})

rosterSearch?.addEventListener('input', () => {
  state.search = rosterSearch.value
  searchClear.classList.toggle('hidden', !state.search)
  applyFilters()
})

searchClear?.addEventListener('click', () => {
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

sortBy?.addEventListener('change', () => {
  state.sortBy = sortBy.value
  applyFilters()
})

instructorFilter?.addEventListener('change', () => {
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
sspPassBtn?.addEventListener('click', markSspPassed)
rosterNoteModal?.addEventListener('click', (e) => { if (e.target === rosterNoteModal) closeRosterNote() })
addSwimmerModal?.addEventListener('click', (e) => { if (e.target === addSwimmerModal) closeAddSwimmer() })
obsFormTab?.addEventListener('click', () => setObsTab('form'))
obsDashTab?.addEventListener('click', () => { setObsTab('dashboard'); loadObservationDashboard() })
obsLoadRosterBtn?.addEventListener('click', () => { loadObservationClasses(); loadObservationSwimmersFromRoster() })
obsInstructorOverride?.addEventListener('change', applyInstructorOverride)
obsClassSelect?.addEventListener('change', () => {
  state.observationSwimmers = []
  renderObservationSwimmers()
  obsRosterStatus.textContent = 'Loading roster swimmers…'
  scheduleObservationLoad()
})
obsAddSwimmer?.addEventListener('click', () => { state.observationSwimmers.push({ name: 'New swimmer', scores: {}, notes: '' }); renderObservationSwimmers() })
obsSaveBtn?.addEventListener('click', saveObservation)
obsResetBtn?.addEventListener('click', () => { state.observationSwimmers = []; obsNotes.value = ''; renderObservationSwimmers(); obsSaveStatus.textContent = '' })
obsRefreshBtn?.addEventListener('click', loadObservationDashboard)
activityRefresh?.addEventListener('click', loadActivityFeed)
activityFilter?.addEventListener('change', loadActivityFeed)
activityFrom?.addEventListener('change', loadActivityFeed)
activityTo?.addEventListener('change', loadActivityFeed)
notificationsRefresh?.addEventListener('click', loadNotifications)
uploadForm?.addEventListener('submit', (e) => { e.preventDefault(); openUploadConfirm() })
activityClear?.addEventListener('click', () => {
  if (activityFrom) activityFrom.value = ''
  if (activityTo) activityTo.value = ''
  if (activityFilter) activityFilter.value = ''
  if (activityUserInput) { activityUserInput.value = ''; activityUserInput.dataset.userId = '' }
  localStorage.removeItem(activityFiltersKey)
  ensureActivityDefaultDates()
  loadActivityFeed()
})
activityPresetToday?.addEventListener('click', () => {
  const now = new Date()
  if (activityFrom) activityFrom.value = formatDateInputValue(now)
  if (activityTo) activityTo.value = formatDateInputValue(now)
  loadActivityFeed()
})
activityPreset7?.addEventListener('click', () => {
  const now = new Date()
  const past = new Date()
  past.setDate(now.getDate() - 6)
  if (activityFrom) activityFrom.value = formatDateInputValue(past)
  if (activityTo) activityTo.value = formatDateInputValue(now)
  loadActivityFeed()
})
activityPresetWeek?.addEventListener('click', () => {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day == 0 ? -6 : 1)
  const start = new Date(now.setDate(diff))
  const end = new Date()
  if (activityFrom) activityFrom.value = formatDateInputValue(start)
  if (activityTo) activityTo.value = formatDateInputValue(end)
  loadActivityFeed()
})
activityUserInput?.addEventListener('input', () => {
  resolveActivityUserId()
})
activityUserInput?.addEventListener('change', () => {
  resolveActivityUserId()
  loadActivityFeed()
})
activityFrom?.addEventListener('change', loadActivityFeed)
activityTo?.addEventListener('change', loadActivityFeed)
timeBlockToggle?.addEventListener('click', () => {
  if (!timeBlocks) return
  timeBlocks.classList.toggle('hidden')
  if (timeBlockToggle) timeBlockToggle.textContent = timeBlocks.classList.contains('hidden') ? 'All times' : 'Hide times'
})
timeActive?.addEventListener('click', () => {
  if (!timeBlocks) return
  timeBlocks.classList.toggle('hidden')
  if (timeBlockToggle) timeBlockToggle.textContent = timeBlocks.classList.contains('hidden') ? 'All times' : 'Hide times'
})

 eodRefresh?.addEventListener('click', () => { refreshAlerts(); loadDayClosure() })
eodCloseBtn?.addEventListener('click', closeDay)
eodReopenBtn?.addEventListener('click', reopenDay)
printRosterBtn?.addEventListener('click', () => triggerPrint('Roster'))
printRetentionBtn?.addEventListener('click', () => triggerPrint('Retention'))
printIntakeBtn?.addEventListener('click', () => triggerPrint('Intakes'))
uploadConfirmBtn?.addEventListener('click', openUploadConfirm)
uploadConfirmClose?.addEventListener('click', closeUploadConfirm)
uploadConfirmRun?.addEventListener('click', runUploadConfirm)

classNoteBtn?.addEventListener('click', () => {
  const cls = getSelectedClassInstance()
  if (cls && cls.id) openEntityNote('class_instance', cls.id)
})


let pendingUploadFile = null
let pendingUploadHash = null
let uploadStatusTarget = null

function getRosterUploadFile() {
  uploadStatusTarget = null
  if (rosterFile?.files?.[0]) {
    uploadStatusTarget = rosterUploadStatus
    return rosterFile.files[0]
  }
  if (uploadRosterFile?.files?.[0]) {
    uploadStatusTarget = uploadStatusUploads
    return uploadRosterFile.files[0]
  }
  return null
}

function setUploadStatus(textValue) {
  if (uploadStatusTarget) uploadStatusTarget.textContent = textValue || ''
}

async function openUploadConfirm() {
  if (!state.locationId || state.locationId === 'all') {
    if (rosterUploadStatus) rosterUploadStatus.textContent = 'Select a specific location to upload.'
    if (uploadStatusUploads) uploadStatusUploads.textContent = 'Select a specific location to upload.'
    return
  }
  const file = getRosterUploadFile()
  if (!file) {
    if (rosterUploadStatus) rosterUploadStatus.textContent = 'Select a roster file first.'
    if (uploadStatusUploads) uploadStatusUploads.textContent = 'Select a roster file first.'
    return
  }
  pendingUploadFile = file
  setUploadStatus('Preflighting…')
  try {
    const formData = new FormData()
    formData.append('file', file)
    const data = await apiFetch(`/uploads/roster/preflight?locationId=${state.locationId}&date=${state.date}`, {
      method: 'POST',
      body: formData
    })
    pendingUploadHash = data.hash
    if (uploadConfirmSummary) {
      uploadConfirmSummary.textContent = `Location: ${data.locationName || ''}
Classes: ${data.classCount || 0}
Swimmers: ${data.swimmerCount || 0}
Date range: ${data.dateStart || ''} to ${data.dateEnd || ''}`
    }
    if (data.isDuplicate && uploadConfirmSummary) {
      uploadConfirmSummary.textContent += '\nDuplicate detected: this file was already uploaded.'
    }
    if (uploadConfirmRun) uploadConfirmRun.disabled = !!data.isDuplicate
    uploadConfirmModal.classList.remove('hidden')
    uploadConfirmModal.style.pointerEvents = 'auto'
  } catch (err) {
    setUploadStatus(err?.error || 'Preflight failed')
  }
}

async function runUploadConfirm() {
  if (!pendingUploadFile) return
  setUploadStatus('Uploading…')
  try {
    const formData = new FormData()
    formData.append('file', pendingUploadFile)
    const data = await apiFetch(`/uploads/roster?locationId=${state.locationId}&date=${state.date}`, {
      method: 'POST',
      body: formData
    })
    setUploadStatus(`Upload complete. Classes: ${data.classesInserted}, Swimmers: ${data.swimmersInserted}`)
    if (rosterFile) rosterFile.value = ''
    if (uploadRosterFile) uploadRosterFile.value = ''
    await loadUploads()
    await loadRosterEntries()
    closeUploadConfirm()
  } catch (err) {
    setUploadStatus(err?.error || 'Upload failed')
  }
}

function closeUploadConfirm() {
  if (!uploadConfirmModal) return
  uploadConfirmModal.classList.add('hidden')
  uploadConfirmModal.style.pointerEvents = 'none'
  if (uploadConfirmRun) uploadConfirmRun.disabled = false
}

document.querySelectorAll('.navItem').forEach((tab) => {
  tab.addEventListener('click', () => {
    setView(tab.dataset.view)
    closeNavDrawer()
    if (tab.dataset.view === 'uploads') loadUploads()
    if (tab.dataset.view === 'reports') { renderReports(); loadRetentionAnalytics() }
    if (tab.dataset.view === 'observations') { setObsTab('form'); loadObservationClasses(); renderObservationSwimmers() }
    if (tab.dataset.view === 'activity') loadActivityFeed()
    if (tab.dataset.view === 'staff') { loadStaff(); loadInstructorVariants() }
    if (tab.dataset.view === 'intakes') loadIntakes()
    if (tab.dataset.view === 'locations') renderLocationAdmin()
    if (tab.dataset.view === 'notifications') loadNotifications()
  })
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
revBtn?.addEventListener('click', () => { void showRevModal() })
revClose.addEventListener('click', hideRevModal)
revModal.addEventListener('click', (e) => { if (e.target === revModal) hideRevModal() })
userAdminCreate?.addEventListener('click', async () => {
  if (!userAdminFirst || !userAdminLast || !userAdminUsername || !userAdminRole) return
  const locationIds = getSelectedAdminLocations(userAdminLocations)
  if (userAdminStatus) userAdminStatus.textContent = 'Creating…'
  try {
    await apiFetch('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        firstName: userAdminFirst.value,
        lastName: userAdminLast.value,
        username: userAdminUsername.value,
        roleKey: userAdminRole.value,
        locationIds
      })
    })
    userAdminFirst.value = ''
    userAdminLast.value = ''
    userAdminUsername.value = ''
    if (userAdminStatus) userAdminStatus.textContent = 'User created (default PIN 1234).'
    await loadAdminUsers()
  } catch (err) {
    if (userAdminStatus) userAdminStatus.textContent = err?.error || 'Create failed.'
  }
})
qaRoleSelect?.addEventListener('change', () => {
  const val = qaRoleSelect.value
  if (val) localStorage.setItem(qaRolePrefKey, val)
  else localStorage.removeItem(qaRolePrefKey)
  applyLocationFeatures()
  applyInternalTools()
  updateContext()
  renderSavedViews('roster')
  renderSavedViews('activity')

})
qaLayoutSelect?.addEventListener('change', () => {
  const val = qaLayoutSelect.value || 'auto'
  localStorage.setItem(layoutPrefKey, val)
  applyLayoutMode()
})
burgerBtn?.addEventListener('click', openNavDrawer)
navCloseBtn?.addEventListener('click', closeNavDrawer)
navOverlay?.addEventListener('click', closeNavDrawer)
gearBtn?.addEventListener('click', openGearMenu)
gearCloseBtn?.addEventListener('click', closeGearMenu)

qaInternalToggle?.addEventListener('change', () => {
  localStorage.setItem(internalToolsKey, qaInternalToggle.checked ? 'true' : 'false')
  applyInternalTools()
})
commandPaletteBtn?.addEventListener('click', openCommandPalette)
commandPaletteClose?.addEventListener('click', closeCommandPalette)
rosterSaveViewBtn?.addEventListener('click', () => saveCurrentView('roster'))
activitySaveViewBtn?.addEventListener('click', () => saveCurrentView('activity'))
lineageLoadBtn?.addEventListener('click', loadLineage)

qaResetBtn?.addEventListener('click', () => {
  localStorage.removeItem(layoutPrefKey)
  localStorage.removeItem(locationPrefKey)
  localStorage.removeItem(qaRolePrefKey)
  localStorage.removeItem(savedViewsKey)
  localStorage.removeItem(activityFiltersKey)
  localStorage.removeItem(internalToolsKey)
  window.location.reload()
})
tourSkip?.addEventListener('click', () => {
  if (tourDontShow?.checked && tourKey) localStorage.setItem(tourKey, 'done')
  closeTour()
})
tourNext?.addEventListener('click', () => {
  const roleKey = getEffectiveRoleKey()
  const viewKey = state.view
  const steps = (tourSteps[roleKey] && tourSteps[roleKey][viewKey]) || null
  if (!steps) return closeTour()
  if (tourIndex >= steps.length - 1) {
    if (tourKey) localStorage.setItem(tourKey, 'done')
    closeTour()
    return
  }
  tourIndex += 1
  renderTourStep(steps)
})
document.addEventListener('keydown', (e) => {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  if ((isMac && e.metaKey && e.key.toLowerCase() == 'k') || (!isMac && e.ctrlKey && e.key.toLowerCase() == 'k')) {
    e.preventDefault()
    openCommandPalette()
  }
  if (e.key == 'Escape') {
    closeCommandPalette()
  }
})

document.addEventListener('DOMContentLoaded', () => {
  hideRevModal()
  hideChangePinModal()
  restoreActivityFilters()
  ensureActivityDefaultDates()
  renderSavedViews('roster')
  renderSavedViews('activity')
})
commandPaletteInput?.addEventListener('input', renderCommandPalette)
commandPaletteInput?.addEventListener('keydown', (e) => {
  if (!paletteItems.length) return
  if (e.key == 'ArrowDown') {
    e.preventDefault(); paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1); renderCommandPalette()
  } else if (e.key == 'ArrowUp') {
    e.preventDefault(); paletteIndex = Math.max(paletteIndex - 1, 0); renderCommandPalette()
  } else if (e.key == 'Enter') {
    e.preventDefault(); const cmd = paletteItems[paletteIndex]; if (cmd) { cmd.action(); closeCommandPalette() }
  }
})

changePinSave?.addEventListener('click', async () => {
  if (!changePinNew || !changePinConfirm) return
  if (changePinNew.value !== changePinConfirm.value) {
    if (changePinStatus) changePinStatus.textContent = 'PINs do not match.'
    return
  }
  if (changePinStatus) changePinStatus.textContent = 'Saving…'
  try {
    await apiFetch('/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ newPin: changePinNew.value })
    })
    if (state.user) state.user.mustChangePin = false
    if (changePinStatus) changePinStatus.textContent = 'Saved ✓'
    hideChangePinModal()
  } catch (err) {
    if (changePinStatus) changePinStatus.textContent = err?.error || 'Save failed.'
  }
})

async function bootstrap() {
  assertSafeEnvironment()
  setLoggedIn()

  await loadVersion()
  await loadMeta()
  if (userInfo) userInfo.textContent = state.user ? `${state.user.firstName || ''} ${state.user.lastName || ''} • ${state.user.roleLabel || state.user.roleKey || ''}` : ''
  await loadLocations()
  renderUserAdminLocations()
  applyQaControls()
  applyInstructorOverride()
  await loadAdminUsers()
  await loadIntegrationStatus()
  if (state.user && state.user.mustChangePin) {
    showChangePinModal()
  }

  state.date = new Date().toISOString().slice(0, 10)
  if (dateSelect) dateSelect.value = state.date
  updateContext()

  const roleKey = state.user?.effectiveRoleKey || state.user?.roleKey || ''
  state.rosterMode = roleKey === 'instructor' ? 'mine' : 'all'
  if (rosterModeSelect) rosterModeSelect.value = state.rosterMode
  setRosterMode(state.rosterMode)
  setView('roster')
}

applyLayoutMode()

try {
  assertSafeEnvironment()
} catch (err) {
  envOk = false
  setLoggedOut()
  if (loginError) loginError.textContent = 'Environment misconfigured. Contact admin.'
}

if (envOk) {
  loadStoredAuth()
  if (state.token) {
    bootstrap().catch(() => setLoggedOut())
  } else {
    setLoggedOut()
  }
}
