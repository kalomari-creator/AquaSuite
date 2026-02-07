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
  selectedClassKey: null,
  manualOverride: false,
  showAllTimes: false,
  instructorFilter: 'all',
  search: '',
  sortBy: 'instructor',
  staff: [],
  version: null,
  observationRoster: [],
  observationSwimmers: [],
  rosterNoteEntryId: null,
  adminUsers: [],
  defaultLocationKey: null,
  noteEntityType: null,
  noteEntityId: null,
  classInstances: [],
  activityEvents: [],
  subtabs: {
    roster: 'main',
    uploads: 'daily-roster',
    reports: 'index',
    observations: 'form',
    staff: 'staff-list',
    intakes: 'google-intakes',
    locations: 'location-list',
    activity: 'activity-feed',
    notifications: 'general',
    announcer: 'announcer'
  },
  contacts: [],
  contactDuplicates: [],
  reports: {
    attendance: null,
    instructorLoad: null,
    rosterHealth: null,
    ssp: null,
    enrollment: null,
    retention: null,
    agedAccounts: null,
    dropList: null
  }
}

const el = (id) => document.getElementById(id)
const API_BASE = '/api'
const PRIVATE_HOST_REGEX = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/

// DEBUG_UI mode for development - enable via localStorage or URL param
const DEBUG_UI = localStorage.getItem('DEBUG_UI') === '1' ||
  new URLSearchParams(window.location.search).get('DEBUG_UI') === '1'

function debugLog(category, ...args) {
  if (!DEBUG_UI) return
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`[${timestamp}] [${category}]`, ...args)
}

function debugWarn(category, ...args) {
  if (!DEBUG_UI) return
  const timestamp = new Date().toISOString().slice(11, 23)
  console.warn(`[${timestamp}] [${category}]`, ...args)
}

function initClickDebug() {
  const enabled = new URLSearchParams(window.location.search).has('clickdebug')
    || localStorage.getItem('clickDebug') === '1';
  if (!enabled) return;
  document.addEventListener('click', (event) => {
    const target = event.target;
    const tag = (target?.tagName || '').toLowerCase();
    if (['button','input','select','textarea','a','label'].includes(tag)) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el) return;
    const style = window.getComputedStyle(el);
    console.log('[ClickDebug]', {
      elementFromPoint: el,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      position: style.position
    });
  }, true);
}


// Safe element getter with debug logging
function safeEl(id) {
  const element = document.getElementById(id)
  if (!element && DEBUG_UI) {
    debugWarn('DOM', `Element #${id} not found`)
  }
  return element
}

function assertSafeEnvironment() {
  if (API_BASE.startsWith('http')) {
    const baseHost = new URL(API_BASE).hostname || ''
    if (PRIVATE_HOST_REGEX.test(baseHost)) {
      throw new Error('internal_api_base_not_allowed')
    }
  }
}

let envOk = true
let attendanceChart = null
let instructorChart = null
let sspChart = null
let enrollmentChart = null
let retentionChart = null
let agedAccountsChart = null
let dropListChart = null
let billingDraft = null
const reportPreflightCache = {}
let pendingReportUpload = null

const loginPanel = el('loginPanel')
const appPanel = el('appPanel')
const loginForm = el('loginForm')
const loginError = el('loginError')
const viewHost = el('viewHost')
const navList = el('navList')
const locationSelect = el('locationSelect')
const dateSelect = el('dateSelect')
const timeBlocks = el('timeBlocks')
const timeActive = el('timeActive')
const timePillToggle = el('timePillToggle')
const timeSelectedLabel = el('timeSelectedLabel')
const timeBlockStatus = el('timeBlockStatus')
const homebaseShiftStatus = el('homebaseShiftStatus')
const timeBlockCard = el('timeBlockCard')
const rosterTable = el('rosterTable')
const rosterMeta = el('rosterMeta')
const rosterEmpty = el('rosterEmpty')
const rosterUploadCard = el('rosterUploadCard')
const rosterTableCard = el('rosterTableCard')
const rosterSearch = el('rosterSearch')
const addSwimmerBtn = el('addSwimmerBtn')
const searchClear = el('searchClear')
const sortBy = el('sortBy')
const instructorFilter = el('instructorFilter')
const bulkMarkPresent = el('bulkMarkPresent')
const bulkClearAttendance = el('bulkClearAttendance')
const rosterFile = el('rosterFile')
const uploadRosterFile = el('uploadRosterFile')
const enrollmentRosterFile = el('enrollmentRosterFile')
const rosterUploadStatus = el('rosterUploadStatus')
const uploadStatusUploads = el('uploadStatusUploads')
const uploadStatusEnrollment = el('uploadStatusEnrollment')
const uploadConfirmBtn = el('uploadConfirmBtn')
const uploadConfirmModal = el('uploadConfirmModal')
const uploadConfirmSummary = el('uploadConfirmSummary')
const uploadConfirmRun = el('uploadConfirmRun')
const uploadConfirmClose = el('uploadConfirmClose')
const uploadMergeMode = el('uploadMergeMode')
const uploadHistoryList = el('uploadHistoryList')
const reportConfirmModal = el('reportConfirmModal')
const reportConfirmSummary = el('reportConfirmSummary')
const reportConfirmCheckbox = el('reportConfirmCheckbox')
const reportConfirmRun = el('reportConfirmRun')
const reportConfirmClose = el('reportConfirmClose')
const reportConfirmStatus = el('reportConfirmStatus')
const reportStartDate = el('reportStartDate')
const reportEndDate = el('reportEndDate')
const reportInstructorFilter = el('reportInstructorFilter')
const reportProgramFilter = el('reportProgramFilter')
const reportsRefreshBtn = el('reportsRefreshBtn')
const reportsStatus = el('reportsStatus')
const attendanceKpis = el('attendanceKpis')
const attendanceChartEl = el('attendanceChart')
const attendanceTable = el('attendanceTable')
const attendanceExportBtn = el('attendanceExportBtn')
const instructorChartEl = el('instructorChart')
const instructorTable = el('instructorTable')
const instructorExportBtn = el('instructorExportBtn')
const rosterHealthKpis = el('rosterHealthKpis')
const rosterHealthTable = el('rosterHealthTable')
const rosterHealthExportBtn = el('rosterHealthExportBtn')
const sspChartEl = el('sspChart')
const sspTable = el('sspTable')
const sspExportBtn = el('sspExportBtn')
const enrollmentChartEl = el('enrollmentChart')
const enrollmentByLocation = el('enrollmentByLocation')
const enrollmentByStaff = el('enrollmentByStaff')
const enrollmentWorkQueue = el('enrollmentWorkQueue')
const enrollmentTable = el('enrollmentTable')
const enrollmentExportBtn = el('enrollmentExportBtn')
const retentionChartEl = el('retentionChart')
const retentionTable = el('retentionTable')
const retentionExportBtn = el('retentionExportBtn')
const agedAccountsChartEl = el('agedAccountsChart')
const agedAccountsTable = el('agedAccountsTable')
const agedAccountsExportBtn = el('agedAccountsExportBtn')
const dropListChartEl = el('dropListChart')
const dropListTable = el('dropListTable')
const dropListExportBtn = el('dropListExportBtn')
const contactsSearch = el('contactsSearch')
const contactsTable = el('contactsTable')
const contactsDuplicates = el('contactsDuplicates')
const contactsExportBtn = el('contactsExportBtn')
const hubspotSyncBtn = el('hubspotSyncBtn')
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
const sspRevokeBtn = el('sspRevokeBtn')
const billingFlagBtn = el('billingFlagBtn')
const sspStatus = el('sspStatus')
const sspNoteInput = el('sspNoteInput')
const sspHistoryList = el('sspHistoryList')

const billingModal = el('billingModal')
const billingReasonInput = el('billingReasonInput')
const billingNotesInput = el('billingNotesInput')
const billingPrioritySelect = el('billingPrioritySelect')
const billingStatusSelect = el('billingStatusSelect')
const billingAssigneeSelect = el('billingAssigneeSelect')
const billingSaveBtn = el('billingSaveBtn')
const billingCancelBtn = el('billingCancelBtn')
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
const locationAddName = el('locationAddName')
const locationAddCode = el('locationAddCode')
const locationAddState = el('locationAddState')
const locationAddTimezone = el('locationAddTimezone')
const locationAddBtn = el('locationAddBtn')
const locationAddStatus = el('locationAddStatus')
const announcerTab = el('announcerTab')
const announcerDisabledCard = el('announcerDisabledCard')
const announcerActiveCard = el('announcerActiveCard')
const announcerBlocks = el('announcerBlocks')
const announcerTimeToggle = el('announcerTimeToggle')
const announcerTimeSelected = el('announcerTimeSelected')
const announcerStatus = el('announcerStatus')
const announcerText = el('announcerText')
const announcerSpeakBtn = el('announcerSpeakBtn')
const announcerClearBtn = el('announcerClearBtn')
const revBtn = el('revBtn')
const revModal = el('revModal')
const revClose = el('revClose')
const revContent = el('revContent')
const filtersToggle = el('filtersToggle')
const filtersPanel = el('filtersPanel')
const rosterActionDock = el('rosterActionDock')
const rosterSaveStatus = el('rosterSaveStatus')

const gearAdminLinks = el('gearAdminLinks')
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
const billingQueueCard = el('billingQueueCard')
const billingQueueList = el('billingQueueList')
const billingStatusFilter = el('billingStatusFilter')
const billingRefreshBtn = el('billingRefreshBtn')
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
const managerNotificationList = el('managerNotificationList')
const managerNotificationsRefresh = el('managerNotificationsRefresh')
const printRosterBtn = el('printRosterBtn')
const classNoteBtn = el('classNoteBtn')
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
const integrationStatusCard = el('integrationStatusCard')
const integrationStatusList = el('integrationStatusList')
const homebaseSyncCard = el('homebaseSyncCard')
const homebaseSyncBtn = el('homebaseSyncBtn')
const homebaseSyncStatus = el('homebaseSyncStatus')
const homebaseSyncList = el('homebaseSyncList')
const appFooter = el('appFooter')
const footerVersion = el('footerVersion')
const undoToast = el('undoToast')
const undoToastMessage = el('undoToastMessage')
const undoToastBtn = el('undoToastBtn')
const undoToastDismiss = el('undoToastDismiss')

let pendingUndo = null
let undoTimer = null

function showUndoToast(message, undoFn, timeoutMs = 8000) {
  if (undoTimer) clearTimeout(undoTimer)
  pendingUndo = undoFn
  if (undoToastMessage) undoToastMessage.textContent = message
  if (undoToast) undoToast.classList.remove('hidden')
  undoTimer = setTimeout(() => {
    hideUndoToast()
    pendingUndo = null
  }, timeoutMs)
}

function hideUndoToast() {
  if (undoToast) undoToast.classList.add('hidden')
  if (undoTimer) clearTimeout(undoTimer)
}

function executeUndo() {
  if (typeof pendingUndo === 'function') {
    pendingUndo()
  }
  pendingUndo = null
  hideUndoToast()
}

undoToastBtn?.addEventListener('click', executeUndo)
undoToastDismiss?.addEventListener('click', hideUndoToast)

function updateFooterVersion() {
  if (!footerVersion || !state.version) return
  const ver = state.version.version || state.version.builtAt || 'dev'
  footerVersion.textContent = `AquaSuite v${ver}`
  if (appFooter) appFooter.classList.remove('hidden')
}

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

const NAV_ITEMS = [
  { view: 'roster', label: 'Roster', feature: 'roster', roles: ['admin', 'manager', 'instructor', 'readonly'] },
  { view: 'uploads', label: 'Uploads', feature: 'roster', roles: ['admin', 'manager'] },
  { view: 'reports', label: 'Reports', feature: 'reports', roles: ['admin', 'manager'] },
  { view: 'observations', label: 'Observations', feature: 'observations', roles: ['admin', 'manager', 'instructor'] },
  { view: 'activity', label: 'Activity', feature: null, roles: ['admin', 'manager'] },
  { view: 'notifications', label: 'Notifications', feature: null, roles: ['admin', 'manager', 'instructor'] },
  { view: 'announcer', label: 'Announcer', feature: 'announcer', roles: ['admin', 'manager', 'instructor', 'readonly'] }
]

const ADMIN_NAV_ITEMS = [
  { view: 'staff', label: 'Staff management' },
  { view: 'intakes', label: 'Intakes configuration' },
  { view: 'locations', label: 'Location management' },
  { view: 'uploads', label: 'Integrations status & uploads' }
]

const viewStore = new Map()
let mountedView = null
let timeBlocksExpanded = false
let announcerBlocksExpanded = false

const weekendTimeSlots = ['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30']

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

function todayIsoInTz(tz = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date())
  } catch (e) {
    return new Date().toISOString().slice(0, 10)
  }
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
  if (['deck', 'staff', 'instructor', 'aquatics_staff'].includes(raw)) return 'instructor'
  if (['guard', 'lifeguard'].includes(raw)) return 'readonly'
  return 'readonly'
}

function getEffectiveRoleKey() {
  const preview = localStorage.getItem(qaRolePrefKey)
  if (preview) return preview
  return normalizeRoleKey(state.user?.effectiveRoleKey || state.user?.roleKey || '')
}

function getEffectiveRoleLabel() {
  const key = getEffectiveRoleKey()
  if (key === 'admin') return 'Admin'
  if (key === 'manager') return 'Manager'
  if (key === 'instructor') return 'Aquatics Staff'
  if (key === 'readonly') return 'Guard'
  return key
}

function getViewNode(view) {
  const key = String(view || '').toLowerCase()
  if (!viewStore.size) initViewHost()
  return viewStore.get(key) || null
}

function initViewHost() {
  if (!viewHost || viewStore.size) return
  const sections = Array.from(document.querySelectorAll('section[id^="view"]'))
  if (!sections.length) return
  sections.forEach((section) => {
    const key = section.id.replace(/^view/, '').toLowerCase()
    viewStore.set(key, section)
    section.parentElement?.removeChild(section)
  })
}

function mountView(view) {
  if (!viewHost) return
  if (!viewStore.size) initViewHost()
  const key = String(view || '').toLowerCase()
  const next = viewStore.get(key)
  if (!next) return
  if (mountedView === key && viewHost.contains(next)) return
  viewHost.innerHTML = ''
  viewHost.appendChild(next)
  mountedView = key
}

function renderGearLinks() {
  if (!gearAdminLinks) return
  const isAdmin = getEffectiveRoleKey() === 'admin'
  gearAdminLinks.classList.toggle('hidden', !isAdmin)
  gearAdminLinks.innerHTML = ''
  if (!isAdmin) return
  ADMIN_NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button')
    btn.className = 'secondary'
    btn.type = 'button'
    btn.dataset.gearNav = item.view
    btn.textContent = item.label
    btn.addEventListener('click', () => {
      setView(item.view)
      activateView(item.view)
      closeGearMenu()
    })
    gearAdminLinks.appendChild(btn)
  })
}

function buildNavMenu() {
  if (!navList) return
  const role = getEffectiveRoleKey()
  const loc = state.locations.find((l) => l.id === state.locationId)
  const features = getLocationFeatures(loc)
  navList.innerHTML = ''
  NAV_ITEMS.forEach((item) => {
    if (!item.roles.includes(role)) return
    if (item.feature === 'reports' && !features.reports_enabled) return
    if (item.feature === 'observations' && !features.observations_enabled) return
    if (item.feature === 'announcer' && !features.announcer_enabled) return
    const btn = document.createElement('button')
    btn.className = 'navItem'
    btn.dataset.view = item.view
    btn.textContent = item.label
    btn.addEventListener('click', () => {
      setView(item.view)
      if (state.subtabs[item.view]) setSubtab(item.view, state.subtabs[item.view])
      activateView(item.view)
      closeNavDrawer()
    })
    navList.appendChild(btn)
  })
  if (!navList.children.length) {
    const hint = document.createElement('div')
    hint.className = 'hint'
    hint.textContent = 'No pages available for this role.'
    navList.appendChild(hint)
  }
}

function normalizeInstructorName(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}$/g, '')
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{2}$/g, '')
    .trim()
}

function formatInstructorLabel(value, fallback = 'Unassigned') {
  const normalized = normalizeInstructorName(value)
  return normalized || value || fallback
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

function renderSavedViews(view) {
  // Safe no-op fallback if saved views are not implemented yet.
  try {
    const key = `aqua_saved_views_${view || ''}`
    const raw = localStorage.getItem(key)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (view === 'roster' && parsed?.locationId) {
      state.locationId = parsed.locationId
      if (locationSelect) locationSelect.value = state.locationId
    }
    if (view === 'activity' && parsed?.locationId) {
      state.locationId = parsed.locationId
      if (locationSelect) locationSelect.value = state.locationId
    }
  } catch {
    return
  }
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
window.addEventListener('hashchange', applyRouteFromHash)
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
  state.search = ''
  state.date = null
  state.selectedClassKey = null
  state.manualOverride = false
  state.showAllTimes = false
  if (rosterSearch) rosterSearch.value = ''
  if (searchClear) searchClear.classList.add('hidden')
  toggleRosterShell(false)
  if (loginPanel) loginPanel.classList.remove('hidden')
  if (appPanel) appPanel.classList.add('hidden')
  closeNavDrawer()
  closeGearMenu()
  closeUploadConfirm()
  closeReportConfirm()
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
  if (!integrationStatus && !integrationStatusList) return
  let hubspot = null
  let homebase = null
  try {
    hubspot = await apiFetch('/integrations/hubspot/status')
  } catch {
    hubspot = { configured: false, enabled: false, error: 'status_unavailable' }
  }
  try {
    homebase = await apiFetch('/integrations/homebase/status')
  } catch {
    homebase = { configured: false, enabled: false, error: 'status_unavailable' }
  }

  if (integrationStatus) {
    const hub = hubspot?.configured ? 'Configured' : 'Not configured'
    const hb = homebase?.configured ? 'Configured' : 'Not configured'
    integrationStatus.textContent = `HubSpot: ${hub} • Homebase: ${hb}`
  }

  if (integrationStatusList) {
    integrationStatusList.innerHTML = ''
    const rows = [
      { title: 'HubSpot', data: hubspot },
      { title: 'Homebase', data: homebase }
    ]
    rows.forEach((row) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      const status = row.data?.configured ? 'Configured' : 'Not configured'
      const lastSync = row.data?.lastSync ? new Date(row.data.lastSync).toLocaleString() : '—'
      const error = row.data?.lastError || ''
      item.innerHTML = `<strong>${row.title}</strong>
        <div class="muted tiny">Status: ${status}${row.data?.enabled === false ? ' (disabled)' : ''}</div>
        <div class="muted tiny">Last sync: ${lastSync}</div>
        <div class="muted tiny">${error ? 'Last error: ' + error : ''}</div>`
      integrationStatusList.appendChild(item)
    })
  }
}

async function loadHomebaseSyncStatus() {
  if (!homebaseSyncList) return
  homebaseSyncList.innerHTML = '<div class="hint">Loading Homebase status…</div>'
  try {
    const data = await apiFetch('/integrations/homebase/status')
    homebaseSyncList.innerHTML = ''
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>Homebase</strong>
      <div class="muted tiny">Last sync: ${data.lastSync ? new Date(data.lastSync).toLocaleString() : '—'}</div>
      <div class="muted tiny">Last error: ${data.lastError || 'None'}</div>`
    homebaseSyncList.appendChild(item)
  } catch (err) {
    homebaseSyncList.innerHTML = `<div class="hint">${err?.error || 'Failed to load Homebase status.'}</div>`
  }
}

async function loadHomebaseShiftStatus() {
  if (!homebaseShiftStatus) return
  if (!state.locationId || state.locationId === 'all') {
    homebaseShiftStatus.textContent = 'On shift: —'
    return
  }
  try {
    const data = await apiFetch(`/integrations/homebase/on-shift?locationId=${state.locationId}`)
    if (data.enabled === false) {
      homebaseShiftStatus.textContent = 'On shift: Homebase disabled'
      return
    }
    homebaseShiftStatus.textContent = `On shift: ${data.count || 0}`
  } catch {
    homebaseShiftStatus.textContent = 'On shift: unavailable'
  }
}

async function loadNotifications() {
  const isAdmin = getEffectiveRoleKey() === 'admin'
  const locationId = state.locationId || (isAdmin ? 'all' : null)
  if ((!notificationList && !managerNotificationList) || !locationId) return

  const renderList = (el, items) => {
    if (!el) return
    el.innerHTML = ''
    if (!items || !items.length) {
      el.innerHTML = '<div class="hint">No notifications yet.</div>'
      return
    }
    items.forEach((n) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      const time = n.created_at ? new Date(n.created_at).toLocaleString() : ''
      item.innerHTML = `<strong>${n.title || n.type || 'Notification'}</strong>
        <div class="muted tiny">${time}</div>
        <div class="muted">${n.body || ''}</div>`
      if (!n.read_at) item.classList.add('unread')
      item.addEventListener('click', async () => {
        if (n.read_at) return
        try {
          await apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify({ notificationId: n.id }) })
          item.classList.remove('unread')
          n.read_at = new Date().toISOString()
        } catch {}
      })
      el.appendChild(item)
    })
  }

  try {
    if (notificationList) notificationList.innerHTML = '<div class="hint">Loading…</div>'
    if (managerNotificationList) managerNotificationList.innerHTML = '<div class="hint">Loading…</div>'
    const general = await apiFetch(`/notifications?locationId=${locationId}&channel=general`)
    renderList(notificationList, general.notifications || [])
    if (getEffectiveRoleKey() === 'admin' || getEffectiveRoleKey() === 'manager') {
      const manager = await apiFetch(`/notifications?locationId=${locationId}&channel=manager`)
      renderList(managerNotificationList, manager.notifications || [])
    }
  } catch (err) {
    const msg = err?.error || 'Failed to load notifications.'
    if (notificationList) notificationList.innerHTML = `<div class="hint">${msg}</div>`
    if (managerNotificationList) managerNotificationList.innerHTML = `<div class="hint">${msg}</div>`
  }
}
async function showRevModal() {
  if (!svModal || !revContent || !revModal) return
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
  if (!tourModal) return
  const params = new URLSearchParams(window.location.search)
  const tourEnabled = localStorage.getItem('tourEnabled') === '1' || params.has('tour')
  if (!tourEnabled) return
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


function closeCommandPalette() {
  if (!commandPaletteModal) return
  commandPaletteModal.classList.add('hidden')
  commandPaletteModal.style.pointerEvents = 'none'
}

function getRosterNoteKey(entryId) {
  return `roster_note_${entryId}`
}

async function loadSspHistory(entryId) {
  if (!sspHistoryList || !entryId || !state.locationId) return
  sspHistoryList.innerHTML = '<div class="hint">Loading SSP history…</div>'
  try {
    const data = await apiFetch(`/ssp/events?locationId=${state.locationId}&rosterEntryId=${entryId}`)
    const events = Array.isArray(data.events) ? data.events : []
    if (!events.length) {
      sspHistoryList.innerHTML = '<div class="hint">No SSP history yet.</div>'
      return
    }
    sspHistoryList.innerHTML = ''
    events.forEach((evt) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      item.innerHTML = `<strong>${evt.status || ''}</strong>
        <div class="muted tiny">${evt.created_at ? new Date(evt.created_at).toLocaleString() : ''}</div>
        <div class="muted tiny">${evt.note || ''}</div>`
      sspHistoryList.appendChild(item)
    })
  } catch {
    sspHistoryList.innerHTML = '<div class="hint">No SSP history yet.</div>'
  }
}

async function openEntityNote(entityType, entityId) {
  state.noteEntityType = entityType
  state.noteEntityId = entityId
  state.rosterNoteEntryId = null
  rosterNoteText.value = ''
  if (sspStatus) sspStatus.textContent = ''
  if (sspNoteInput) sspNoteInput.value = ''
  if (sspHistoryList) sspHistoryList.innerHTML = ''
  if (sspRevokeBtn) sspRevokeBtn.classList.add('hidden')
  rosterNoteModal.classList.remove('hidden')
  rosterNoteModal.style.pointerEvents = 'auto'
  if (entityType === 'roster_entry') {
    loadSspHistory(entityId)
    const entry = (state.rosterEntries || []).find((r) => r.id === entityId)
    if (entry?.ssp_passed) {
      if (sspStatus) sspStatus.textContent = 'SSP passed'
      if (sspRevokeBtn) sspRevokeBtn.classList.remove('hidden')
    } else {
      if (sspStatus) sspStatus.textContent = 'SSP not passed'
    }
  }
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
  rosterNoteModal.style.pointerEvents = 'none'
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
    await apiFetch('/ssp/pass', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        rosterEntryId: entryId,
        classInstanceId: cls?.id || null,
        note: sspNoteInput?.value || null
      })
    })
    if (sspStatus) sspStatus.textContent = 'SSP recorded ✓'
    if (sspNoteInput) sspNoteInput.value = ''
    const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    const entry = rosterEntries.find((r) => r.id === entryId)
    if (entry) entry.ssp_passed = true
    renderRoster()
    loadNotifications()
    loadSspHistory(entryId)
  } catch (err) {
    if (sspStatus) sspStatus.textContent = err?.error || 'SSP failed'
  }
}

async function markSspRevoked() {
  const entryId = state.noteEntityId || state.rosterNoteEntryId
  if (!entryId || !state.locationId) return
  if (sspStatus) sspStatus.textContent = 'Revoking SSP…'
  try {
    const cls = getSelectedClassInstance()
    await apiFetch('/ssp/revoke', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        rosterEntryId: entryId,
        classInstanceId: cls?.id || null,
        note: sspNoteInput?.value || null
      })
    })
    if (sspStatus) sspStatus.textContent = 'SSP revoked'
    if (sspNoteInput) sspNoteInput.value = ''
    const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    const entry = rosterEntries.find((r) => r.id === entryId)
    if (entry) entry.ssp_passed = false
    renderRoster()
    loadNotifications()
    loadSspHistory(entryId)
  } catch (err) {
    if (sspStatus) sspStatus.textContent = err?.error || 'SSP revoke failed'
  }
}

function setView(view, options = {}) {
  debugLog('VIEW', `setView("${view}")`, options)
  initViewHost()
  state.view = view
  if (view === 'roster' && state.locationId === 'all') {
    const first = (state.locations || []).find((loc) => loc.id && loc.id !== 'all')
    if (first) {
      state.locationId = first.id
      if (locationSelect) locationSelect.value = first.id
      localStorage.setItem(locationPrefKey, first.id)
    }
  }
  mountView(view)
  if (view !== 'roster') {
    timeBlocksExpanded = false
    if (timeBlocks) timeBlocks.classList.add('hidden')
  }
  document.querySelectorAll('.navItem').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view)
  })
  closeGearMenu()
  applySubtab(view)
  if (!options.silent) syncRoute()
  showTour(getEffectiveRoleKey(), view)
}

function applySubtab(view) {
  const subtab = state.subtabs[view]
  const panel = getViewNode(view)
  if (!panel) return
  panel.querySelectorAll('[data-subtab]').forEach((node) => {
    const match = node.dataset.subtab === subtab
    node.classList.toggle('hidden', !match)
  })
  panel.querySelectorAll('[data-subtab-btn]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtabBtn === subtab)
  })
}

function setSubtab(view, subtab, options = {}) {
  if (!subtab) return
  state.subtabs[view] = subtab
  if (state.view === view) applySubtab(view)
  if (state.view === view) activateSubtab(view, subtab)
  if (!options.silent) syncRoute()
}

function activateView(view) {
  if (view === 'uploads') loadUploads()
  if (view === 'reports') loadReports()
  if (view === 'observations') {
    const tab = state.subtabs.observations || 'form'
    setObsTab(tab)
    if (tab === 'dashboard') loadObservationDashboard()
    else { loadObservationClasses(); renderObservationSwimmers() }
  }
  if (view === 'activity') {
    const tab = state.subtabs.activity || 'activity-feed'
    if (tab === 'billing-queue') loadBillingTickets()
    else loadActivityFeed()
  }
  if (view === 'staff') { loadStaff(); loadInstructorVariants() }
  if (view === 'intakes') loadIntakes()
  if (view === 'locations') { renderLocationAdmin(); loadIntegrationStatus() }
  if (view === 'notifications') loadNotifications()
}

function activateSubtab(view, subtab) {
  if (view === 'uploads') loadUploads()
  if (view === 'reports') loadReports()
  if (view === 'staff') loadStaff()
  if (view === 'staff' && subtab === 'homebase-sync') loadHomebaseSyncStatus()
  if (view === 'intakes') loadIntakes()
  if (view === 'locations') renderLocationAdmin()
  if (view === 'notifications') loadNotifications()
  if (view === 'observations') {
    setObsTab(subtab || 'form')
    if (subtab === 'dashboard') loadObservationDashboard()
    else { loadObservationClasses(); renderObservationSwimmers() }
  }
  if (view === 'activity') {
    if (subtab === 'billing-queue') loadBillingTickets()
    else loadActivityFeed()
  }
}

function parseRouteHash() {
  const hash = (location.hash || '').replace(/^#/, '')
  if (!hash) return null
  const cleaned = hash.replace(/^\//, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (!parts.length) return null
  return { view: parts[0], subtab: parts[1] || null }
}

function syncRoute() {
  const view = state.view || 'roster'
  const subtab = state.subtabs[view]
  const hash = `#/${view}${subtab ? `/${subtab}` : ''}`
  if (location.hash !== hash) {
    location.hash = hash
  }
}

function applyRouteFromHash() {
  const route = parseRouteHash()
  if (!route) return
  const view = route.view
  if (view && view !== state.view) setView(view, { silent: true })
  if (route.subtab) {
    setSubtab(view, route.subtab, { silent: true })
  } else {
    applySubtab(view)
  }
  if (view) activateView(view)
}

function openNavDrawer() {
  if (!navDrawer || !navOverlay) return
  closeGearMenu()
  const topbar = document.querySelector('.topbar')
  if (topbar) {
    const rect = topbar.getBoundingClientRect()
    navOverlay.style.top = `${rect.bottom}px`
    navOverlay.style.height = `calc(100% - ${rect.bottom}px)`
  } else {
    navOverlay.style.top = '0'
    navOverlay.style.height = '100%'
  }
  navOverlay.style.pointerEvents = 'auto'
  navDrawer.classList.remove('hidden')
  navOverlay.classList.remove('hidden')
}

function closeNavDrawer() {
  if (!navDrawer || !navOverlay) return
  navDrawer.classList.add('hidden')
  navOverlay.classList.add('hidden')
  navOverlay.style.pointerEvents = 'none'
  navOverlay.style.top = ''
  navOverlay.style.height = ''
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
    unique.unshift({ id: 'all', name: 'Global / All Locations', code: 'ALL', state: 'ALL', features: { roster_enabled: true, reports_enabled: true, observations_enabled: true } })
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
  applyRoleUi()
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
  if (loc?.has_announcements) merged.announcer_enabled = true
  return merged
}

function updateContext() {
  if (contextLocation) {
    const loc = state.locations.find((l) => l.id === state.locationId)
    contextLocation.textContent = loc ? loc.name : 'Location'
  }
  if (contextDate) contextDate.textContent = state.date || ''
}

function getLocationTimeZone() {
  const loc = state.locations.find((l) => l.id === state.locationId)
  return loc?.timezone || loc?.time_zone || loc?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone
}

function toggleRosterShell(hasContext) {
  const hide = !hasContext
  if (timeBlockCard) timeBlockCard.classList.toggle('hidden', hide)
  if (rosterTableCard) rosterTableCard.classList.toggle('hidden', hide)
  if (rosterUploadCard) {
    if (hide) {
      rosterUploadCard.classList.add('hidden')
    } else if (getEffectiveRoleKey() === 'admin' || getEffectiveRoleKey() === 'manager') {
      rosterUploadCard.classList.remove('hidden')
    }
  }
}

function applyLocationFeatures() {
  const loc = state.locations.find((l) => l.id === state.locationId)
  const features = getLocationFeatures(loc)
  const role = getEffectiveRoleKey()

  const rosterOnly = features.roster_enabled && !features.announcer_enabled && !features.reports_enabled && !features.observations_enabled

  buildNavMenu()
  renderGearLinks()

  const navViews = navList ? Array.from(navList.querySelectorAll('.navItem')).map((btn) => btn.dataset.view) : []
  if (!navViews.includes(state.view)) setView("roster")
  if (!features.announcer_enabled && state.view === "announcer") setView("roster")
  if (!features.observations_enabled && state.view === "observations") setView("roster")
  if (announcerDisabledCard) announcerDisabledCard.classList.toggle('hidden', !features.announcer_enabled)
  if (announcerActiveCard) announcerActiveCard.classList.toggle('hidden', !features.announcer_enabled)
  if (eodCloseCard) eodCloseCard.classList.toggle("hidden", !(role === "admin" || role === "manager"))
  if (integrationStatusCard) integrationStatusCard.classList.toggle("hidden", role !== "admin")
  if (rosterOnly && state.view !== "roster") setView("roster")
}

function applyRoleUi() {
  const role = getEffectiveRoleKey()
  const isManager = role === 'admin' || role === 'manager'
  const isReadonly = role === 'readonly'
  if (rosterUploadCard) rosterUploadCard.classList.toggle('hidden', !isManager)
  if (bulkMarkPresent) bulkMarkPresent.disabled = isReadonly
  if (bulkClearAttendance) bulkClearAttendance.disabled = isReadonly
  if (addSwimmerBtn) addSwimmerBtn.disabled = isReadonly
  if (rosterActionDock) rosterActionDock.classList.toggle('hidden', isReadonly)
  if (billingFlagBtn) billingFlagBtn.classList.toggle('hidden', !isManager)
  if (sspRevokeBtn) sspRevokeBtn.classList.toggle('hidden', !isManager)
  if (billingQueueCard) billingQueueCard.classList.toggle('hidden', !isManager)
  if (homebaseSyncCard) homebaseSyncCard.classList.toggle('hidden', role !== 'admin')
  document.querySelectorAll('#notificationsTabs [data-subtab-btn=\"manager\"]').forEach((btn) => {
    btn.classList.toggle('hidden', !isManager)
  })
  if (!isManager && state.subtabs.notifications === 'manager') setSubtab('notifications', 'general', { silent: true })
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
  const present = entries.filter((e) => e.attendance === 1).length
  const absent = entries.filter((e) => e.attendance === 0).length
  const unknown = entries.filter((e) => e.attendance !== 0 && e.attendance !== 1).length
  const classes = new Set(entries.map((e) => e.class_name)).size
  eodSummary.textContent = `Classes ${classes} • Swimmers ${total} • Present ${present} • Absent ${absent} • Unknown ${unknown}`
}

async function checkAutoAdvance() {
  if (state.view !== 'roster') return
  if (!state.selectedClassKey || !state.date || state.showAllTimes) return
  const tz = getLocationTimeZone()
  const classes = sortClassInstances(Array.isArray(state.classInstances) ? state.classInstances.slice() : [])
  if (!classes.length) return
  const current = classes.find((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey)
  if (!current || !current.end_time) return
  const end = parseDateTimeInTz(state.date, current.end_time, tz)
  const threshold = new Date(end.getTime() - 3 * 60 * 1000)
  const now = nowInTimezone(tz)
  if (now >= threshold) {
    const currentTimeKey = normalizeTimeKey(current.start_time)
    const seenTimes = new Set()
    const times = []
    classes.forEach((c) => {
      const timeKey = normalizeTimeKey(c?.start_time)
      if (!timeKey || seenTimes.has(timeKey)) return
      seenTimes.add(timeKey)
      times.push(timeKey)
    })
    const idx = times.indexOf(currentTimeKey)
    const nextTimeKey = idx >= 0 ? times[idx + 1] : null
    const next = nextTimeKey ? classes.find((c) => normalizeTimeKey(c?.start_time) === nextTimeKey) : null
    if (next) {
      state.manualOverride = false
      state.showAllTimes = false
      state.selectedClassKey = getClassKeyFromClassInstance(next)
      buildTimeBlocks()
      applyFilters()
    } else {
      if (timeActive) timeActive.textContent = 'End of day. Thank you.'
    }
  }
}

setInterval(checkAutoAdvance, 60000)

async function loadRosterEntries() {
  debugLog('ROSTER', 'loadRosterEntries called, view:', state.view)
  // Guard: Only run roster loading when roster view elements exist
  if (state.view !== 'roster' && state.view !== 'reports') {
    debugLog('ROSTER', 'Skipping - not on roster/reports view')
    return
  }

  if (!state.locationId || !state.date || state.locationId === 'all') {
    state.rosterEntries = []
    state.filteredEntries = []
    toggleRosterShell(false)
    if (rosterTable) rosterTable.innerHTML = ''
    if (rosterEmpty) {
      rosterEmpty.textContent = state.locationId === 'all'
        ? 'Select a specific location to load roster.'
        : 'Select a location and date to load roster.'
      rosterEmpty.classList.remove('hidden')
    }
    return
  }
  toggleRosterShell(true)
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
  attachRosterEntryClassKeys()
  buildTimeBlocks()
  buildInstructorFilter()
  applyFilters()
  renderEodSummary()
  loadHomebaseShiftStatus()
  if (state.view === 'reports') loadReports()
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

function normalizeTimeKey(value) {
  if (!value) return ''
  const parts = String(value).split(':')
  if (parts.length < 2) return String(value)
  return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
}

function fnv1a32(input) {
  const str = String(input || '')
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function stableHash(input) {
  return fnv1a32(input).toString(36)
}

function buildStableClassKey({ locationId, date, startTime, program, level, instructor, zone }) {
  const parts = [
    String(locationId || ''),
    String(date || ''),
    normalizeTimeKey(startTime),
    String(program || ''),
    String(level || ''),
    String(instructor || ''),
    zone === null || zone === undefined ? '' : String(zone)
  ]
  return `h_${stableHash(parts.join('|'))}`
}

function getClassKeyFromClassInstance(cls) {
  if (!cls) return null
  if (cls.class_key) return cls.class_key
  if (cls.id) {
    cls.class_key = String(cls.id)
    return cls.class_key
  }
  const instructor = normalizeInstructorName(cls.actual_instructor || cls.scheduled_instructor || cls.instructor_name || '')
  cls.class_key = buildStableClassKey({
    locationId: state.locationId || cls.location_id || '',
    date: state.date || cls.class_date || '',
    startTime: cls.start_time || '',
    program: cls.program || '',
    level: cls.level || '',
    instructor: instructor || '',
    zone: cls.zone
  })
  return cls.class_key
}

function buildClassInstanceKeyIndex(classes) {
  const index = new Map()
  ;(Array.isArray(classes) ? classes : []).forEach((cls) => {
    if (!cls) return
    const timeKey = normalizeTimeKey(cls.start_time)
    if (!timeKey) return
    const nameKey = String(cls.class_name || '').trim().toLowerCase()
    const key = `${timeKey}|${nameKey}`
    if (index.has(key)) return
    index.set(key, getClassKeyFromClassInstance(cls))
  })
  return index
}

function buildClassInstancesByTimeKey(classes) {
  const byTime = new Map()
  ;(Array.isArray(classes) ? classes : []).forEach((cls) => {
    if (!cls) return
    const timeKey = normalizeTimeKey(cls.start_time)
    if (!timeKey) return
    const list = byTime.get(timeKey) || []
    list.push(cls)
    byTime.set(timeKey, list)
  })
  return byTime
}

function getClassKeyForRosterEntry(entry, classIndex, classesByTime) {
  if (!entry) return null
  const timeKey = normalizeTimeKey(entry.start_time)
  const nameKey = String(entry.class_name || '').trim().toLowerCase()
  const lookupKey = `${timeKey}|${nameKey}`
  const fromIndex = classIndex ? classIndex.get(lookupKey) : null
  if (fromIndex) return fromIndex

  const candidates = (classesByTime && timeKey) ? (classesByTime.get(timeKey) || []) : []
  if (candidates.length === 1) {
    return getClassKeyFromClassInstance(candidates[0])
  }
  if (candidates.length > 1) {
    const entryInstructor = normalizeInstructorName(entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || '')
    if (entryInstructor) {
      const matches = candidates.filter((c) => {
        const scheduled = normalizeInstructorName(c?.scheduled_instructor || '')
        const actual = normalizeInstructorName(c?.actual_instructor || '')
        const combined = actual || scheduled
        return combined && combined === entryInstructor
      })
      if (matches.length === 1) return getClassKeyFromClassInstance(matches[0])
    }
  }

  const instructor = normalizeInstructorName(entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || '')
  return buildStableClassKey({
    locationId: entry.location_id || state.locationId || '',
    date: entry.class_date || state.date || '',
    startTime: entry.start_time || '',
    program: entry.program || '',
    level: entry.level || '',
    instructor: instructor || '',
    zone: entry.zone
  })
}

function attachRosterEntryClassKeys() {
  const classes = Array.isArray(state.classInstances) ? state.classInstances : []
  const index = buildClassInstanceKeyIndex(classes)
  const byTime = buildClassInstancesByTimeKey(classes)
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  rosterEntries.forEach((entry) => {
    entry.class_key = getClassKeyForRosterEntry(entry, index, byTime)
  })
}

function sortClassInstances(list) {
  const items = Array.isArray(list) ? list : []
  items.sort((a, b) => {
    const ta = normalizeTimeKey(a?.start_time)
    const tb = normalizeTimeKey(b?.start_time)
    if (ta !== tb) return String(ta || '').localeCompare(String(tb || ''))
    const an = String(a?.class_name || '').localeCompare(String(b?.class_name || ''))
    if (an) return an
    const ai = String(a?.actual_instructor || a?.scheduled_instructor || '').localeCompare(String(b?.actual_instructor || b?.scheduled_instructor || ''))
    return ai
  })
  return items
}

function getSelectedClassInstance() {
  const classes = Array.isArray(state.classInstances) ? state.classInstances : []
  if (!classes.length) return null
  if (state.selectedClassKey) {
    const match = classes.find((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey)
    if (match) return match
  }
  return classes[0] || null
}

function updateClassNoteButton() {
  if (!classNoteBtn) return
  const cls = getSelectedClassInstance()
  classNoteBtn.disabled = !cls
}

function buildClassMetaIndexFromRosterEntries() {
  const index = new Map()
  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  rosterEntries.forEach((entry) => {
    const key = entry?.class_key
    if (!key) return
    const meta = index.get(key) || { program: '', level: '', instructor: '', zone: null }
    if (!meta.program && entry.program) meta.program = entry.program
    if (!meta.level && entry.level) meta.level = entry.level
    if (!meta.instructor) {
      const raw = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || ''
      const normalized = normalizeInstructorName(raw)
      if (normalized) meta.instructor = normalized
    }
    if (meta.zone === null || meta.zone === undefined) {
      if (entry.zone !== null && entry.zone !== undefined) meta.zone = entry.zone
    }
    index.set(key, meta)
  })
  return index
}

function formatClassTimeRange(cls) {
  const start = cls?.start_time ? formatTime(cls.start_time) : ''
  const end = cls?.end_time ? formatTime(cls.end_time) : ''
  if (start && end) return `${start}–${end}`
  return start || ''
}

function getClassDisplayLines(cls, metaIndex) {
  const key = getClassKeyFromClassInstance(cls)
  const meta = (metaIndex && key) ? (metaIndex.get(key) || {}) : {}

  const program = meta.program || cls?.program || cls?.class_name || ''
  const level = meta.level || cls?.level || ''
  const timeRange = formatClassTimeRange(cls)

  const scheduled = normalizeInstructorName(cls?.scheduled_instructor || '')
  const actual = normalizeInstructorName(cls?.actual_instructor || '')
  const isSub = Boolean(cls?.is_sub) && scheduled && actual && actual !== scheduled

  const instructor = meta.instructor || actual || scheduled || ''
  const zone = meta.zone !== undefined && meta.zone !== null ? meta.zone : (cls?.zone !== undefined ? cls.zone : null)

  const mainParts = [timeRange, program, level].filter(Boolean)
  const main = mainParts.join(' • ')

  const subParts = []
  if (instructor) subParts.push(instructor)
  if (typeof zone === 'number' && zone) subParts.push(`Zone ${zone}`)
  if (isSub) subParts.push(`Subbing for ${scheduled}`)
  const sub = subParts.filter(Boolean).join(' • ')

  const shortParts = []
  if (program) shortParts.push(program)
  if (level) shortParts.push(level)

  return {
    key,
    main: main || timeRange || 'Class',
    sub,
    short: shortParts.join(' ')
  }
}

function buildTimeBlocks() {
  // Guard: Only build time blocks when on roster view and elements exist
  if (state.view !== 'roster') return
  if (!timeActive && !timeBlocks && !timePillToggle) return

  const hasContext = state.locationId && state.date && state.locationId !== 'all'
  if (!hasContext) {
    if (timeActive) timeActive.textContent = 'Select a location and date.'
    if (timeSelectedLabel) timeSelectedLabel.textContent = 'None'
    if (timeBlocks) { timeBlocks.innerHTML = ''; timeBlocks.classList.add('hidden') }
    timeBlocksExpanded = false
    if (timePillToggle) timePillToggle.disabled = true
    state.selectedClassKey = null
    state.showAllTimes = false
    if (timeBlockStatus) timeBlockStatus.textContent = ''
    updateClassNoteButton()
    return
  }

  if (timePillToggle) timePillToggle.disabled = false

  const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
  let classes = Array.isArray(state.classInstances) ? state.classInstances.slice() : []
  const isWeekend = (() => {
    try {
      const d = new Date(state.date)
      return d.getDay() === 0 || d.getDay() === 6
    } catch (e) {
      return false
    }
  })()
  if (isWeekend && state.locationId && state.locationId !== 'all' && !classes.length) {
    classes = weekendTimeSlots.map((t) => {
      const [hh, mm] = t.split(':').map((v) => parseInt(v, 10))
      const end = new Date(0, 0, 0, hh, mm + 30)
      const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
      return { start_time: t, end_time: endStr, class_name: '', is_placeholder: true }
    })
  }

  classes.forEach((c) => getClassKeyFromClassInstance(c))
  classes = sortClassInstances(classes)
  {
    const seen = new Set()
    classes = classes.filter((c) => {
      const key = `${normalizeTimeKey(c?.start_time)}|${String(c?.class_name || '').trim()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  if (!classes.length) {
    const msg = rosterEntries.length ? 'No classes today.' : 'No roster uploaded for this location/date.'
    if (timeActive) timeActive.textContent = msg
    if (timeSelectedLabel) timeSelectedLabel.textContent = 'None'
    if (timeBlocks) { timeBlocks.innerHTML = ''; timeBlocks.classList.add('hidden') }
    if (timeBlockStatus) timeBlockStatus.textContent = ''
    state.selectedClassKey = null
    state.showAllTimes = false
    updateClassNoteButton()
    return
  }

  const metaIndex = buildClassMetaIndexFromRosterEntries()
  const tz = getLocationTimeZone()
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

  const activeKey = active ? getClassKeyFromClassInstance(active) : null
  const selectedValid = state.selectedClassKey && classes.some((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey)

  if (state.showAllTimes) {
    state.selectedClassKey = null
  } else if (!(state.manualOverride && selectedValid)) {
    state.selectedClassKey = activeKey || getClassKeyFromClassInstance(classes[0])
  }

  if (state.showAllTimes) {
    if (timeActive) timeActive.textContent = 'All times'
    if (timeBlockStatus) timeBlockStatus.textContent = ''
  } else {
    const selectedCls = classes.find((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey) || classes[0] || null
    const lines = selectedCls ? getClassDisplayLines(selectedCls, metaIndex) : null
    if (timeActive) timeActive.textContent = lines?.main || 'No classes today.'
    if (timeBlockStatus) timeBlockStatus.textContent = lines?.sub || ''
  }

  if (timeSelectedLabel) {
    if (state.showAllTimes) {
      timeSelectedLabel.textContent = 'All'
    } else {
      const selectedCls = classes.find((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey) || classes[0] || null
      const lines = selectedCls ? getClassDisplayLines(selectedCls, metaIndex) : null
      const startLabel = selectedCls?.start_time ? formatTime(selectedCls.start_time) : ''
      const short = lines?.short ? ` · ${lines.short}` : ''
      timeSelectedLabel.textContent = startLabel ? `${startLabel}${short}` : 'None'
    }
  }

  if (timeBlocks) {
    timeBlocks.innerHTML = ''
    const allBtn = document.createElement('button')
    allBtn.className = 'secondary miniBtn'
    allBtn.textContent = 'All times'
    allBtn.classList.toggle('active', state.showAllTimes)
    allBtn.addEventListener('click', () => {
      state.showAllTimes = true
      state.manualOverride = true
      state.selectedClassKey = null
      timeBlocksExpanded = false
      buildTimeBlocks()
      applyFilters()
    })
    timeBlocks.appendChild(allBtn)
    classes.forEach((c) => {
      const key = getClassKeyFromClassInstance(c)
      const lines = getClassDisplayLines(c, metaIndex)
      const btn = document.createElement('button')
      btn.className = 'secondary miniBtn time-block-btn'
      btn.title = c.class_name || ''
      btn.classList.toggle('active', !state.showAllTimes && state.selectedClassKey === key)
      const main = document.createElement('div')
      main.className = 'time-block-main'
      main.textContent = lines.main
      btn.appendChild(main)
      if (lines.sub) {
        const sub = document.createElement('div')
        sub.className = 'time-block-sub'
        sub.textContent = lines.sub
        btn.appendChild(sub)
      }
      btn.addEventListener('click', () => {
        state.selectedClassKey = key
        state.showAllTimes = false
        state.manualOverride = true
        timeBlocksExpanded = false
        buildTimeBlocks()
        applyFilters()
      })
      timeBlocks.appendChild(btn)
    })
    timeBlocks.classList.toggle('hidden', !timeBlocksExpanded)
  }
  updateClassNoteButton()
}

function buildAnnouncerBlocks() {
  if (state.view !== 'announcer') return
  if (!announcerBlocks || !announcerTimeToggle || !announcerTimeSelected) return
  const features = getLocationFeatures(state.locations.find((l) => l.id === state.locationId))
  if (!features.announcer_enabled) {
    announcerBlocks.classList.add('hidden')
    announcerTimeToggle.disabled = true
    announcerTimeSelected.textContent = 'None'
    return
  }
  announcerTimeToggle.disabled = false
  const metaIndex = buildClassMetaIndexFromRosterEntries()
  let classes = sortClassInstances(Array.isArray(state.classInstances) ? state.classInstances.slice() : [])
  {
    const seen = new Set()
    classes = classes.filter((c) => {
      const key = `${normalizeTimeKey(c?.start_time)}|${String(c?.class_name || '').trim()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (!classes.length) {
    announcerBlocks.innerHTML = '<div class="hint">No classes today.</div>'
    announcerBlocks.classList.remove('hidden')
    announcerTimeSelected.textContent = 'None'
    return
  }
  announcerBlocks.innerHTML = ''
  const allBtn = document.createElement('button')
  allBtn.className = 'secondary miniBtn'
  allBtn.textContent = 'All times'
  allBtn.classList.toggle('active', state.showAllTimes)
  allBtn.addEventListener('click', () => {
    state.selectedClassKey = null
    state.showAllTimes = true
    announcerBlocksExpanded = false
    buildAnnouncerBlocks()
    buildTimeBlocks()
  })
  announcerBlocks.appendChild(allBtn)
  classes.forEach((c) => {
    const key = getClassKeyFromClassInstance(c)
    const lines = getClassDisplayLines(c, metaIndex)
    const btn = document.createElement('button')
    btn.className = 'secondary miniBtn time-block-btn'
    btn.classList.toggle('active', !state.showAllTimes && state.selectedClassKey === key)
    const main = document.createElement('div')
    main.className = 'time-block-main'
    main.textContent = lines.main
    btn.appendChild(main)
    if (lines.sub) {
      const sub = document.createElement('div')
      sub.className = 'time-block-sub'
      sub.textContent = lines.sub
      btn.appendChild(sub)
    }
    btn.addEventListener('click', () => {
      state.selectedClassKey = key
      state.showAllTimes = false
      announcerBlocksExpanded = false
      buildAnnouncerBlocks()
      buildTimeBlocks()
    })
    announcerBlocks.appendChild(btn)
  })
  announcerBlocks.classList.toggle('hidden', !announcerBlocksExpanded)
  if (state.showAllTimes) {
    announcerTimeSelected.textContent = 'All'
  } else {
    const selectedCls = classes.find((c) => getClassKeyFromClassInstance(c) === state.selectedClassKey) || classes[0] || null
    const lines = selectedCls ? getClassDisplayLines(selectedCls, metaIndex) : null
    const startLabel = selectedCls?.start_time ? formatTime(selectedCls.start_time) : ''
    const short = lines?.short ? ` · ${lines.short}` : ''
    announcerTimeSelected.textContent = startLabel ? `${startLabel}${short}` : 'None'
  }
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
    const raw = r.actual_instructor || r.scheduled_instructor || r.instructor_name
    const normalized = normalizeInstructorName(raw)
    if (normalized) instructors.add(normalized)
  })
  const list = Array.from(instructors).sort()
  if (!instructorFilter) return
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
  const selected = state.showAllTimes ? null : state.selectedClassKey
  let filtered = Array.isArray(state.rosterEntries) ? state.rosterEntries.slice() : []

  if (selected) {
    filtered = filtered.filter((r) => r.class_key === selected)
  }
  if (state.instructorFilter !== 'all') {
    filtered = filtered.filter((r) => {
      const raw = r.actual_instructor || r.scheduled_instructor || r.instructor_name
      return normalizeInstructorName(raw) === state.instructorFilter
    })
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
    const instA = normalizeInstructorName(a.actual_instructor || a.scheduled_instructor || a.instructor_name || '')
    const instB = normalizeInstructorName(b.actual_instructor || b.scheduled_instructor || b.instructor_name || '')
    if (instA === instB) return (a.swimmer_name || '').localeCompare(b.swimmer_name || '')
    return instA.localeCompare(instB)
  })

  state.filteredEntries = filtered
  if (rosterMeta) if (rosterMeta) rosterMeta.textContent = `(${filtered.length} swimmers)`
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
  const dateVal = state.date || obsDate.value || new Date().toISOString().slice(0, 10)
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
	    const swimmers = (data.entries || []).filter((e) =>
	      normalizeTimeKey(e.start_time) === normalizeTimeKey(cls.start_time)
	      && String(e.class_name || '').trim() === String(cls.class_name || '').trim()
	    )
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
      const instructor = normalizeInstructorName(obs.instructor_name || 'Instructor')
      item.innerHTML = `<strong>${instructor || 'Instructor'}</strong>
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
  if (!rosterTable) return
  rosterTable.innerHTML = ''
  if (!state.filteredEntries.length) {
    if (rosterEmpty) {
      const hasRoster = Array.isArray(state.rosterEntries) && state.rosterEntries.length > 0
      const hasClasses = Array.isArray(state.classInstances) && state.classInstances.length > 0
      const hasSelectedClass = !state.showAllTimes && !!state.selectedClassKey

      rosterEmpty.textContent = (!hasRoster && !hasClasses)
        ? 'No roster uploaded for this location/date.'
        : (hasSelectedClass ? 'No swimmers in this class.' : 'No swimmers match the current filters.')
      rosterEmpty.classList.remove('hidden')
    }
    return
  }
  rosterEmpty.classList.add('hidden')

  const seen = new Set()
  const entries = state.filteredEntries.filter((entry) => {
    const key = String(entry.swimmer_external_id || entry.swimmer_name || entry.id || '').toLowerCase()
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  entries.forEach((entry) => {
    const tr = document.createElement('tr')
    tr.className = 'roster-row'
    if (entry.attendance_auto_absent) tr.classList.add('auto-absent')
    if (entry.attendance === 1) tr.classList.add('present')
    if (entry.attendance === 0) tr.classList.add('absent')

        const attendanceCell = document.createElement('td')
    attendanceCell.className = 'col-attendance'
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
    swimmerCell.className = 'col-swimmer'
    swimmerCell.dataset.label = 'Swimmer'
    const swimmerWrap = document.createElement('div')
    swimmerWrap.className = 'cell-stack'
    const nameLine = document.createElement('div')
    nameLine.innerHTML = `<strong>${entry.swimmer_name || ''}</strong>`

    const flags = []
    if (entry.flag_first_time) flags.push('⭐')
    if (entry.flag_makeup) flags.push('🔄')
    if (entry.flag_policy) flags.push('📜')
    if (entry.flag_owes) flags.push('💳')
    if (entry.flag_trial) flags.push('🧪')

    const flagHtml = flags.map((f) => `<span class="flag-chip">${f}</span>`).join('')
    const localBadge = entry.local_only ? '<span class="flag-chip">Local</span>' : ''
    const locationBadge = entry.location_name ? `<span class="flag-chip">${entry.location_name}</span>` : ''
    const badgeLine = document.createElement('div')
    badgeLine.className = 'cell-sub'
    badgeLine.innerHTML = `${flagHtml}${localBadge}${locationBadge}`

    swimmerWrap.appendChild(nameLine)
    if (flagHtml || localBadge || locationBadge) swimmerWrap.appendChild(badgeLine)
    swimmerCell.appendChild(swimmerWrap)

    const ageCell = document.createElement('td')
    ageCell.className = 'col-age'
    ageCell.dataset.label = 'Age'
    ageCell.textContent = entry.age_text || ''

    const programCell = document.createElement('td')
    programCell.className = 'col-type'
    programCell.dataset.label = 'Type'
    programCell.textContent = entry.program || entry.class_name || ''

    const levelCell = document.createElement('td')
    levelCell.className = 'col-level'
    levelCell.dataset.label = 'Level'
    levelCell.textContent = entry.level || ''

    const instructorCell = document.createElement('td')
    instructorCell.className = 'col-instructor'
    instructorCell.dataset.label = 'Aquatics Staff'
    const actualRaw = entry.actual_instructor || entry.scheduled_instructor || entry.instructor_name || ''
    const scheduledRaw = entry.scheduled_instructor || ''
    const actual = normalizeInstructorName(actualRaw)
    const scheduled = normalizeInstructorName(scheduledRaw)
    const isSub = entry.is_sub && scheduled && actual && actual !== scheduled
    const instructorWrap = document.createElement('div')
    instructorWrap.className = 'cell-stack'
    const primaryLine = document.createElement('div')
    primaryLine.innerHTML = `<strong>${actual || scheduled || '—'}</strong>`
    instructorWrap.appendChild(primaryLine)
    if (isSub) {
      const subLine = document.createElement('div')
      subLine.className = 'cell-sub'
      subLine.textContent = `Scheduled: ${scheduled}`
      instructorWrap.appendChild(subLine)
    }
    instructorCell.appendChild(instructorWrap)

    const zoneCell = document.createElement('td')
    zoneCell.className = 'col-zone'
    zoneCell.dataset.label = 'Zone'
    zoneCell.textContent = entry.zone ? `Zone ${entry.zone}` : 'Unassigned'

    const notesCell = document.createElement('td')
    notesCell.className = 'col-notes'
    notesCell.dataset.label = 'Notes'
    const noteBtn = document.createElement('button')
    noteBtn.className = 'secondary miniBtn'
    noteBtn.textContent = 'Notes'
    noteBtn.addEventListener('click', () => openRosterNote(entry.id))
    notesCell.appendChild(noteBtn)
    if (entry.ssp_passed) {
      const badge = document.createElement('span')
      badge.className = 'flag-chip'
      badge.textContent = 'SSP ✓'
      notesCell.appendChild(badge)
    }

    const actionsCell = document.createElement('td')
    actionsCell.className = 'col-actions'
    actionsCell.dataset.label = 'Actions'
    const canBilling = getEffectiveRoleKey() === 'admin' || getEffectiveRoleKey() === 'manager'
    if (canBilling) {
      const billingBtn = document.createElement('button')
      billingBtn.className = 'secondary miniBtn'
      billingBtn.textContent = 'Billing Flag'
      billingBtn.addEventListener('click', () => openBillingFlag(entry))
      actionsCell.appendChild(billingBtn)
    }

    if (entry.instructor_staff_id) {
      const instrNoteBtn = document.createElement('button')
      instrNoteBtn.className = 'secondary miniBtn'
      instrNoteBtn.textContent = 'Staff Note'
      instrNoteBtn.addEventListener('click', () => openEntityNote('instructor', entry.instructor_staff_id))
      actionsCell.appendChild(instrNoteBtn)
    }

    tr.appendChild(attendanceCell)
    tr.appendChild(swimmerCell)
    tr.appendChild(ageCell)
    tr.appendChild(programCell)
    tr.appendChild(levelCell)
    tr.appendChild(instructorCell)
    tr.appendChild(zoneCell)
    tr.appendChild(notesCell)
    tr.appendChild(actionsCell)

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
  if (!state.selectedClassKey || state.showAllTimes) return
  const cls = getSelectedClassInstance()
  const startTime = cls?.start_time || null
  const className = cls?.class_name || null
  if (!startTime) return
  try {
    await apiFetch('/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        date: state.date,
        start_time: normalizeTimeKey(startTime),
        class_name: className,
        attendance
      })
    })
    const rosterEntries = Array.isArray(state.rosterEntries) ? state.rosterEntries : []
    rosterEntries.forEach((entry) => {
      if (entry.class_key === state.selectedClassKey) entry.attendance = attendance
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


function getReportUploadElements(type) {
  const card = document.querySelector(`.report-upload[data-report-type="${type}"]`)
  return {
    card,
    fileInput: card?.querySelector(`[data-report-file="${type}"]`),
    status: card?.querySelector(`[data-report-status="${type}"]`),
    summary: card?.querySelector(`[data-report-summary="${type}"]`)
  }
}

function formatReportRanges(ranges) {
  const list = Array.isArray(ranges) ? ranges : []
  const text = list.map((r) => r.raw || `${r.start || ''} ${r.end || ''}`.trim()).filter(Boolean)
  return text.length ? text.join(', ') : 'Unknown'
}

function setReportUploadStatus(type, message) {
  const { status } = getReportUploadElements(type)
  if (status) status.textContent = message || ''
}

function renderReportUploadSummary(type, data) {
  const { summary } = getReportUploadElements(type)
  if (!summary) return
  summary.innerHTML = ''
  if (!data) return
  const item = document.createElement('div')
  item.className = 'list-item'
  item.innerHTML = `<strong>${data.reportType || type}</strong>
    <div class="muted tiny">Detected location: ${data.detectedLocationName || 'Unknown'}</div>
    <div class="muted tiny">Date range: ${formatReportRanges(data.dateRanges)}</div>`
  if (data.warnings && data.warnings.length) {
    const warn = document.createElement('div')
    warn.className = 'muted tiny'
    warn.textContent = `Warnings: ${data.warnings.join(', ')}`
    item.appendChild(warn)
  }
  summary.appendChild(item)
}

async function preflightReportUpload(type) {
  if (!state.locationId || state.locationId === 'all') {
    setReportUploadStatus(type, 'Select a specific location to upload.')
    return null
  }
  const { fileInput } = getReportUploadElements(type)
  const file = fileInput?.files?.[0]
  if (!file) {
    setReportUploadStatus(type, 'Select a report file first.')
    return null
  }
  setReportUploadStatus(type, 'Running preflight...')
  try {
    const formData = new FormData()
    formData.append('file', file)
    const data = await apiFetch(`/reports/preflight?locationId=${state.locationId}&reportType=${encodeURIComponent(type)}`, {
      method: 'POST',
      body: formData
    })
    reportPreflightCache[type] = { file, data }
    renderReportUploadSummary(type, data)
    setReportUploadStatus(type, 'Preflight OK.')
    return data
  } catch (err) {
    setReportUploadStatus(type, err?.code || err?.error || 'Preflight failed')
    reportPreflightCache[type] = null
    renderReportUploadSummary(type, null)
    return null
  }
}

async function openReportConfirm(type) {
  if (!reportConfirmModal || !reportConfirmSummary || !reportConfirmRun) return
  if (!state.locationId || state.locationId === 'all') {
    setReportUploadStatus(type, 'Select a specific location to upload.')
    return
  }
  let cached = reportPreflightCache[type]
  if (!cached) {
    const data = await preflightReportUpload(type)
    cached = data ? { file: getReportUploadElements(type).fileInput?.files?.[0], data } : null
  }
  if (!cached || !cached.file) return
  pendingReportUpload = { type, file: cached.file, preflight: cached.data }
  const loc = state.locations.find((l) => l.id === state.locationId)
  const locLabel = loc ? loc.name : state.locationId
  reportConfirmSummary.textContent = `Location: ${locLabel}\nReport type: ${cached.data?.reportType || type}\nDate range: ${formatReportRanges(cached.data?.dateRanges)}`
  if (cached.data?.reportType && cached.data.reportType !== type) {
    reportConfirmSummary.textContent += `\nWarning: detected type ${cached.data.reportType}`
  }
  if (reportConfirmCheckbox) reportConfirmCheckbox.checked = false
  reportConfirmRun.disabled = true
  if (reportConfirmStatus) reportConfirmStatus.textContent = ''
  reportConfirmModal.classList.remove('hidden')
  reportConfirmModal.style.pointerEvents = 'auto'
}

function closeReportConfirm() {
  if (!reportConfirmModal) return
  reportConfirmModal.classList.add('hidden')
  reportConfirmModal.style.pointerEvents = 'none'
  pendingReportUpload = null
}

async function runReportConfirm() {
  if (!pendingReportUpload) return
  if (!reportConfirmCheckbox?.checked) {
    if (reportConfirmStatus) reportConfirmStatus.textContent = 'Please confirm before uploading.'
    return
  }
  if (reportConfirmStatus) reportConfirmStatus.textContent = 'Uploading...'
  try {
    const formData = new FormData()
    formData.append('file', pendingReportUpload.file)
    await apiFetch(`/reports/upload?locationId=${state.locationId}&reportType=${encodeURIComponent(pendingReportUpload.type)}`, {
      method: 'POST',
      body: formData
    })
    setReportUploadStatus(pendingReportUpload.type, 'Report uploaded.')
    closeReportConfirm()
    loadUploads()
  } catch (err) {
    if (reportConfirmStatus) reportConfirmStatus.textContent = err?.code || err?.error || 'Report upload failed'
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
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    activityFrom.value = formatDateInputValue(start)
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

async function loadBillingTickets() {
  if (!billingQueueList) return
  const role = getEffectiveRoleKey()
  const locationId = role === 'admin' ? 'all' : state.locationId
  if (!locationId) {
    billingQueueList.innerHTML = '<div class="hint">Select a location to view billing tickets.</div>'
    return
  }
  billingQueueList.innerHTML = '<div class="hint">Loading billing tickets…</div>'
  if (!state.staff || !state.staff.length) {
    try { await loadStaff() } catch {}
  }
  try {
    const params = new URLSearchParams()
    params.set('locationId', locationId)
    if (billingStatusFilter?.value) params.set('status', billingStatusFilter.value)
    const data = await apiFetch(`/billing/tickets?${params.toString()}`)
    renderBillingTickets(data.tickets || [])
  } catch (err) {
    billingQueueList.innerHTML = `<div class="hint">${err?.error || 'Failed to load billing tickets.'}</div>`
  }
}

function renderBillingTickets(tickets) {
  if (!billingQueueList) return
  billingQueueList.innerHTML = ''
  const items = Array.isArray(tickets) ? tickets : []
  if (!items.length) {
    billingQueueList.innerHTML = '<div class="hint">No billing tickets.</div>'
    return
  }

  const staff = Array.isArray(state.staff) ? state.staff : []

  items.forEach((t) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${t.reason || 'Billing ticket'}</strong>
      <div class="muted tiny">${t.location_name || ''} • ${t.status || 'open'} • Priority ${t.priority || 'med'}</div>
      <div class="muted tiny">Created ${t.created_at ? new Date(t.created_at).toLocaleString() : ''}</div>`

    const statusSelect = document.createElement('select')
    ;['open','in_progress','waiting_customer','resolved','closed'].forEach((status) => {
      const opt = document.createElement('option')
      opt.value = status
      opt.textContent = status.replace('_', ' ')
      if (t.status === status) opt.selected = true
      statusSelect.appendChild(opt)
    })

    const prioritySelect = document.createElement('select')
    ;['low','med','high'].forEach((prio) => {
      const opt = document.createElement('option')
      opt.value = prio
      opt.textContent = prio
      if (t.priority === prio) opt.selected = true
      prioritySelect.appendChild(opt)
    })

    const assigneeSelect = document.createElement('select')
    const unassigned = document.createElement('option')
    unassigned.value = ''
    unassigned.textContent = 'Unassigned'
    assigneeSelect.appendChild(unassigned)
    staff.forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s.id
      opt.textContent = `${s.first_name || ''} ${s.last_name || ''}`.trim()
      if (t.assigned_to_user_id === s.id) opt.selected = true
      assigneeSelect.appendChild(opt)
    })

    const notes = document.createElement('textarea')
    notes.placeholder = 'Internal notes'
    notes.value = t.internal_notes || ''

    const saveBtn = document.createElement('button')
    saveBtn.className = 'secondary miniBtn'
    saveBtn.textContent = 'Update'
    saveBtn.addEventListener('click', async () => {
      await apiFetch(`/billing/tickets/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusSelect.value,
          priority: prioritySelect.value,
          assignedToUserId: assigneeSelect.value || null,
          internalNotes: notes.value || null
        })
      })
      loadBillingTickets()
    })

    item.appendChild(statusSelect)
    item.appendChild(prioritySelect)
    item.appendChild(assigneeSelect)
    item.appendChild(notes)
    item.appendChild(saveBtn)
    billingQueueList.appendChild(item)
  })
}


function populateBillingAssignees(selectedId = '') {
  if (!billingAssigneeSelect) return
  const staff = Array.isArray(state.staff) ? state.staff : []
  billingAssigneeSelect.innerHTML = ''
  const none = document.createElement('option')
  none.value = ''
  none.textContent = 'Unassigned'
  billingAssigneeSelect.appendChild(none)
  staff.forEach((s) => {
    const opt = document.createElement('option')
    opt.value = s.id
    opt.textContent = `${s.first_name || ''} ${s.last_name || ''}`.trim()
    if (selectedId && selectedId === s.id) opt.selected = true
    billingAssigneeSelect.appendChild(opt)
  })
}

async function openBillingModal(initial = {}) {
  if (!billingModal) return
  if (!state.locationId) {
    alert('Select a location first.')
    return
  }
  if (!state.staff || !state.staff.length) {
    try { await loadStaff() } catch {}
  }
  billingDraft = {
    locationId: state.locationId,
    contactId: initial.contactId || initial.contact_id || null,
    childExternalId: initial.childExternalId || initial.child_external_id || null,
    priority: initial.priority || 'med',
    status: initial.status || 'open',
    assignedToUserId: initial.assignedToUserId || initial.assigned_to_user_id || ''
  }
  if (billingReasonInput) billingReasonInput.value = initial.reason || ''
  if (billingNotesInput) billingNotesInput.value = initial.internalNotes || initial.notes || ''
  if (billingPrioritySelect) billingPrioritySelect.value = billingDraft.priority
  if (billingStatusSelect) billingStatusSelect.value = billingDraft.status
  populateBillingAssignees(billingDraft.assignedToUserId || '')
  billingModal.classList.remove('hidden')
  billingModal.style.pointerEvents = 'auto'
  if (billingReasonInput) billingReasonInput.focus()
}

function closeBillingModal() {
  if (!billingModal) return
  billingModal.classList.add('hidden')
  billingModal.style.pointerEvents = 'none'
  billingDraft = null
}

async function saveBillingModal() {
  if (!billingModal) return
  if (!state.locationId) {
    alert('Select a location first.')
    return
  }
  const body = {
    locationId: state.locationId,
    contactId: billingDraft?.contactId || null,
    childExternalId: billingDraft?.childExternalId || null,
    status: billingStatusSelect?.value || 'open',
    priority: billingPrioritySelect?.value || 'med',
    assignedToUserId: billingAssigneeSelect?.value || null,
    reason: billingReasonInput?.value || null,
    internalNotes: billingNotesInput?.value || null
  }
  const originalText = billingSaveBtn ? billingSaveBtn.textContent : null
  if (billingSaveBtn) { billingSaveBtn.textContent = 'Saving…'; billingSaveBtn.disabled = true }
  try {
    await apiFetch('/billing/tickets', { method: 'POST', body: JSON.stringify(body) })
    closeBillingModal()
    loadBillingTickets()
  } catch (err) {
    alert(err?.error || 'Failed to create billing ticket.')
  } finally {
    if (billingSaveBtn) { billingSaveBtn.textContent = originalText || 'Create Ticket'; billingSaveBtn.disabled = false }
  }
}

async function openBillingFlag(entry) {
  const role = getEffectiveRoleKey()
  if (!(role === 'admin' || role === 'manager')) {
    alert('Billing flags are manager-only.')
    return
  }
  if (!state.locationId) return
  await loadStaff()
  openBillingModal({
    locationId: state.locationId,
    contactId: entry?.contact_id || entry?.contactId || null,
    childExternalId: entry?.swimmer_external_id || entry?.childExternalId || null,
    reason: '',
    priority: 'med',
    status: 'open'
  })
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
  const selectedCls = (!state.showAllTimes && state.selectedClassKey) ? getSelectedClassInstance() : null
  const selectedStart = selectedCls?.start_time ? normalizeTimeKey(selectedCls.start_time) : null
  const entry = {
    id: `local_${Date.now()}`,
    location_id: state.locationId,
    class_date: state.date,
    start_time: selectedStart,
    class_name: selectedCls?.class_name || null,
    class_key: state.showAllTimes ? null : (state.selectedClassKey || null),
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

function setReportsStatus(message) {
  if (reportsStatus) reportsStatus.textContent = message || ''
}

function ensureReportDates() {
  if (!reportStartDate || !reportEndDate) return
  if (!reportStartDate.value || !reportEndDate.value) {
    const end = state.date ? new Date(state.date) : new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - 30)
    reportStartDate.value = formatDateInputValue(start)
    reportEndDate.value = formatDateInputValue(end)
  }
}

function getReportFilters() {
  return {
    start: reportStartDate?.value || '',
    end: reportEndDate?.value || '',
    instructor: reportInstructorFilter?.value || '',
    program: reportProgramFilter?.value || ''
  }
}

function populateReportFilters(options = {}) {
  const instructors = Array.isArray(options.instructors) ? options.instructors : []
  const programs = Array.isArray(options.programs) ? options.programs : []
  if (reportInstructorFilter) {
    const current = reportInstructorFilter.value || ''
    reportInstructorFilter.innerHTML = ''
    const allOpt = document.createElement('option')
    allOpt.value = ''
    allOpt.textContent = 'All'
    reportInstructorFilter.appendChild(allOpt)
    instructors.forEach((name) => {
      const opt = document.createElement('option')
      opt.value = name
      opt.textContent = name
      reportInstructorFilter.appendChild(opt)
    })
    reportInstructorFilter.value = current
  }
  if (reportProgramFilter) {
    const current = reportProgramFilter.value || ''
    reportProgramFilter.innerHTML = ''
    const allOpt = document.createElement('option')
    allOpt.value = ''
    allOpt.textContent = 'All'
    reportProgramFilter.appendChild(allOpt)
    programs.forEach((name) => {
      const opt = document.createElement('option')
      opt.value = name
      opt.textContent = name
      reportProgramFilter.appendChild(opt)
    })
    reportProgramFilter.value = current
  }
}

function renderKpis(container, items) {
  if (!container) return
  container.innerHTML = ''
  items.forEach((item) => {
    const div = document.createElement('div')
    div.className = 'kpi'
    div.innerHTML = `<strong>${item.label}</strong> ${item.value}`
    container.appendChild(div)
  })
}

function renderChart(canvasEl, config, existing) {
  if (!canvasEl || !window.Chart) return null
  if (existing) existing.destroy()
  return new window.Chart(canvasEl, config)
}

function renderAttendanceReport(data) {
  if (!attendanceTable || !attendanceKpis) return
  if (!data) {
    attendanceTable.innerHTML = '<div class="hint">No attendance data.</div>'
    renderKpis(attendanceKpis, [])
    return
  }
  const summary = data.summary || {}
  renderKpis(attendanceKpis, [
    { label: 'Total', value: summary.total || 0 },
    { label: 'Present', value: summary.present || 0 },
    { label: 'Absent', value: summary.absent || 0 },
    { label: 'Unknown', value: summary.unknown || 0 }
  ])

  const byDate = Array.isArray(data.byDate) ? data.byDate : []
  const labels = byDate.map((d) => d.date)
  const present = byDate.map((d) => d.present || 0)
  const absent = byDate.map((d) => d.absent || 0)
  attendanceChart = renderChart(attendanceChartEl, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Present', data: present, borderColor: '#00FF7B', backgroundColor: 'rgba(0,255,123,0.2)', tension: 0.2 },
        { label: 'Absent', data: absent, borderColor: '#FF2B2B', backgroundColor: 'rgba(255,43,43,0.2)', tension: 0.2 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  }, attendanceChart)

  const byInstructor = Array.isArray(data.byInstructor) ? data.byInstructor : []
  attendanceTable.innerHTML = ''
  if (!byInstructor.length) {
    attendanceTable.innerHTML = '<div class="hint">No instructor breakdown.</div>'
    return
  }
  byInstructor.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${formatInstructorLabel(row.instructor)}</strong>
      <div class="muted tiny">Present ${row.present || 0} • Absent ${row.absent || 0} • Unknown ${row.unknown || 0}</div>`
    attendanceTable.appendChild(item)
  })
}

function renderInstructorLoadReport(data) {
  if (!instructorTable) return
  if (!data) {
    instructorTable.innerHTML = '<div class="hint">No instructor data.</div>'
    return
  }
  const byDate = Array.isArray(data.byDate) ? data.byDate : []
  const labels = byDate.map((d) => d.date)
  const swimmers = byDate.map((d) => d.swimmers || 0)
  instructorChart = renderChart(instructorChartEl, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Swimmers', data: swimmers, backgroundColor: 'rgba(0,229,255,0.35)' }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  }, instructorChart)

  const rows = Array.isArray(data.byInstructor) ? data.byInstructor : []
  instructorTable.innerHTML = ''
  if (!rows.length) {
    instructorTable.innerHTML = '<div class="hint">No instructor load data.</div>'
    return
  }
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${formatInstructorLabel(row.instructor)}</strong>
      <div class="muted tiny">Classes ${row.classes || 0} • Swimmers ${row.swimmers || 0} • Sub % ${row.subRate || 0}%</div>`
    instructorTable.appendChild(item)
  })
}

function renderRosterHealthReport(data) {
  if (!rosterHealthTable || !rosterHealthKpis) return
  if (!data) {
    rosterHealthTable.innerHTML = '<div class="hint">No roster health data.</div>'
    renderKpis(rosterHealthKpis, [])
    return
  }
  renderKpis(rosterHealthKpis, [
    { label: 'Missing zones', value: data.summary?.missingZones || 0 },
    { label: 'Missing instructors', value: data.summary?.missingInstructors || 0 },
    { label: 'Duplicates', value: data.summary?.duplicates || 0 }
  ])
  rosterHealthTable.innerHTML = ''
  const issues = []
  ;(data.missingZones || []).forEach((row) => issues.push({ label: 'Missing zone', row }))
  ;(data.missingInstructors || []).forEach((row) => issues.push({ label: 'Missing instructor', row }))
  ;(data.duplicates || []).forEach((row) => issues.push({ label: 'Duplicate', row }))
  if (!issues.length) {
    rosterHealthTable.innerHTML = '<div class="hint">No data issues detected.</div>'
    return
  }
  issues.forEach((issue) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${issue.label}</strong>
      <div class="muted tiny">${issue.row.swimmer_name || ''} • ${issue.row.class_date || ''} ${issue.row.start_time || ''} • ${issue.row.class_name || ''}</div>`
    rosterHealthTable.appendChild(item)
  })
}

function renderSspReport(data) {
  if (!sspTable) return
  if (!data) {
    sspTable.innerHTML = '<div class="hint">No SSP data.</div>'
    return
  }
  const byDate = Array.isArray(data.byDate) ? data.byDate : []
  const labels = byDate.map((d) => d.date)
  const counts = byDate.map((d) => d.count || 0)
  sspChart = renderChart(sspChartEl, {
    type: 'line',
    data: { labels, datasets: [{ label: 'SSP Passes', data: counts, borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.2)', tension: 0.2 }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  }, sspChart)

  const rows = Array.isArray(data.byInstructor) ? data.byInstructor : []
  sspTable.innerHTML = ''
  if (!rows.length) {
    sspTable.innerHTML = '<div class="hint">No SSP passes yet.</div>'
    return
  }
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${formatInstructorLabel(row.instructor)}</strong>
      <div class="muted tiny">Passes ${row.count || 0}</div>`
    sspTable.appendChild(item)
  })
}

function renderEnrollmentReport(data) {
  if (!enrollmentTable) return
  if (!data) {
    enrollmentTable.innerHTML = '<div class="hint">No enrollment data.</div>'
    return
  }
  const leads = Array.isArray(data.leads) ? data.leads : []
  const enrollments = Array.isArray(data.enrollments) ? data.enrollments : []
  const dates = Array.from(new Set([...leads.map((l) => l.date), ...enrollments.map((e) => e.date)])).sort()
  const leadMap = new Map(leads.map((l) => [l.date, l.count || 0]))
  const enrollMap = new Map(enrollments.map((e) => [e.date, e.count || 0]))
  const leadCounts = dates.map((d) => leadMap.get(d) || 0)
  const enrollCounts = dates.map((d) => enrollMap.get(d) || 0)
  const attendance = Array.isArray(data.attendanceSignals) ? data.attendanceSignals : []
  const attendanceMap = new Map(attendance.map((a) => [a.date, a.count || 0]))
  const attendanceCounts = dates.map((d) => attendanceMap.get(d) || 0)

  enrollmentChart = renderChart(enrollmentChartEl, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        { label: 'Leads', data: leadCounts, borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.2)', tension: 0.2 },
        { label: 'Enrollments', data: enrollCounts, borderColor: '#22C55E', backgroundColor: 'rgba(34,197,94,0.2)', tension: 0.2 },
        { label: 'First-class signals', data: attendanceCounts, borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.2)', tension: 0.2 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  }, enrollmentChart)

  enrollmentTable.innerHTML = ''
  if (!dates.length) {
    enrollmentTable.innerHTML = '<div class="hint">No enrollment activity.</div>'
  } else {
    dates.forEach((date) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${date}</strong>
      <div class="muted tiny">Leads ${leadMap.get(date) || 0} • Enrollments ${enrollMap.get(date) || 0}</div>`
    enrollmentTable.appendChild(item)
  })
  }

  if (enrollmentByLocation) {
    const byLoc = Array.isArray(data.byLocation) ? data.byLocation : []
    enrollmentByLocation.innerHTML = ''
    if (!byLoc.length) {
      enrollmentByLocation.innerHTML = '<div class="hint">No location data.</div>'
    } else {
      byLoc.forEach((row) => {
        const item = document.createElement('div')
        item.className = 'list-item'
        item.innerHTML = `<strong>${row.location_name || ''}</strong>
          <div class="muted tiny">Leads ${row.leads || 0} • Enrollments ${row.enrollments || 0}</div>`
        enrollmentByLocation.appendChild(item)
      })
    }
  }

  if (enrollmentByStaff) {
    const byStaff = Array.isArray(data.byStaff) ? data.byStaff : []
    enrollmentByStaff.innerHTML = ''
    if (!byStaff.length) {
      enrollmentByStaff.innerHTML = '<div class="hint">No staff signals.</div>'
    } else {
      byStaff.forEach((row) => {
        const item = document.createElement('div')
        item.className = 'list-item'
        item.innerHTML = `<strong>${formatInstructorLabel(row.instructor)}</strong>
          <div class="muted tiny">First-class signals ${row.count || 0}</div>`
        enrollmentByStaff.appendChild(item)
      })
    }
  }

  if (enrollmentWorkQueue) {
    const work = Array.isArray(data.workQueue) ? data.workQueue : []
    enrollmentWorkQueue.innerHTML = ''
    if (!work.length) {
      enrollmentWorkQueue.innerHTML = '<div class="hint">No work queue items.</div>'
    } else {
      work.forEach((row) => {
        const item = document.createElement('div')
        item.className = 'list-item'
        item.innerHTML = `<strong>${row.full_name || ''}</strong>
          <div class="muted tiny">${row.lead_date || ''} • ${row.email || ''} ${row.phone ? '• ' + row.phone : ''}</div>`
        enrollmentWorkQueue.appendChild(item)
      })
    }
  }
}

function renderRetentionReport(data) {
  if (!retentionTable) return
  const rows = Array.isArray(data?.rows) ? data.rows : []
  retentionTable.innerHTML = ''
  if (!rows.length) {
    retentionTable.innerHTML = '<div class="hint">No retention data.</div>'
    return
  }
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${row.instructor_name || ''}</strong>
      <div class="muted tiny">Booked ${row.booked || 0} • Retained ${row.retained || 0} • ${row.percent_this_cycle || 0}%</div>`
    retentionTable.appendChild(item)
  })
}

function renderAgedAccountsReport(data) {
  if (!agedAccountsTable) return
  const rows = Array.isArray(data?.rows) ? data.rows : []
  agedAccountsTable.innerHTML = ''
  if (!rows.length) {
    agedAccountsTable.innerHTML = '<div class="hint">No aged accounts data.</div>'
    return
  }
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${row.bucket || 'Bucket'}</strong>
      <div class="muted tiny">Amount ${row.amount || 0} • Total ${row.total || 0}</div>`
    agedAccountsTable.appendChild(item)
  })
}

function renderDropListReport(data) {
  if (!dropListTable) return
  const rows = Array.isArray(data?.rows) ? data.rows : []
  dropListTable.innerHTML = ''
  if (!rows.length) {
    dropListTable.innerHTML = '<div class="hint">No drop list entries.</div>'
    return
  }
  rows.forEach((row) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${row.swimmer_name || ''}</strong>
      <div class="muted tiny">${row.drop_date || ''} • ${row.reason || ''}</div>`
    dropListTable.appendChild(item)
  })
}

function renderContacts() {
  if (!contactsTable || !contactsDuplicates) return
  contactsTable.innerHTML = ''
  contactsDuplicates.innerHTML = ''
  const contacts = Array.isArray(state.contacts) ? state.contacts : []
  const duplicates = Array.isArray(state.contactDuplicates) ? state.contactDuplicates : []
  if (duplicates.length) {
    duplicates.forEach((dup) => {
      const item = document.createElement('div')
      item.className = 'list-item'
      item.innerHTML = `<strong>Possible duplicate</strong>
        <div class="muted tiny">${dup.email || ''} • ${dup.count || 0} contacts</div>`
      contactsDuplicates.appendChild(item)
    })
  }
  if (!contacts.length) {
    contactsTable.innerHTML = '<div class="hint">No contacts available.</div>'
    return
  }
  contacts.forEach((c) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    item.innerHTML = `<strong>${c.full_name || 'Contact'}</strong>
      <div class="muted tiny">${c.email || ''} ${c.phone ? '• ' + c.phone : ''}</div>`
    const mergeBtn = document.createElement('button')
    mergeBtn.className = 'secondary miniBtn'
    mergeBtn.textContent = 'Merge'
    mergeBtn.addEventListener('click', () => openContactMerge(c.id))
    item.appendChild(mergeBtn)

    const billingBtn = document.createElement('button')
    billingBtn.className = 'secondary miniBtn'
    billingBtn.textContent = 'Billing Ticket'
    billingBtn.addEventListener('click', () => openBillingFlag({ contact_id: c.id }))
    item.appendChild(billingBtn)
    contactsTable.appendChild(item)
  })
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`
  }
  return raw
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportAttendanceCsv() {
  const data = state.reports.attendance
  if (!data) return
  const rows = [['Aquatics Staff', 'Present', 'Absent', 'Unknown', 'Total']]
  ;(data.byInstructor || []).forEach((r) => {
    rows.push([formatInstructorLabel(r.instructor), r.present || 0, r.absent || 0, r.unknown || 0, r.total || 0])
  })
  downloadCsv('attendance_report.csv', rows)
}

function exportInstructorCsv() {
  const data = state.reports.instructorLoad
  if (!data) return
  const rows = [['Aquatics Staff', 'Classes', 'Swimmers', 'Sub Count', 'Sub Rate']]
  ;(data.byInstructor || []).forEach((r) => {
    rows.push([formatInstructorLabel(r.instructor), r.classes || 0, r.swimmers || 0, r.subCount || 0, r.subRate || 0])
  })
  downloadCsv('instructor_load.csv', rows)
}

function exportRosterHealthCsv() {
  const data = state.reports.rosterHealth
  if (!data) return
  const rows = [['Issue', 'Swimmer', 'Date', 'Time', 'Class']]
  const add = (label, row) => rows.push([label, row.swimmer_name || '', row.class_date || '', row.start_time || '', row.class_name || ''])
  ;(data.missingZones || []).forEach((row) => add('Missing zone', row))
  ;(data.missingInstructors || []).forEach((row) => add('Missing instructor', row))
  ;(data.duplicates || []).forEach((row) => add('Duplicate', row))
  downloadCsv('roster_health.csv', rows)
}

function exportSspCsv() {
  const data = state.reports.ssp
  if (!data) return
  const rows = [['Aquatics Staff', 'Passes']]
  ;(data.byInstructor || []).forEach((r) => {
    rows.push([formatInstructorLabel(r.instructor), r.count || 0])
  })
  downloadCsv('ssp_tracker.csv', rows)
}

function exportEnrollmentCsv() {
  const data = state.reports.enrollment
  if (!data) return
  const rows = [['Date', 'Leads', 'Enrollments']]
  const leads = Array.isArray(data.leads) ? data.leads : []
  const enrollments = Array.isArray(data.enrollments) ? data.enrollments : []
  const dates = Array.from(new Set([...leads.map((l) => l.date), ...enrollments.map((e) => e.date)])).sort()
  const leadMap = new Map(leads.map((l) => [l.date, l.count || 0]))
  const enrollMap = new Map(enrollments.map((e) => [e.date, e.count || 0]))
  dates.forEach((date) => {
    rows.push([date, leadMap.get(date) || 0, enrollMap.get(date) || 0])
  })
  downloadCsv('enrollment_tracker.csv', rows)
}

function exportRetentionCsv() {
  const data = state.reports.retention
  if (!data) return
  const rows = [['Aquatics Staff', 'Booked', 'Retained', 'Percent']]
  ;(data.rows || []).forEach((r) => {
    rows.push([r.instructor_name || '', r.booked || 0, r.retained || 0, r.percent_this_cycle || 0])
  })
  downloadCsv('retention_report.csv', rows)
}

function exportAgedAccountsCsv() {
  const data = state.reports.agedAccounts
  if (!data) return
  const rows = [['Report Date', 'Bucket', 'Amount', 'Total']]
  ;(data.rows || []).forEach((r) => {
    rows.push([r.report_date || '', r.bucket || '', r.amount || 0, r.total || 0])
  })
  downloadCsv('aged_accounts.csv', rows)
}

function exportDropListCsv() {
  const data = state.reports.dropList
  if (!data) return
  const rows = [['Drop Date', 'Swimmer', 'Reason']]
  ;(data.rows || []).forEach((r) => {
    rows.push([r.drop_date || '', r.swimmer_name || '', r.reason || ''])
  })
  downloadCsv('drop_list.csv', rows)
}

function exportContactsCsv() {
  const contacts = Array.isArray(state.contacts) ? state.contacts : []
  const rows = [['Name', 'Email', 'Phone', 'Source']]
  contacts.forEach((c) => rows.push([c.full_name || '', c.email || '', c.phone || '', c.source || '']))
  downloadCsv('contacts.csv', rows)
}

async function loadReports() {
  const role = getEffectiveRoleKey()
  const locationId = role === 'admin' ? 'all' : state.locationId
  if (!locationId) {
    setReportsStatus('Select a location to view reports.')
    return
  }
  ensureReportDates()
  const filters = getReportFilters()
  if (!filters.start || !filters.end) {
    setReportsStatus('Select a date range.')
    return
  }
  setReportsStatus('Loading report…')

  const params = new URLSearchParams({
    start: filters.start,
    end: filters.end
  })
  if (locationId) params.set('locationId', locationId)
  if (filters.instructor) params.set('instructor', filters.instructor)
  if (filters.program) params.set('program', filters.program)

  const fetchReport = async (path) => {
    try {
      return await apiFetch(`${path}?${params.toString()}`)
    } catch {
      return null
    }
  }

  const subtab = state.subtabs.reports || 'index'
  if (subtab === 'enrollment-tracker') {
    const enrollment = await fetchReport('/reports/enrollment-tracker')
    state.reports.enrollment = enrollment
    renderEnrollmentReport(enrollment)
  }
  if (subtab === 'instructor-retention') {
    const retention = await fetchReport('/reports/retention')
    state.reports.retention = retention
    renderRetentionReport(retention)
  }
  if (subtab === 'aged-accounts') {
    const agedAccounts = await fetchReport('/reports/aged-accounts')
    state.reports.agedAccounts = agedAccounts
    renderAgedAccountsReport(agedAccounts)
  }
  if (subtab === 'drop-list') {
    const dropList = await fetchReport('/reports/drop-list')
    state.reports.dropList = dropList
    renderDropListReport(dropList)
  }
  if (subtab === 'contacts') {
    await loadContacts()
  }
  if (subtab === 'roster-health') {
    const rosterHealth = await fetchReport('/reports/roster-health')
    state.reports.rosterHealth = rosterHealth
    renderRosterHealthReport(rosterHealth)
  }
  setReportsStatus('Report updated.')
}

async function loadContacts() {
  if (!contactsTable) return
  const role = getEffectiveRoleKey()
  const locationId = role === 'admin' ? 'all' : state.locationId
  if (!locationId) {
    contactsTable.innerHTML = '<div class="hint">Select a location to view contacts.</div>'
    return
  }
  const params = new URLSearchParams()
  params.set('locationId', locationId)
  if (contactsSearch?.value) params.set('search', contactsSearch.value)
  contactsTable.innerHTML = '<div class="hint">Loading contacts…</div>'
  try {
    const data = await apiFetch(`/contacts?${params.toString()}`)
    state.contacts = data.contacts || []
    state.contactDuplicates = data.duplicates || []
    renderContacts()
  } catch (err) {
    contactsTable.innerHTML = `<div class="hint">${err?.error || 'Failed to load contacts.'}</div>`
  }
}

async function openContactMerge(contactId) {
  const otherId = prompt('Enter the ID of the contact to merge with:')
  if (!otherId) return
  try {
    await apiFetch('/contacts/merge', {
      method: 'POST',
      body: JSON.stringify({ contactIds: [contactId, otherId], canonicalId: contactId })
    })
    await loadContacts()
  } catch (err) {
    alert(err?.error || 'Merge failed')
  }
}

async function loadUploads() {
  const role = getEffectiveRoleKey()
  const locationId = role === 'admin' ? 'all' : state.locationId
  if (!locationId) {
    if (uploadHistoryList) uploadHistoryList.innerHTML = '<div class="hint">Select a location to view uploads.</div>'
    return
  }
  const data = await apiFetch(`/uploads/history?locationId=${locationId}`)
  if (!uploadHistoryList) return
  uploadHistoryList.innerHTML = ''
  const items = Array.isArray(data.uploads) ? data.uploads : []
  if (!items.length) {
    uploadHistoryList.innerHTML = '<div class="hint">No uploads yet.</div>'
    return
  }
  items.forEach((upload) => {
    const item = document.createElement('div')
    item.className = 'list-item'
    const meta = [
      upload.type,
      upload.parsed_count !== null ? `Parsed ${upload.parsed_count}` : null,
      upload.inserted_count !== null ? `Inserted ${upload.inserted_count}` : null
    ].filter(Boolean).join(' • ')
    item.innerHTML = `<strong>${upload.original_filename || upload.report_title || upload.type}</strong>
      <div class="muted tiny">${new Date(upload.uploaded_at).toLocaleString()} • ${upload.location_name || ''}</div>
      <div class="muted tiny">${meta}</div>
      <div class="muted tiny">${upload.detected_start_date || ''} ${upload.detected_end_date ? '→ ' + upload.detected_end_date : ''}</div>`
    uploadHistoryList.appendChild(item)
  })
}

async function loadStaff() {
  const role = getEffectiveRoleKey()
  const locationId = role === 'admin' ? 'all' : state.locationId
  if (!locationId) {
    if (staffList) staffList.innerHTML = '<div class="hint">Select a location to view staff.</div>'
    return
  }
  const data = await apiFetch(`/staff?locationId=${locationId}`)
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
      <div class="muted tiny">${s.location_name || ''}</div>
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
    const title = i.raw_subject || i.client_name || 'Intake'
    item.innerHTML = `<strong>${title}</strong>
      <div class="muted tiny">${i.location_name || i.location_name_raw || 'Unassigned'} • ${i.status}</div>
      <div class="muted tiny">${i.contact_email || ''} ${i.contact_phone || ''}</div>`

    const statusSelect = document.createElement('select')
    ;['new','contacted','scheduled','closed'].forEach((s) => {
      const opt = document.createElement('option')
      opt.value = s
      opt.textContent = s
      if (i.status === s) opt.selected = true
      statusSelect.appendChild(opt)
    })

    const swimmerInput = document.createElement('input')
    swimmerInput.placeholder = 'Swimmer name'
    swimmerInput.value = i.swimmer_name || i.client_name || ''

    const guardianInput = document.createElement('input')
    guardianInput.placeholder = 'Guardian name'
    guardianInput.value = i.guardian_name || ''

    const emailInput = document.createElement('input')
    emailInput.placeholder = 'Email'
    emailInput.value = i.contact_email || ''

    const phoneInput = document.createElement('input')
    phoneInput.placeholder = 'Phone'
    phoneInput.value = i.contact_phone || ''

    const startDateInput = document.createElement('input')
    startDateInput.type = 'date'
    startDateInput.value = i.requested_start_date ? String(i.requested_start_date).slice(0, 10) : ''

    const notes = document.createElement('textarea')
    notes.value = i.notes || ''
    notes.placeholder = 'Notes'

    const saveBtn = document.createElement('button')
    saveBtn.className = 'secondary miniBtn'
    saveBtn.textContent = 'Save'
    saveBtn.addEventListener('click', async () => {
      await apiFetch(`/intakes/${i.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusSelect.value,
          notes: notes.value,
          swimmer_name: swimmerInput.value,
          guardian_name: guardianInput.value,
          contact_email: emailInput.value,
          contact_phone: phoneInput.value,
          requested_start_date: startDateInput.value || null
        })
      })
      loadIntakes()
    })

    item.appendChild(statusSelect)
    item.appendChild(swimmerInput)
    item.appendChild(guardianInput)
    item.appendChild(emailInput)
    item.appendChild(phoneInput)
    item.appendChild(startDateInput)
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
    if (loc.id === 'all') return
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
    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'secondary miniBtn'
    deleteBtn.textContent = 'Deactivate'
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Deactivate ${loc.name}?`)) return
      await apiFetch(`/locations/${loc.id}`, { method: 'DELETE' })
      await loadLocations()
      renderLocationAdmin()
    })
    item.appendChild(deleteBtn)
    locationAdminList.appendChild(item)
  })
}

function formatLoginError(err) {
  if (!err) return 'Login failed.'
  if (err.error) return String(err.error)
  if (err.message) return String(err.message)
  return 'Login failed.'
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (loginError) loginError.textContent = ''
  let data
  try {
    data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: el('username').value,
        pin: el('pin').value
      })
    })
  } catch (err) {
    if (loginError) loginError.textContent = formatLoginError(err)
    setLoggedOut()
    return
  }
  setAuth(data.token, data.user)
  setLoggedIn()
  bootstrap().catch((err) => {
    console.error('Bootstrap failed', err)
    if (loginError) loginError.textContent = formatLoginError(err)
    setLoggedOut()
  })
})

logoutBtn?.addEventListener('click', () => {
  setLoggedOut()
})

locationSelect?.addEventListener('change', () => {
  state.locationId = locationSelect.value
  if (state.locationId) localStorage.setItem(locationPrefKey, state.locationId)
  state.manualOverride = false
  state.selectedClassKey = null
  state.showAllTimes = false
  timeBlocksExpanded = false
  if (timeBlocks) timeBlocks.classList.add('hidden')
  state.search = ''
  if (rosterSearch) rosterSearch.value = ''
  if (searchClear) searchClear.classList.add('hidden')
  if (state.view === 'roster' && state.locationId === 'all') {
    const first = (state.locations || []).find((loc) => loc.id && loc.id !== 'all')
    if (first) {
      state.locationId = first.id
      locationSelect.value = first.id
    }
  }
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
  applyRoleUi()
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
  if (state.view === 'reports') loadReports()
  Object.keys(reportPreflightCache).forEach((k) => delete reportPreflightCache[k])
  if (reportConfirmCheckbox) reportConfirmCheckbox.checked = false
  if (reportConfirmStatus) reportConfirmStatus.textContent = ''
  state.observationRoster = []
  state.observationSwimmers = []
  if (obsDate) obsDate.value = state.date || ''
  if (obsClassSelect) obsClassSelect.innerHTML = ''
  if (obsRosterStatus) obsRosterStatus.textContent = ''
  if (obsSwimmerList) obsSwimmerList.innerHTML = ''
})

dateSelect?.addEventListener('change', () => {
  state.date = dateSelect.value
  state.manualOverride = false
  state.selectedClassKey = null
  state.showAllTimes = false
  timeBlocksExpanded = false
  if (timeBlocks) timeBlocks.classList.add('hidden')
  void loadRosterEntries()
  loadDayClosure()
  refreshAlerts()
  if (state.view === 'reports') loadReports()
})

rosterModeSelect?.addEventListener('change', () => {
  if (rosterModeSelect.value === 'mine' && state.locationId === 'all') {
    rosterModeSelect.value = 'all'
    return
  }
  setRosterMode(rosterModeSelect.value)
})

todayBtn?.addEventListener('click', () => {
  const today = todayIsoInTz(getLocationTimeZone())
  state.date = today
  if (dateSelect) dateSelect.value = today
  updateContext()
  void loadRosterEntries()
})

timePillToggle?.addEventListener('click', () => {
  timeBlocksExpanded = !timeBlocksExpanded
  if (timeBlocks) timeBlocks.classList.toggle('hidden', !timeBlocksExpanded)
})

announcerTimeToggle?.addEventListener('click', () => {
  announcerBlocksExpanded = !announcerBlocksExpanded
  if (announcerBlocks) announcerBlocks.classList.toggle('hidden', !announcerBlocksExpanded)
})

announcerSpeakBtn?.addEventListener('click', async () => {
  if (!announcerText || !announcerStatus) return
  const text = announcerText.value.trim()
  if (!text) {
    announcerStatus.textContent = 'Type a message first.'
    return
  }
  const cls = state.showAllTimes ? null : getSelectedClassInstance()
  const time = state.showAllTimes ? null : (cls?.start_time ? normalizeTimeKey(cls.start_time) : null)
  if (!state.showAllTimes && !time) {
    announcerStatus.textContent = 'Select a time first.'
    return
  }
  announcerStatus.textContent = 'Sending…'
  try {
    await apiFetch('/announcer/speak', {
      method: 'POST',
      body: JSON.stringify({
        locationId: state.locationId,
        time,
        text
      })
    })
    announcerStatus.textContent = 'Sent ✓'
  } catch (err) {
    announcerStatus.textContent = err?.error || 'Announcer failed'
  }
})

announcerClearBtn?.addEventListener('click', () => {
  if (announcerText) announcerText.value = ''
  if (announcerStatus) announcerStatus.textContent = 'Cleared'
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

bulkMarkPresent?.addEventListener('click', () => bulkAttendance(1))
bulkClearAttendance?.addEventListener('click', () => bulkAttendance(null))
addSwimmerBtn?.addEventListener('click', openAddSwimmer)
addSwimmerClose?.addEventListener('click', closeAddSwimmer)
addSwimmerSave?.addEventListener('click', addLocalSwimmer)
rosterNoteClose?.addEventListener('click', closeRosterNote)
rosterNoteSave?.addEventListener('click', saveRosterNote)
rosterNoteClear?.addEventListener('click', clearRosterNote)
sspPassBtn?.addEventListener('click', markSspPassed)
sspRevokeBtn?.addEventListener('click', markSspRevoked)
billingFlagBtn?.addEventListener('click', () => {
  const entryId = state.noteEntityId || state.rosterNoteEntryId
  const entry = (state.rosterEntries || []).find((r) => r.id === entryId)
  if (entry) openBillingFlag(entry)
})
rosterNoteModal?.addEventListener('click', (e) => { if (e.target === rosterNoteModal) closeRosterNote() })
addSwimmerModal?.addEventListener('click', (e) => { if (e.target === addSwimmerModal) closeAddSwimmer() })
obsFormTab?.addEventListener('click', () => setSubtab('observations', 'form'))
obsDashTab?.addEventListener('click', () => setSubtab('observations', 'dashboard'))
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
managerNotificationsRefresh?.addEventListener('click', loadNotifications)
activityClear?.addEventListener('click', () => {
  if (activityFrom) activityFrom.value = ''
  if (activityTo) activityTo.value = ''
  if (activityFilter) activityFilter.value = ''
  if (activityUserInput) { activityUserInput.value = ''; activityUserInput.dataset.userId = '' }
  localStorage.removeItem(activityFiltersKey)
  ensureActivityDefaultDates()
  loadActivityFeed()
})
billingSaveBtn?.addEventListener('click', saveBillingModal)
billingCancelBtn?.addEventListener('click', closeBillingModal)
billingRefreshBtn?.addEventListener('click', loadBillingTickets)
billingStatusFilter?.addEventListener('change', loadBillingTickets)
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

 eodRefresh?.addEventListener('click', () => { refreshAlerts(); loadDayClosure() })
eodCloseBtn?.addEventListener('click', closeDay)
eodReopenBtn?.addEventListener('click', reopenDay)
printRosterBtn?.addEventListener('click', () => triggerPrint('Roster'))
printIntakeBtn?.addEventListener('click', () => triggerPrint('Intakes'))
uploadConfirmBtn?.addEventListener('click', openUploadConfirm)
document.querySelectorAll('.uploadConfirmTrigger').forEach((btn) => {
  btn.addEventListener('click', openUploadConfirm)
})
uploadConfirmClose?.addEventListener('click', closeUploadConfirm)
uploadConfirmRun?.addEventListener('click', runUploadConfirm)
reportConfirmClose?.addEventListener('click', closeReportConfirm)
reportConfirmRun?.addEventListener('click', runReportConfirm)
reportConfirmCheckbox?.addEventListener('change', () => {
  if (reportConfirmRun) reportConfirmRun.disabled = !reportConfirmCheckbox.checked
})
reportConfirmModal?.addEventListener('click', (e) => { if (e.target === reportConfirmModal) closeReportConfirm() })
document.querySelectorAll('[data-report-preflight]').forEach((btn) => {
  btn.addEventListener('click', () => preflightReportUpload(btn.dataset.reportPreflight))
})
document.querySelectorAll('[data-report-upload]').forEach((btn) => {
  btn.addEventListener('click', () => openReportConfirm(btn.dataset.reportUpload))
})

classNoteBtn?.addEventListener('click', () => {
  const cls = getSelectedClassInstance()
  if (cls && cls.id) openEntityNote('class_instance', cls.id)
})


let pendingUploadFile = null
let pendingUploadHash = null
let pendingUploadIsDuplicate = false
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
  if (enrollmentRosterFile?.files?.[0]) {
    uploadStatusTarget = uploadStatusEnrollment
    return enrollmentRosterFile.files[0]
  }
  return null
}

function setUploadStatus(textValue) {
  if (uploadStatusTarget) uploadStatusTarget.textContent = textValue || ''
}

function syncUploadConfirmState() {
  if (!uploadConfirmRun) return
  uploadConfirmRun.disabled = false
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
    pendingUploadIsDuplicate = !!data.isDuplicate
    if (uploadConfirmSummary) {
      uploadConfirmSummary.textContent = `Location: ${data.locationName || ''}
Classes: ${data.classCount || 0}
Swimmers: ${data.swimmerCount || 0}
Date range: ${data.dateStart || ''} to ${data.dateEnd || ''}`
      if (data.classInserts !== undefined || data.classUpdates !== undefined) {
        uploadConfirmSummary.textContent += `\nClass inserts: ${data.classInserts || 0} • updates: ${data.classUpdates || 0}`
      }
      if (data.swimmerInserts !== undefined || data.swimmerUpdates !== undefined) {
        uploadConfirmSummary.textContent += `\nSwimmer inserts: ${data.swimmerInserts || 0} • updates: ${data.swimmerUpdates || 0}`
      }
      if ((data.classUpdates || 0) > 0 || (data.swimmerUpdates || 0) > 0) {
        uploadConfirmSummary.textContent += `\nExisting roster detected. Choose Merge or Replace.`
      }
    }
    if (uploadMergeMode) uploadMergeMode.value = 'merge'
    if (data.isDuplicate && uploadConfirmSummary) {
      uploadConfirmSummary.textContent += '\nDuplicate detected: this file was already uploaded.'
    }
    syncUploadConfirmState()
    if (uploadConfirmModal) {
      uploadConfirmModal.classList.remove('hidden')
      uploadConfirmModal.style.pointerEvents = 'auto'
    }
    setUploadStatus('')
  } catch (err) {
    const msg = err?.error || err?.message || 'Preflight failed'
    console.error('Upload preflight failed', err)
    setUploadStatus(msg)
  }
}

async function runUploadConfirm() {
  if (!pendingUploadFile) return
  setUploadStatus('Uploading…')
  try {
    const formData = new FormData()
    formData.append('file', pendingUploadFile)
    const mode = uploadMergeMode?.value || 'merge'
    const data = await apiFetch(`/uploads/roster?locationId=${state.locationId}&date=${state.date}&mode=${mode}`, {
      method: 'POST',
      body: formData
    })
    setUploadStatus(`Upload complete. Classes: ${data.classesInserted}, Swimmers: ${data.swimmersInserted}`)
    if (rosterFile) rosterFile.value = ''
    if (uploadRosterFile) uploadRosterFile.value = ''
    if (enrollmentRosterFile) enrollmentRosterFile.value = ''
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

document.querySelectorAll('[data-subtab-link]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const sub = btn.dataset.subtabLink
    if (sub) setSubtab('reports', sub)
  })
})

document.querySelectorAll('[data-subtab-btn]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const section = btn.closest('section')
    if (!section || !section.id || !section.id.startsWith('view')) return
    const view = section.id.replace('view', '').toLowerCase()
    setSubtab(view, btn.dataset.subtabBtn)
  })
})


staffSearch?.addEventListener('input', renderStaffList)
contactsSearch?.addEventListener('input', () => { loadContacts() })
refreshVariants?.addEventListener('click', loadInstructorVariants)
intakeStatusFilter?.addEventListener('change', loadIntakes)
gmailConnectBtn?.addEventListener('click', async () => {
  try {
    const data = await apiFetch('/integrations/gmail/auth/start')
    if (data.url) window.location.href = data.url
  } catch (err) {
    alert(err?.error || 'Gmail OAuth not configured')
  }
})
reportsRefreshBtn?.addEventListener('click', loadReports)
reportStartDate?.addEventListener('change', loadReports)
reportEndDate?.addEventListener('change', loadReports)
reportInstructorFilter?.addEventListener('change', loadReports)
reportProgramFilter?.addEventListener('change', loadReports)
hubspotSyncBtn?.addEventListener('click', async () => {
  try {
    setReportsStatus('Syncing HubSpot…')
    await apiFetch('/integrations/hubspot/contacts', { method: 'POST', body: JSON.stringify({ limit: 100 }) })
    await loadContacts()
    setReportsStatus('HubSpot sync complete.')
  } catch (err) {
    setReportsStatus(err?.error || 'HubSpot sync failed.')
  }
})
homebaseSyncBtn?.addEventListener('click', async () => {
  if (homebaseSyncStatus) homebaseSyncStatus.textContent = 'Syncing Homebase…'
  try {
    await apiFetch('/integrations/homebase/sync', { method: 'POST', body: JSON.stringify({}) })
    if (homebaseSyncStatus) homebaseSyncStatus.textContent = 'Homebase sync complete.'
    loadHomebaseSyncStatus()
  } catch (err) {
    if (homebaseSyncStatus) homebaseSyncStatus.textContent = err?.error || 'Homebase sync failed.'
  }
})
attendanceExportBtn?.addEventListener('click', exportAttendanceCsv)
instructorExportBtn?.addEventListener('click', exportInstructorCsv)
rosterHealthExportBtn?.addEventListener('click', exportRosterHealthCsv)
sspExportBtn?.addEventListener('click', exportSspCsv)
enrollmentExportBtn?.addEventListener('click', exportEnrollmentCsv)
retentionExportBtn?.addEventListener('click', exportRetentionCsv)
agedAccountsExportBtn?.addEventListener('click', exportAgedAccountsCsv)
dropListExportBtn?.addEventListener('click', exportDropListCsv)
contactsExportBtn?.addEventListener('click', exportContactsCsv)
revBtn?.addEventListener('click', () => { void showRevModal() })
revClose?.addEventListener('click', hideRevModal)
revModal?.addEventListener('click', (e) => { if (e.target === revModal) hideRevModal() })
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
locationAddBtn?.addEventListener('click', async () => {
  if (!locationAddName || !locationAddCode) return
  if (!locationAddName.value || !locationAddCode.value) {
    if (locationAddStatus) locationAddStatus.textContent = 'Name and code are required.'
    return
  }
  if (locationAddStatus) locationAddStatus.textContent = 'Adding…'
  try {
    await apiFetch('/locations', {
      method: 'POST',
      body: JSON.stringify({
        name: locationAddName.value,
        code: locationAddCode.value,
        state: locationAddState?.value || null,
        timezone: locationAddTimezone?.value || null
      })
    })
    locationAddName.value = ''
    locationAddCode.value = ''
    if (locationAddState) locationAddState.value = ''
    if (locationAddTimezone) locationAddTimezone.value = ''
    if (locationAddStatus) locationAddStatus.textContent = 'Location added.'
    await loadLocations()
    renderLocationAdmin()
  } catch (err) {
    if (locationAddStatus) locationAddStatus.textContent = err?.error || 'Add failed.'
  }
})
qaRoleSelect?.addEventListener('change', () => {
  const val = qaRoleSelect.value
  if (val) localStorage.setItem(qaRolePrefKey, val)
  else localStorage.removeItem(qaRolePrefKey)
  applyLocationFeatures()
  applyRoleUi()
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
    bootstrap().catch((err) => console.error('Bootstrap after PIN change failed', err))
  } catch (err) {
    if (changePinStatus) changePinStatus.textContent = err?.error || 'Save failed.'
  }
})

async function bootstrap() {
  debugLog('BOOT', 'Starting bootstrap...')
  assertSafeEnvironment()
  setLoggedIn()
  debugLog('BOOT', 'User logged in, loading data...')

  await loadVersion()
  updateFooterVersion()
  await loadMeta()
  if (userInfo) userInfo.textContent = state.user ? `${state.user.firstName || ''} ${state.user.lastName || ''} • ${getEffectiveRoleLabel()}` : ''
  if (state.user && state.user.mustChangePin) {
    showChangePinModal()
    return
  }
  await loadLocations()
  renderUserAdminLocations()
  applyQaControls()
  applyRoleUi()
  applyInstructorOverride()
  await loadAdminUsers()
  await loadIntegrationStatus()

  const tz = getLocationTimeZone() || 'America/New_York'
  state.date = todayIsoInTz(tz)
  state.search = ''
  if (dateSelect) dateSelect.value = state.date
  if (rosterSearch) rosterSearch.value = ''
  if (searchClear) searchClear.classList.add('hidden')
  updateContext()
  ensureReportDates()

  const roleKey = state.user?.effectiveRoleKey || state.user?.roleKey || ''
  state.rosterMode = roleKey === 'instructor' ? 'mine' : 'all'
  if (rosterModeSelect) rosterModeSelect.value = state.rosterMode
  setRosterMode(state.rosterMode)
  const route = parseRouteHash()
  if (route?.view) {
    setView(route.view, { silent: true })
    if (route.subtab) setSubtab(route.view, route.subtab, { silent: true })
  } else {
    setView('roster', { silent: true })
  }
  applySubtab(state.view)
  activateView(state.view)
  debugLog('BOOT', 'Bootstrap complete, view:', state.view)
}

applyLayoutMode()
debugLog('INIT', 'Layout mode applied:', localStorage.getItem('layoutMode') || 'auto')

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
