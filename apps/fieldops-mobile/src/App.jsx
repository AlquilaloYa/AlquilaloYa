import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { fieldopsApi } from './fieldops-api'
import './App.css'

const primaryTabs = [
  { id: 'home', icon: 'home', label: 'Inicio' },
  { id: 'tasks', icon: 'notebook', label: 'Mis tareas' },
  { id: 'visits', icon: 'clock', label: 'Mis visitas' },
  { id: 'calendar', icon: 'calendar', label: 'Calendario' },
  { id: 'notifications', icon: 'bell', label: 'Avisos' },
  { id: 'profile', icon: 'person', label: 'Perfil' },
]

function NavigationIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    notebook: <><path d="M6 3h13v18H6z" /><path d="M9 3v18M12 8h4M12 12h4M12 16h4M3 6h3M3 10h3M3 14h3M3 18h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    person: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? paths.home}
    </svg>
  )
}

const workflowSteps = [
  'Recepción',
  'Visita programada',
  'Llegada',
  'Diagnóstico',
  'Recursos y trabajo',
  'Resolución y cierre',
]

function formatStatus(status) {
  const labels = {
    CREATED: 'Creada',
    ASSIGNED: 'Asignada',
    REASSIGNED: 'Reasignada',
    ACCEPTED: 'Aceptada',
    VISIT_SCHEDULED: 'Visita programada',
    ON_SITE: 'En sitio',
    DIAGNOSIS: 'Diagnóstico',
    ESTIMATED: 'Estimación lista',
    IN_PROGRESS: 'En proceso',
    RESOLVED: 'Resuelta',
    PENDING_CLOSURE: 'Pendiente de cierre',
    COMPLETED: 'Finalizada',
    REJECTED: 'Rechazada',
    BLOCKED: 'Bloqueada',
    CANCELLED: 'Cancelada',
    RESCHEDULED: 'Reprogramada',
  }
  return labels[status] ?? status
}

function formatDateTime(value) {
  if (!value) return 'Sin programar'
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

function currentTimestamp() {
  const now = new Date()
  return {
    label: now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    iso: now.toISOString(),
  }
}

function currentTimeLabel() {
  return currentTimestamp().label
}

function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

function mergeOrderSummary(current, summary) {
  return {
    ...current,
    ...summary,
    diagnosis: current.diagnosis,
    cause: current.cause,
    materials: current.materials,
    materialsConfirmed: current.materialsConfirmed,
    estimatedCost: current.estimatedCost,
    actualCost: current.actualCost,
    resolution: current.resolution,
    observations: current.observations,
    visits: current.visits,
    attachments: current.attachments,
    customerAppointments: current.customerAppointments,
    events: current.events,
  }
}

function App() {
  const [tasks, setTasks] = useState([])
  const tasksRef = useRef(tasks)
  const reloadOrdersRef = useRef(null)
  const openTaskRef = useRef(null)
  const pushTokenRef = useRef('')
  const knownOrderVersionsRef = useRef(null)
  const [user, setUser] = useState(null)
  const [sessionState, setSessionState] = useState('loading')
  const [isLoading, setIsLoading] = useState(false)
  const [storageWarning, setStorageWarning] = useState('')
  const [urgentNotice, setUrgentNotice] = useState(null)
  const [previewAttachment, setPreviewAttachment] = useState(null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaRequired, setMfaRequired] = useState(false)
  const [employees, setEmployees] = useState([])
  const [isTopBarElevated, setIsTopBarElevated] = useState(false)
  const scrollContainerRef = useRef(null)
  const [activeTab, setActiveTab] = useState('home')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskFilter, setTaskFilter] = useState('PENDIENTES')
  const [workflowStep, setWorkflowStep] = useState(0)
  const [todayDate] = useState(() => toDateKey(new Date()))
  const [dateLabel] = useState(() => new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date()))
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => toDateKey(new Date()))
  const [scheduleDate, setScheduleDate] = useState(() => toDateKey(new Date()))
  const [scheduleTime, setScheduleTime] = useState('10:30')
  const [followUpDate, setFollowUpDate] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [customerAppointmentRequested, setCustomerAppointmentRequested] = useState(false)
  const [customerAppointmentDate, setCustomerAppointmentDate] = useState('')
  const [customerAppointmentTime, setCustomerAppointmentTime] = useState('')
  const [customerAppointmentNote, setCustomerAppointmentNote] = useState('')
  const [visitDuration, setVisitDuration] = useState('150')
  const [scheduleNote, setScheduleNote] = useState('')
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [diagnosisDraft, setDiagnosisDraft] = useState('')
  const [causeDraft, setCauseDraft] = useState('')
  const [canResolveToday, setCanResolveToday] = useState(true)
  const [materialDraft, setMaterialDraft] = useState({ name: '', quantity: '' })
  const [materialsConfirmed, setMaterialsConfirmed] = useState(false)
  const [estimatedMinutesDraft, setEstimatedMinutesDraft] = useState('')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [resolutionDraft, setResolutionDraft] = useState('')
  const [observationsDraft, setObservationsDraft] = useState('')
  const [evidenceKind, setEvidenceKind] = useState('FOTO FINAL')
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [reassignTo, setReassignTo] = useState('')
  const [reassignReason, setReassignReason] = useState('')
  const [showReassign, setShowReassign] = useState(false)

  const selectedTask = tasks.find((task) => task.id === selectedTaskId)
  const openTasks = tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
  const pendingTasks = openTasks.filter((task) => !['ON_SITE', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE'].includes(task.status))
  const urgentTasks = openTasks.filter((task) => task.priority === 'URGENTE')
  const highTasks = openTasks.filter((task) => task.priority === 'ALTA')
  const completedTasks = tasks.filter((task) => task.status === 'COMPLETED')
  const recentOrders = [...tasks]
    .filter((task) => task.updatedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 3)
  const visits = useMemo(
    () => tasks.flatMap((task) => [
      ...task.visits.map((visit) => ({ ...visit, task, isCustomerAppointment: false })),
      ...(task.customerAppointments ?? []).map((appointment) => ({
        ...appointment,
        task,
        isCustomerAppointment: true,
      })),
    ])
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
    [tasks],
  )
  const calendarDays = useMemo(() => {
    const firstWeekday = (calendarMonth.getDay() + 6) % 7
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate()
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

    return Array.from({ length: cellCount }, (_, index) => {
      const day = index - firstWeekday + 1
      if (day < 1 || day > daysInMonth) return null
      const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day)
      const dateKey = toDateKey(date)
      return {
        day,
        dateKey,
        hasVisit: visits.some((visit) => toDateKey(new Date(visit.scheduledAt)) === dateKey),
      }
    })
  }, [calendarMonth, visits])
  const selectedDateVisits = visits.filter((visit) => toDateKey(new Date(visit.scheduledAt)) === selectedCalendarDate)
  const currentVisit = selectedTask?.visits.at(-1)
  const isFinalPhotoAttached = selectedTask?.attachments.some((item) => item.kind === 'FOTO FINAL')
  const completedFlowStatuses = ['DIAGNOSIS', 'ESTIMATED', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED']
  const isHandedOff = selectedTask?.status === 'REASSIGNED' && selectedTask.assignedEmployeeId !== user?.employeeId
  const canOpenWorkflowStep = [
    true,
    ['ACCEPTED', 'RESCHEDULED', 'VISIT_SCHEDULED', 'ON_SITE', 'DIAGNOSIS', 'ESTIMATED', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED'].includes(selectedTask?.status),
    Boolean(selectedTask?.visits.length),
    ['ON_SITE', 'DIAGNOSIS', 'RESCHEDULED'].includes(selectedTask?.status),
    completedFlowStatuses.includes(selectedTask?.status),
    ['IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED'].includes(selectedTask?.status),
  ]
  const workStartedAtMs = selectedTask?.workStartedAt ? new Date(selectedTask.workStartedAt).getTime() : 0
  const completedAtMs = selectedTask?.completedAt ? new Date(selectedTask.completedAt).getTime() : 0
  const isWorkTimerRunning = Boolean(workStartedAtMs) && selectedTask?.status !== 'COMPLETED'
  const workTimerEndMs = isWorkTimerRunning ? clockNow : completedAtMs || clockNow
  const elapsedWorkMs = workStartedAtMs ? Math.max(0, workTimerEndMs - workStartedAtMs) : 0
  const elapsedWorkLabel = workStartedAtMs ? formatClock(elapsedWorkMs) : ''
  const estimatedWorkMs = (selectedTask?.estimatedMinutes || 0) * 60000
  const isOverEstimate = estimatedWorkMs > 0 && elapsedWorkMs > estimatedWorkMs
  const actualElapsedMinutes = selectedTask?.actualMinutes
    ? `${Math.floor(selectedTask.actualMinutes / 60)}h ${selectedTask.actualMinutes % 60}m`
    : elapsedWorkLabel
      ? elapsedWorkLabel
      : currentVisit?.arrivedAt
        ? 'En curso'
        : 'Aún no iniciado'

  useEffect(() => {
    if (!selectedTask?.workStartedAt || selectedTask.status === 'COMPLETED') return undefined
    setClockNow(Date.now())
    const interval = setInterval(() => setClockNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [selectedTask?.workStartedAt, selectedTask?.status])

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  async function reloadOrders() {
    const rows = await fieldopsApi.loadOrders()
    tasksRef.current = rows
    knownOrderVersionsRef.current = new Map(rows.map((task) => [task.id, {
      updatedAt: task.updatedAt,
      priority: task.priority,
      assignedEmployeeId: task.assignedEmployeeId,
    }]))
    setTasks(rows)
    return rows
  }
  reloadOrdersRef.current = reloadOrders

  async function loadTeam() {
    try {
      const team = await fieldopsApi.getEmployees()
      setEmployees(team.map((employee) => ({
        ...employee,
        name: [employee.nombres, employee.apellidos].filter(Boolean).join(' '),
      })))
    } catch (error) {
      setStorageWarning(`No se pudo cargar el equipo para subasignar órdenes: ${error.message}`)
    }
  }

  async function loadAuthorizedData() {
    await reloadOrders()
    await loadTeam()
  }

  useEffect(() => {
    let active = true
    async function restoreSession() {
      try {
        const sessionUser = await fieldopsApi.getSession()
        if (!active) return
        const rows = await fieldopsApi.loadOrders()
        if (!active) return
        tasksRef.current = rows
        knownOrderVersionsRef.current = new Map(rows.map((task) => [task.id, {
          updatedAt: task.updatedAt,
          priority: task.priority,
          assignedEmployeeId: task.assignedEmployeeId,
        }]))
        setTasks(rows)
        setUser(sessionUser)
        setSessionState('authenticated')
        await loadTeam()
      } catch (error) {
        if (!active) return
        if (error.status === 401 || error.status === 403) {
          setSessionState('signed-out')
          if (error.status === 403) setStorageWarning(error.message)
        } else {
          setStorageWarning(error.message)
          setSessionState('signed-out')
        }
      }
    }
    restoreSession()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (sessionState !== 'authenticated') return undefined

    let active = true
    let refreshing = false
    const refreshOrders = async () => {
      if (!active || refreshing || document.visibilityState === 'hidden') return
      refreshing = true
      try {
        const summaries = await fieldopsApi.getOrderSummaries()
        const previousVersions = knownOrderVersionsRef.current
        const currentTasks = new Map(tasksRef.current.map((task) => [task.id, task]))
        const nextVersions = new Map()
        const nextTasks = []
        const newUrgentTasks = []

        for (const summary of summaries) {
          const previous = previousVersions?.get(summary.id)
          const changed = !previous ||
            previous.updatedAt !== summary.updatedAt ||
            previous.priority !== summary.priority ||
            previous.assignedEmployeeId !== summary.assignedEmployeeId
          const current = currentTasks.get(summary.id)
          const task = changed
            ? await fieldopsApi.getOrderDetails(summary)
            : current
              ? mergeOrderSummary(current, summary)
              : await fieldopsApi.getOrderDetails(summary)

          nextTasks.push(task)
          nextVersions.set(summary.id, {
            updatedAt: summary.updatedAt,
            priority: summary.priority,
            assignedEmployeeId: summary.assignedEmployeeId,
          })

          const newlyUrgent = previousVersions &&
            (!previous ||
              previous.priority !== 'URGENTE' ||
              previous.assignedEmployeeId !== summary.assignedEmployeeId) &&
            summary.priority === 'URGENTE' &&
            summary.assignedEmployeeId === user?.employeeId &&
            !['COMPLETED', 'CANCELLED'].includes(summary.status)
          if (newlyUrgent) newUrgentTasks.push(task)
        }

        if (!active) return
        tasksRef.current = nextTasks
        knownOrderVersionsRef.current = nextVersions
        setTasks(nextTasks)
        if (newUrgentTasks.length) setUrgentNotice(newUrgentTasks[0])
      } catch (error) {
        if (active) {
          setStorageWarning(`No se pudieron actualizar las órdenes automáticamente: ${error.message}`)
        }
      } finally {
        refreshing = false
      }
    }

    const timer = window.setInterval(refreshOrders, 10000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshOrders()
    }
    window.addEventListener('focus', refreshOrders)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOrders)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sessionState, user?.employeeId])

  async function handleLogin(event) {
    event.preventDefault()
    setIsLoading(true)
    setStorageWarning('')
    try {
      const result = await fieldopsApi.login(loginEmail, loginPassword)
      setLoginPassword('')
      if (result.mfaRequired) {
        setMfaRequired(true)
        return
      }
      if (!result.user) throw new Error('El servidor no devolvió la sesión del usuario.')
      setUser(await fieldopsApi.getSession())
      setSessionState('authenticated')
      await loadAuthorizedData()
    } catch (error) {
      setStorageWarning(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleMfaVerify(event) {
    event.preventDefault()
    setIsLoading(true)
    setStorageWarning('')
    try {
      await fieldopsApi.verifyMfa(mfaCode)
      setUser(await fieldopsApi.getSession())
      setMfaRequired(false)
      setSessionState('authenticated')
      setMfaCode('')
      await loadAuthorizedData()
    } catch (error) {
      setStorageWarning(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLogout() {
    setIsLoading(true)
    try {
      if (pushTokenRef.current) {
        try {
          await fieldopsApi.unregisterPushToken(pushTokenRef.current)
          pushTokenRef.current = ''
        } catch (error) {
          setStorageWarning(`No se cerró la sesión porque no se pudo desactivar este dispositivo para notificaciones: ${error.message}`)
          return
        }
      }
      await fieldopsApi.logout()
      setUser(null)
      tasksRef.current = []
      knownOrderVersionsRef.current = null
      setTasks([])
      setUrgentNotice(null)
      setPreviewAttachment(null)
      setSessionState('signed-out')
      setActiveTab('home')
      setStorageWarning('')
    } catch (error) {
      setStorageWarning(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function updateTask(taskId, updater, options = {}) {
    const originalTask = tasks.find((task) => task.id === taskId)
    if (!originalTask) return false
    const updatedTask = updater(originalTask)
    const changes = {}
    if (updatedTask.status !== originalTask.status) changes.status = updatedTask.status
    if (updatedTask.targetAt !== originalTask.targetAt && updatedTask.targetAt) {
      changes.scheduledAt = new Date(updatedTask.targetAt).toISOString()
      if (updatedTask.status === 'RESCHEDULED') {
        changes.rescheduleVisit = true
        changes.note = options.note || ''
      } else if (options.note) {
        changes.note = options.note
      }
    }
    if (updatedTask.diagnosis !== originalTask.diagnosis) changes.diagnosis = updatedTask.diagnosis
    if (updatedTask.cause !== originalTask.cause) changes.cause = updatedTask.cause
    if (updatedTask.resolution !== originalTask.resolution) changes.resolution = updatedTask.resolution
    if (updatedTask.observations !== originalTask.observations) changes.observations = updatedTask.observations
    if (updatedTask.estimatedMinutes !== originalTask.estimatedMinutes) changes.estimatedMinutes = updatedTask.estimatedMinutes
    if (updatedTask.actualMinutes !== originalTask.actualMinutes) changes.actualMinutes = updatedTask.actualMinutes
    if (updatedTask.materialsConfirmed !== originalTask.materialsConfirmed) changes.materialsConfirmed = updatedTask.materialsConfirmed
    if (updatedTask.canResolveToday !== originalTask.canResolveToday) changes.canResolveToday = updatedTask.canResolveToday
    if (updatedTask.assignedEmployeeId !== originalTask.assignedEmployeeId) changes.assignedEmployeeId = updatedTask.assignedEmployeeId
    if (updatedTask.assignedEmployeeId !== originalTask.assignedEmployeeId && options.note) changes.note = options.note
    if (updatedTask.customerAppointments?.length > (originalTask.customerAppointments?.length ?? 0)) {
      const appointment = updatedTask.customerAppointments.at(-1)
      changes.scheduledAt = new Date(appointment.scheduledAt).toISOString()
      changes.customerAppointment = true
      changes.customerName = appointment.customer
      changes.note = appointment.note
    }

    try {
      if (Object.keys(changes).length) await fieldopsApi.updateOrder(taskId, changes)
      await reloadOrders()
      setStorageWarning('')
      return true
    } catch (error) {
      let message = error.message || 'No se pudieron guardar los cambios en el servidor.'
      if (
        error.status === 409 &&
        error.message === 'La orden cambió mientras la actualizabas. Recarga e inténtalo de nuevo.'
      ) {
        try {
          await reloadOrders()
          message = 'La orden cambió mientras la actualizabas. Ya recargué los datos; revísalos e inténtalo de nuevo.'
        } catch (refreshError) {
          message = `${message} No se pudo recargar la orden: ${refreshError.message}`
        }
      }
      setStorageWarning(message)
      return false
    }
  }

  function addEvent(task, event, changes = {}, eventTime) {
    return {
      ...task,
      ...changes,
      events: [`${eventTime} · ${event}`, ...task.events],
    }
  }

  function openTask(task) {
    setUrgentNotice(null)
    setSelectedTaskId(task.id)
    const nextStep = task.status === 'ASSIGNED'
      ? 0
      : ['ACCEPTED', 'RESCHEDULED', 'VISIT_SCHEDULED'].includes(task.status)
        ? task.status === 'RESCHEDULED' && task.diagnosis
          ? 3
          : 1
        : task.status === 'ON_SITE'
          ? 2
          : ['DIAGNOSIS', 'ESTIMATED'].includes(task.status)
            ? 4
            : ['IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE', 'COMPLETED'].includes(task.status)
              ? 5
              : 0
    setWorkflowStep(nextStep)
    const localTarget = toLocalDateTime(task.targetAt)
    setScheduleDate(localTarget.slice(0, 10))
    setScheduleTime(localTarget.slice(11, 16))
    setFollowUpDate('')
    setFollowUpTime('')
    setCustomerAppointmentRequested(false)
    setCustomerAppointmentDate('')
    setCustomerAppointmentTime('')
    setCustomerAppointmentNote('')
    setVisitDuration(String(task.estimatedMinutes || 120))
    setScheduleNote('')
    setShowReschedule(false)
    setRescheduleReason('')
    setDiagnosisDraft(task.diagnosis)
    setCauseDraft(task.cause)
    setCanResolveToday(task.canResolveToday)
    setMaterialsConfirmed(task.materialsConfirmed)
    setEstimatedMinutesDraft(String(task.estimatedMinutes || ''))
    setResolutionDraft(task.resolution)
    setObservationsDraft(task.observations)
    setActiveTab('order')
  }

  async function acceptTask() {
    if (selectedTask.status !== 'ASSIGNED') return
    if (!selectedTask.targetAt) {
      setStorageWarning('Esta orden no tiene fecha objetivo; solicita que se programe antes de aceptarla.')
      return
    }
    setIsLoading(true)
    try {
      await fieldopsApi.updateOrder(selectedTask.id, { status: 'ACCEPTED' })
      await fieldopsApi.updateOrder(selectedTask.id, {
        status: 'VISIT_SCHEDULED',
        scheduledAt: new Date(selectedTask.targetAt).toISOString(),
      })
      await reloadOrders()
      setStorageWarning('')
      setWorkflowStep(1)
    } catch (error) {
      let message = error.message
      try {
        await reloadOrders()
      } catch (refreshError) {
        message = `${message} No se pudo actualizar el estado local: ${refreshError.message}`
      }
      setStorageWarning(message)
    } finally {
      setIsLoading(false)
    }
  }

  async function reassignTask(event) {
    event.preventDefault()
    if (!reassignReason.trim() || !['ASSIGNED', 'ACCEPTED'].includes(selectedTask.status)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) =>
      addEvent(task, `Subasignó a ${reassignTo}: ${reassignReason}`, {
        status: 'REASSIGNED',
        assignedEmployeeId: reassignTo,
        responsible: employees.find((employee) => employee.id === reassignTo)?.name || '',
      }, eventTime),
      { note: reassignReason.trim() },
    )) setShowReassign(false)
  }
  openTaskRef.current = openTask

  useEffect(() => {
    if (sessionState !== 'authenticated' || !Capacitor.isNativePlatform()) return undefined
    if (import.meta.env.VITE_FCM_CONFIGURED !== 'true') {
      setStorageWarning('Las notificaciones push aún no están configuradas. Las órdenes se actualizarán mientras la app esté abierta.')
      return undefined
    }

    let active = true
    const listeners = []
    const handlePushError = (error) => {
      if (active) {
        setStorageWarning(`No se pudieron activar las notificaciones push: ${error.message || 'error desconocido'}`)
      }
    }
    const handleUrgentNotification = async (data, openImmediately) => {
      if (data?.type !== 'urgent_work_order' || typeof data.workOrderId !== 'string') return
      try {
        const orders = await reloadOrdersRef.current()
        if (!active) return
        const task = orders.find((order) => order.id === data.workOrderId)
        if (!task) return
        if (openImmediately) openTaskRef.current(task)
        else setUrgentNotice(task)
      } catch (error) {
        handlePushError(error)
      }
    }

    const setupPush = async () => {
      listeners.push(await PushNotifications.addListener('registration', ({ value }) => {
        if (!active) return
        pushTokenRef.current = value
        void fieldopsApi.registerPushToken(value).catch(handlePushError)
      }))
      listeners.push(await PushNotifications.addListener('registrationError', handlePushError))
      listeners.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        void handleUrgentNotification(notification.data, false)
      }))
      listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        void handleUrgentNotification(notification.data, true)
      }))

      await PushNotifications.createChannel({
        id: 'fieldops-urgent',
        name: 'Órdenes urgentes',
        description: 'Avisos de nuevas órdenes urgentes asignadas',
        importance: 5,
        visibility: 1,
        sound: 'default',
        vibration: true,
      })
      let permission = await PushNotifications.checkPermissions()
      if (permission.receive !== 'granted') {
        permission = await PushNotifications.requestPermissions()
      }
      if (permission.receive !== 'granted') {
        throw new Error('Permite las notificaciones en Android para recibir tareas urgentes.')
      }
      await PushNotifications.register()
    }

    void setupPush().catch(handlePushError)
    return () => {
      active = false
      for (const listener of listeners) void listener.remove()
    }
  }, [sessionState])

  async function rescheduleVisit(event) {
    event.preventDefault()
    if (!scheduleDate || !scheduleTime || !rescheduleReason.trim() || !['VISIT_SCHEDULED', 'RESCHEDULED'].includes(selectedTask.status) || !currentVisit || currentVisit.arrivedAt) return
    const scheduledAt = `${scheduleDate}T${scheduleTime}`
    if (scheduledAt === toLocalDateTime(currentVisit.scheduledAt)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) => {
      const previousVisit = task.visits.at(-1)
      return addEvent(task, `Reprogramó visita ${previousVisit.number} de ${formatDateTime(previousVisit.scheduledAt)} a ${formatDateTime(scheduledAt)}; motivo: ${rescheduleReason.trim()}`, {
        status: 'RESCHEDULED',
        targetAt: scheduledAt,
      }, eventTime)
    }, { note: rescheduleReason.trim() })) {
      setShowReschedule(false)
      setRescheduleReason('')
    }
  }

  async function scheduleFollowUpVisit(event) {
    event.preventDefault()
    if (!followUpDate || !followUpTime || !['RESCHEDULED', 'DIAGNOSIS'].includes(selectedTask.status)) return
    const scheduledAt = `${followUpDate}T${followUpTime}`
    if (selectedTask.visits.some((visit) => visit.scheduledAt === scheduledAt)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) => {
      const visitNumber = task.visits.length + 1
      return addEvent(task, `Programó visita de seguimiento ${visitNumber} para ${formatDateTime(scheduledAt)}`, {
        status: 'VISIT_SCHEDULED',
        targetAt: scheduledAt,
        estimatedMinutes: Number(visitDuration) || task.estimatedMinutes,
      }, eventTime)
    }, { note: scheduleNote })) setWorkflowStep(1)
  }

  async function confirmArrival() {
    if (!['VISIT_SCHEDULED', 'RESCHEDULED'].includes(selectedTask.status) || !selectedTask.visits.length) return
    const arrivalTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) =>
      addEvent(task, `Trabajador confirmó llegada a visita ${task.visits.length}`, {
        status: 'ON_SITE',
      }, arrivalTime)
    )) setWorkflowStep(3)
  }

  async function saveDiagnosis(event) {
    event.preventDefault()
    if (!diagnosisDraft.trim() || !['ON_SITE', 'DIAGNOSIS'].includes(selectedTask.status)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) =>
      addEvent(task, 'Registró diagnóstico', {
        status: 'DIAGNOSIS',
        diagnosis: diagnosisDraft.trim(),
        cause: causeDraft.trim(),
        canResolveToday,
      }, eventTime),
    )) setWorkflowStep(canResolveToday ? 4 : 3)
  }

  async function addMaterial(event) {
    event.preventDefault()
    if (!materialDraft.name.trim() || !materialDraft.quantity) return
    const material = { ...materialDraft, name: materialDraft.name.trim() }
    setIsLoading(true)
    try {
      await fieldopsApi.addMaterial(selectedTask.id, {
        material: material.name,
        quantity: material.quantity,
        unit: 'und',
        unitCost: '0',
        observations: '',
      })
      await reloadOrders()
      setMaterialDraft({ name: '', quantity: '' })
      setMaterialsConfirmed(true)
      setStorageWarning('')
    } catch (error) {
      setStorageWarning(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  async function confirmNoMaterials(event) {
    const checked = event.target.checked
    if (await updateTask(selectedTask.id, (task) => ({ ...task, materialsConfirmed: checked }))) {
      setMaterialsConfirmed(checked)
    }
  }

  async function saveEstimate(event) {
    event.preventDefault()
    if (!(selectedTask.materials.length || materialsConfirmed) || !estimatedMinutesDraft || !['DIAGNOSIS', 'ESTIMATED', 'IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE'].includes(selectedTask.status)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) =>
      addEvent(task, 'Registró tiempo estimado', {
        status: ['IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE'].includes(task.status) ? task.status : 'ESTIMATED',
        estimatedMinutes: Number(estimatedMinutesDraft) || 0,
        materialsConfirmed,
      }, eventTime),
    )) setWorkflowStep(4)
  }

  async function startWork() {
    if (selectedTask.status !== 'ESTIMATED') return
    const eventTime = currentTimeLabel()
    await updateTask(selectedTask.id, (task) => addEvent(task, 'Inició trabajo de reparación', { status: 'IN_PROGRESS' }, eventTime))
  }

  async function saveResolution(event) {
    event.preventDefault()
    if (!resolutionDraft.trim() || !['IN_PROGRESS', 'RESOLVED', 'PENDING_CLOSURE'].includes(selectedTask.status)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) =>
      addEvent(task, 'Registró resolución técnica', {
        status: selectedTask.status === 'PENDING_CLOSURE' ? 'PENDING_CLOSURE' : 'RESOLVED',
        resolution: resolutionDraft.trim(),
        observations: observationsDraft.trim(),
      }, eventTime),
    )) setWorkflowStep(5)
  }

  async function addEvidence(event) {
    event.preventDefault()
    const file = event.currentTarget.elements.namedItem('evidence-file')?.files?.[0]
    if (!file || !evidenceDescription.trim()) return
    if (selectedTask.status === 'COMPLETED') return
    setIsLoading(true)
    try {
      await fieldopsApi.uploadEvidence(selectedTask.id, file, evidenceKind, evidenceDescription.trim())
      if (selectedTask.status === 'RESOLVED' && evidenceKind === 'FOTO FINAL') {
        await fieldopsApi.updateOrder(selectedTask.id, { status: 'PENDING_CLOSURE' })
      }
      await reloadOrders()
      setStorageWarning('')
    } catch (error) {
      setStorageWarning(error.message)
      return
    } finally {
      setIsLoading(false)
    }
    event.currentTarget.reset()
    setEvidenceDescription('')
  }

  async function completeTask() {
    if (!selectedTask || selectedTask.status !== 'PENDING_CLOSURE' || (customerAppointmentRequested && !(selectedTask.customerAppointments?.length)) || !selectedTask.diagnosis || !(selectedTask.materials.length || selectedTask.materialsConfirmed) || !selectedTask.estimatedMinutes || !selectedTask.resolution || !isFinalPhotoAttached) return
    if (await updateTask(selectedTask.id, (task) => addEvent(task, 'Tarea finalizada', {
      status: 'COMPLETED',
    }, currentTimeLabel()))) {
      setActiveTab('tasks')
      setTaskFilter('FINALIZADAS')
    }
  }

  async function scheduleCustomerAppointment(event) {
    event.preventDefault()
    if (
      !selectedTask ||
      selectedTask.status === 'COMPLETED' ||
      !customerAppointmentDate ||
      !customerAppointmentTime ||
      (selectedTask.customerAppointments?.length ?? 0) > 0
    ) return
    const scheduledAt = `${customerAppointmentDate}T${customerAppointmentTime}`
    if (selectedTask.visits.some((visit) => visit.scheduledAt === scheduledAt)) return
    const eventTime = currentTimeLabel()
    if (await updateTask(selectedTask.id, (task) => {
      const appointmentNumber = (task.customerAppointments?.length ?? 0) + 1
      return addEvent(task, `Programó cita de seguimiento con ${task.resident} para ${formatDateTime(scheduledAt)}`, {
        customerAppointments: [
          ...(task.customerAppointments ?? []),
          {
            number: appointmentNumber,
            customer: task.resident,
            scheduledAt,
            note: customerAppointmentNote.trim(),
            status: 'SCHEDULED',
          },
        ],
      }, eventTime)
    }, { note: customerAppointmentNote.trim() })) {
      setCustomerAppointmentRequested(false)
      setCustomerAppointmentDate('')
      setCustomerAppointmentTime('')
      setCustomerAppointmentNote('')
    }
  }

  const taskFilterList = taskFilter === 'URGENTES'
    ? urgentTasks
    : taskFilter === 'PRIORIDAD ALTA'
      ? highTasks
      : taskFilter === 'FINALIZADAS'
        ? completedTasks
        : taskFilter === 'PENDIENTES'
          ? pendingTasks
          : openTasks

  function renderTaskCard(task) {
    return (
      <article className="order-card task-card" key={task.id}>
        <div className="order-head">
          <span className="order-code">{task.code}</span>
          <span className={`priority-badge ${task.priority.toLowerCase()}`}>{task.priority}</span>
        </div>
        <h2>{task.title}</h2>
        <div className="meta-line"><span className="pin">⌖</span>{task.location} · {task.resident}</div>
        <div className="badges-row">
          <span>◷ {formatDateTime(task.targetAt)}</span>
          <span>{task.visits.length + (task.customerAppointments?.length ?? 0)} {task.visits.length + (task.customerAppointments?.length ?? 0) === 1 ? 'visita' : 'visitas'}</span>
        </div>
        <div className="task-card-footer">
          <span className="chip chip-grey">{formatStatus(task.status)}</span>
          <button className="text-button" type="button" onClick={() => openTask(task)}>Abrir orden →</button>
        </div>
      </article>
    )
  }

  useEffect(() => {
    const syncTopBarState = () => {
      const scrollableNodes = Array.from(document.querySelectorAll('.screen-body, .detail-body, .evidence-body, .chat-body, .complete-body'))
      const isScrolled = scrollableNodes.some((node) => node && node.scrollTop > 6)
      setIsTopBarElevated(isScrolled)
    }

    const scrollableNodes = Array.from(document.querySelectorAll('.screen-body, .detail-body, .evidence-body, .chat-body, .complete-body'))
    scrollableNodes.forEach((node) => node.addEventListener('scroll', syncTopBarState))
    syncTopBarState()

    return () => {
      scrollableNodes.forEach((node) => node.removeEventListener('scroll', syncTopBarState))
    }
  }, [activeTab, selectedTaskId])

  function renderMainTab() {
    if (activeTab === 'home') {
      return (
        <main className="screen-body" ref={scrollContainerRef}>
          <p className="eyebrow eyebrow-date">{dateLabel}</p>
          <h1>Buen día, {user?.name?.split(' ')[0] || 'equipo'}</h1>
          <div className="home-summary">
            <div><strong>{openTasks.length}</strong><span>Órdenes abiertas</span></div>
            <div><strong>{tasks.filter((task) => task.status === 'ON_SITE').length}</strong><span>Visitas en sitio</span></div>
            <div><strong>{completedTasks.length}</strong><span>Finalizadas</span></div>
          </div>
          <div className="section-heading"><h2>Prioridad para hoy</h2><button className="text-button" type="button" onClick={() => setActiveTab('tasks')}>Ver todas</button></div>
          <div className="task-list">{[...urgentTasks, ...highTasks].slice(0, 3).map(renderTaskCard)}</div>
          <div className="section-heading"><h2>Próxima visita</h2><button className="text-button" type="button" onClick={() => setActiveTab('visits')}>Ver agenda</button></div>
          {visits.find((visit) => !visit.arrivedAt) ? renderTaskCard(visits.find((visit) => !visit.arrivedAt).task) : <div className="empty-state">No hay visitas pendientes de llegada.</div>}
        </main>
      )
    }
    if (activeTab === 'tasks') {
      const filters = ['TODAS', 'URGENTES', 'PRIORIDAD ALTA', 'PENDIENTES', 'FINALIZADAS']
      return (
        <main className="screen-body">
          <p className="eyebrow">TU TRABAJO</p>
          <h1>Mis tareas</h1>
          <div className="filter-tabs task-filters" role="tablist" aria-label="Categorías de tareas">
            {filters.map((filter) => (
              <button key={filter} role="tab" aria-selected={taskFilter === filter} className={`filter-${filter.toLowerCase().replaceAll(' ', '-')} ${taskFilter === filter ? 'active' : ''}`} type="button" onClick={() => setTaskFilter(filter)}>
                {filter} <small>{filter === 'TODAS' ? tasks.length : filter === 'URGENTES' ? urgentTasks.length : filter === 'PRIORIDAD ALTA' ? highTasks.length : filter === 'PENDIENTES' ? pendingTasks.length : completedTasks.length}</small>
              </button>
            ))}
          </div>
          <div className="task-list">{taskFilterList.length ? taskFilterList.map(renderTaskCard) : <div className="empty-state">No hay órdenes en esta categoría.</div>}</div>
        </main>
      )
    }
    if (activeTab === 'visits') {
      return (
        <main className="screen-body">
          <p className="eyebrow">AGENDA DE CAMPO</p>
          <h1>Mis visitas</h1>
          <div className="visit-list">
            {visits.length ? visits.map((visit) => (
              <button type="button" className="visit-row" key={`${visit.task.id}-${visit.isCustomerAppointment ? `customer-${visit.number}` : visit.number}`} onClick={() => openTask(visit.task)}>
                <span className="visit-time">{formatDateTime(visit.scheduledAt)}</span>
                <span className="visit-copy"><strong>{visit.isCustomerAppointment ? `Cita con ${visit.customer}` : visit.task.title}</strong><small>{visit.task.location} · {visit.isCustomerAppointment ? `Seguimiento de ${visit.task.code}` : `Visita ${visit.number}`}</small></span>
                <span className="visit-state">{visit.isCustomerAppointment ? 'Cita cliente' : visit.arrivedAt ? 'En sitio' : 'Pendiente'}</span>
              </button>
            )) : <div className="empty-state">Aún no tienes visitas programadas.</div>}
          </div>
        </main>
      )
    }
    if (activeTab === 'calendar') {
      return (
        <main className="screen-body">
          <p className="eyebrow">PLANIFICACIÓN</p>
          <h1>Calendario</h1>
          <div className="calendar-card">
            <div className="calendar-title">
              <button type="button" aria-label="Mes anterior" onClick={() => {
                const month = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                setCalendarMonth(month)
                setSelectedCalendarDate(toDateKey(month))
              }}>‹</button>
              <strong>{calendarMonth.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</strong>
              <button type="button" aria-label="Mes siguiente" onClick={() => {
                const month = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                setCalendarMonth(month)
                setSelectedCalendarDate(toDateKey(month))
              }}>›</button>
            </div>
            <div className="calendar-week">{['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
            <div className="calendar-days">{calendarDays.map((date, index) => date ? (
              <button
                key={date.dateKey}
                type="button"
                aria-label={`${date.day} ${calendarMonth.toLocaleDateString('es-MX', { month: 'long' })}${date.hasVisit ? ', con visitas' : ''}`}
                aria-pressed={selectedCalendarDate === date.dateKey}
                className={`${todayDate === date.dateKey ? 'today' : ''} ${date.hasVisit ? 'has-visit' : ''} ${selectedCalendarDate === date.dateKey ? 'selected' : ''}`}
                onClick={() => setSelectedCalendarDate(date.dateKey)}
              >{date.day}</button>
            ) : <span className="calendar-empty" key={`empty-${index}`} aria-hidden="true" />)}</div>
          </div>
          <div className="section-heading"><h2>Visitas del {new Date(`${selectedCalendarDate}T00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</h2></div>
          <div className="visit-list">{selectedDateVisits.length ? selectedDateVisits.map((visit) => <button type="button" className="visit-row" key={`calendar-${visit.task.id}-${visit.isCustomerAppointment ? `customer-${visit.number}` : visit.number}`} onClick={() => openTask(visit.task)}><span className="visit-time">{formatDateTime(visit.scheduledAt)}</span><span className="visit-copy"><strong>{visit.isCustomerAppointment ? `Cita con ${visit.customer}` : visit.task.title}</strong><small>{visit.task.location} · {visit.isCustomerAppointment ? `Seguimiento de ${visit.task.code}` : `Visita ${visit.number}`}</small></span><span className="visit-state">{visit.isCustomerAppointment ? 'Cita cliente' : visit.arrivedAt ? 'En sitio' : 'Pendiente'}</span></button>) : <div className="empty-state">No hay visitas programadas para esta fecha.</div>}</div>
        </main>
      )
    }
    if (activeTab === 'notifications') {
      return (
        <main className="screen-body">
          <p className="eyebrow">ACTUALIZACIONES</p>
          <h1>Notificaciones</h1>
          <div className="notification-list">
            {recentOrders.length ? recentOrders.map((task) => (
              <article key={task.id}>
                <span className={`notification-dot ${task.status === 'COMPLETED' ? 'green' : task.priority === 'URGENTE' ? '' : 'blue'}`} />
                <div>
                  <strong>{formatStatus(task.status)}</strong>
                  <p>{task.code} · {task.title}</p>
                  <small>Actualizada {formatDateTime(task.updatedAt)}</small>
                </div>
              </article>
            )) : <div className="empty-state">No hay actualizaciones recientes de órdenes.</div>}
          </div>
        </main>
      )
    }
    return (
      <main className="screen-body">
        <p className="eyebrow">CUENTA DEL TRABAJADOR</p>
        <h1>Mi perfil</h1>
        <div className="profile-card"><div className="avatar large-avatar">{user?.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><strong>{user?.name}</strong><span>{user?.email}</span><span className="status-pill"><span className="dot" /> SESIÓN ACTIVA</span></div>
        <div className="profile-menu"><button type="button" onClick={handleLogout} disabled={isLoading}>Cerrar sesión <span>›</span></button></div>
        <p className="prototype-note">Sesión del ERP · {user?.role}</p>
      </main>
    )
  }

  function renderOrder() {
    if (!selectedTask) return null
    const checklist = [
      ['Diagnóstico registrado', Boolean(selectedTask.diagnosis)],
      ['Materiales revisados', selectedTask.materials.length > 0 || selectedTask.materialsConfirmed],
      ['Tiempo estimado', selectedTask.estimatedMinutes > 0],
      ['Resolución registrada', Boolean(selectedTask.resolution)],
      ['Foto final adjunta', Boolean(isFinalPhotoAttached)],
    ]
    const isCompleted = selectedTask.status === 'COMPLETED'
    return (
      <main className={`order-detail-body ${isCompleted || isHandedOff ? 'read-only-order' : ''}`}>
        <div className="order-detail-heading">
          <div className="order-code">{selectedTask.code} · {selectedTask.priority}</div>
          <h1>{selectedTask.title}</h1>
          <p>{selectedTask.description}</p>
          <div className="order-meta"><span>⌖ {selectedTask.location}</span><span>Residente: {selectedTask.resident}</span><span>Responsable actual: {selectedTask.responsible}</span>{elapsedWorkLabel && <span className={`chip chip-grey${isOverEstimate ? ' ticker-over' : ''}`}>⏱ {elapsedWorkLabel}</span>}<span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
        </div>
        {isCompleted && <section className="workflow-card closed-summary"><div className="complete-badge">✓ Tarea finalizada</div><p>Esta orden está bloqueada para edición tras el cierre. Cualquier cambio posterior deberá registrarse como corrección auditada.</p><div className="summary-box"><div><span>Diagnóstico</span><strong>{selectedTask.diagnosis}</strong></div><div><span>Resolución</span><strong>{selectedTask.resolution}</strong></div><div><span>Tiempo estimado</span><strong>{selectedTask.estimatedMinutes ? `${selectedTask.estimatedMinutes} min` : '—'}</strong></div><div><span>Tiempo real</span><strong>{actualElapsedMinutes}</strong></div><div><span>Cierre</span><strong>{formatDateTime(selectedTask.completedAt)}</strong></div></div></section>}
        {isHandedOff && <section className="workflow-card closed-summary"><div className="complete-badge">↗ Orden subasignada</div><p>La orden ahora está a cargo de {selectedTask.responsible}. Ya no aparece como editable para Pedro; el cambio y su motivo quedan en auditoría.</p></section>}
        <div className="workflow-strip">
          {workflowSteps.map((step, index) => <button key={step} type="button" disabled={!canOpenWorkflowStep[index]} className={`${index === workflowStep ? 'selected' : ''} ${index < workflowStep ? 'done' : ''}`} onClick={() => setWorkflowStep(index)}><span>{index < workflowStep ? '✓' : index + 1}</span>{step}</button>)}
        </div>
        {workflowStep === 0 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Recibir tarea</h2><span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
            <div className="attachment-preview"><div className="attachment-icon">▧</div><div><strong>Información del reporte</strong><span>Fotos y documentos adjuntos a esta orden.</span></div><span className="reference-count">{selectedTask.attachments.length} {selectedTask.attachments.length === 1 ? 'archivo' : 'archivos'}</span></div>
            {selectedTask.attachments.length > 0 ? (
              <div className="evidence-gallery" aria-label="Fotos adjuntas a la orden">
                {selectedTask.attachments.map((attachment) => (
                  <button
                    className="evidence-thumbnail"
                    key={attachment.id}
                    type="button"
                    onClick={() => setPreviewAttachment(attachment)}
                    aria-label={`Ver ${attachment.kind}: ${attachment.name}`}
                  >
                    <img src={attachment.url} alt={attachment.description || attachment.name} loading="lazy" />
                    <span>{attachment.kind}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">Esta orden no tiene fotos adjuntas.</div>
            )}
            <div className="detail-actions">
              {selectedTask.status === 'ASSIGNED' && <button type="button" className="primary-btn" onClick={acceptTask}>Aceptar tarea</button>}
              {selectedTask.status === 'ACCEPTED' && <button type="button" className="primary-btn" onClick={() => setWorkflowStep(1)}>Ver visita programada</button>}
              {['ASSIGNED', 'ACCEPTED'].includes(selectedTask.status) && <button type="button" className="ghost-btn" onClick={() => setShowReassign(!showReassign)}>No puedo realizarla · Subasignar</button>}
            </div>
            {showReassign && <form className="form-card" onSubmit={reassignTask}><label>Nuevo responsable<select required value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}><option value="">Selecciona un trabajador</option>{employees.filter((employee) => employee.id !== selectedTask.assignedEmployeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Motivo<input required value={reassignReason} onChange={(event) => setReassignReason(event.target.value)} placeholder="Ej. Se requiere especialista" /></label><button className="primary-btn" type="submit" disabled={isLoading || !employees.length}>Confirmar subasignación</button>{!employees.length && <p className="disabled-hint">No hay trabajadores disponibles para asignar.</p>}</form>}
            <div className="audit-preview"><strong>Historial de asignación y eventos</strong>{selectedTask.events.slice(0, 3).map((event, index) => <span key={`${event}-${index}`}>{event}</span>)}</div>
          </section>
        )}
        {workflowStep === 1 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Visita programada</h2><span className="chip chip-grey">{selectedTask.visits.length} visita(s)</span></div>
            {currentVisit ? (
              <>
                <div className="scheduled-visit-card">
                  <span className="eyebrow">VISITA {currentVisit.number} · DEFINIDA EN LA ORDEN</span>
                  <strong>{formatDateTime(currentVisit.scheduledAt)}</strong>
                  <span>Duración estimada: {selectedTask.estimatedMinutes} minutos</span>
                  {currentVisit.note && <small>{currentVisit.note}</small>}
                </div>
                {currentVisit.rescheduleHistory?.length > 0 && (
                  <div className="visit-history">
                    <strong>Reprogramación registrada</strong>
                    {currentVisit.rescheduleHistory.map((change, index) => (
                      <small key={`${change.changedAt}-${index}`}>
                        {formatDateTime(change.previousScheduledAt)} → {formatDateTime(change.newScheduledAt)} · Motivo: {change.reason}
                      </small>
                    ))}
                  </div>
                )}
                {['VISIT_SCHEDULED', 'RESCHEDULED'].includes(selectedTask.status) && !currentVisit.arrivedAt && (
                  <div className="detail-actions">
                    <button type="button" className="primary-btn" onClick={() => setWorkflowStep(2)}>Confirmar llegada</button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        const localVisit = toLocalDateTime(currentVisit.scheduledAt)
                        setScheduleDate(localVisit.slice(0, 10))
                        setScheduleTime(localVisit.slice(11, 16))
                        setShowReschedule(!showReschedule)
                      }}
                    >
                      {showReschedule ? 'Cancelar reprogramación' : 'Reprogramar visita'}
                    </button>
                  </div>
                )}
                {showReschedule && ['VISIT_SCHEDULED', 'RESCHEDULED'].includes(selectedTask.status) && !currentVisit.arrivedAt && (
                  <form className="form-card reschedule-form" onSubmit={rescheduleVisit}>
                    <h3>Nueva fecha y hora</h3>
                    <div className="form-grid">
                      <label>Fecha<input type="date" required value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} /></label>
                      <label>Hora<input type="time" required value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} /></label>
                    </div>
                    <label>Motivo de la reprogramación<textarea rows="2" required value={rescheduleReason} onChange={(event) => setRescheduleReason(event.target.value)} placeholder="Indica por qué necesitas cambiar la visita" /></label>
                    <button type="submit" className="primary-btn" disabled={!scheduleDate || !scheduleTime || !rescheduleReason.trim() || `${scheduleDate}T${scheduleTime}` === toLocalDateTime(currentVisit.scheduledAt)}>Guardar reprogramación</button>
                  </form>
                )}
              </>
            ) : (
              <div className="empty-state">La orden no tiene una visita programada. Solicita que se defina en la orden antes de aceptarla.</div>
            )}
            {selectedTask.visits.map((visit) => <div className="visit-history" key={visit.number}><strong>Historial · Visita {visit.number}</strong><span>{formatDateTime(visit.scheduledAt)}</span><small>{visit.arrivedAt ? `Llegada: ${visit.arrivedAt}` : 'Llegada pendiente'}</small>{visit.completedAt && <small>Visita cerrada: {visit.completedAt}</small>}</div>)}
          </section>
        )}
        {workflowStep === 2 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Confirmar llegada</h2><span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
            <div className="arrival-panel"><span className="arrival-symbol">⌖</span><strong>{selectedTask.location}</strong><span>Visita {currentVisit?.number ?? 1} · {formatDateTime(currentVisit?.scheduledAt)}</span>{currentVisit?.arrivedAt ? <div className="success-inline">✓ Llegada registrada: {currentVisit.arrivedAt}</div> : <button type="button" className="arrival-btn" disabled={!currentVisit} onClick={confirmArrival}>ESTOY AQUÍ · CONFIRMAR LLEGADA</button>}</div>
            <p className="prototype-note">La hora de llegada queda registrada en el servidor y vinculada a esta visita.</p>
            {currentVisit?.arrivedAt && <button type="button" className="primary-btn" onClick={() => setWorkflowStep(3)}>Registrar diagnóstico</button>}
          </section>
        )}
        {workflowStep === 3 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Diagnóstico</h2><span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
            {selectedTask.status === 'RESCHEDULED' && (
              <div className="scheduled-visit-card">
                <span className="eyebrow">DIAGNÓSTICO REGISTRADO</span>
                <strong>{selectedTask.diagnosis}</strong>
                {selectedTask.cause && <span>Causa probable: {selectedTask.cause}</span>}
                <span>La visita inicial queda registrada y puedes programar una visita de seguimiento.</span>
              </div>
            )}
            {selectedTask.status !== 'RESCHEDULED' && (
              <form className="form-card" onSubmit={saveDiagnosis}>
                <label>Problema encontrado<textarea rows="3" required value={diagnosisDraft} onChange={(event) => setDiagnosisDraft(event.target.value)} placeholder="Describe el estado del problema encontrado" /></label>
                <label>Causa probable<textarea rows="2" value={causeDraft} onChange={(event) => setCauseDraft(event.target.value)} placeholder="¿Qué originó el problema?" /></label>
                <fieldset className="choice-group"><legend>¿Puede resolverse hoy?</legend><label><input type="radio" checked={canResolveToday} onChange={() => setCanResolveToday(true)} /> Sí, puedo resolverlo</label><label><input type="radio" checked={!canResolveToday} onChange={() => setCanResolveToday(false)} /> No, requiere otra visita</label></fieldset>
                <button type="submit" className="primary-btn">Guardar diagnóstico</button>
              </form>
            )}
            {!canResolveToday && <form className="form-card secondary-form" onSubmit={scheduleFollowUpVisit}><h3>Programar visita de seguimiento</h3><div className="form-grid"><label>Fecha de la nueva visita<input type="date" required value={followUpDate} onChange={(event) => setFollowUpDate(event.target.value)} /></label><label>Hora<input type="time" required value={followUpTime} onChange={(event) => setFollowUpTime(event.target.value)} /></label></div><label>Duración estimada (minutos)<input type="number" min="1" value={visitDuration} onChange={(event) => setVisitDuration(event.target.value)} /></label><label>Indicaciones para la visita<textarea rows="2" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} placeholder="Acceso, coordinación o materiales necesarios" /></label><button type="submit" className="ghost-btn" disabled={!['RESCHEDULED', 'DIAGNOSIS'].includes(selectedTask.status) || !followUpDate || !followUpTime || selectedTask.visits.some((visit) => toLocalDateTime(visit.scheduledAt) === `${followUpDate}T${followUpTime}`)}>Guardar nueva visita</button></form>}
          </section>
        )}
        {workflowStep === 4 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Materiales y tiempo</h2><span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
            <form className="form-card" onSubmit={addMaterial}>
              <h3>Materiales requeridos</h3>
              <div className="form-grid"><label>Material<input required value={materialDraft.name} onChange={(event) => setMaterialDraft({ ...materialDraft, name: event.target.value })} placeholder="Ej. Tubo PVC" /></label><label>Cantidad<input required value={materialDraft.quantity} onChange={(event) => setMaterialDraft({ ...materialDraft, quantity: event.target.value })} placeholder="2" /></label></div>
              <button type="submit" className="ghost-btn">+ Agregar material</button>
            </form>
            {!selectedTask.materials.length && <label className="no-materials-control"><input type="checkbox" checked={materialsConfirmed} onChange={confirmNoMaterials} />No se requieren materiales para esta orden</label>}
            {selectedTask.materials.map((material, index) => <div className="material-row" key={`${material.name}-${index}`}><span>{material.name}</span><strong>{material.quantity}</strong></div>)}
            <form className="form-card" onSubmit={saveEstimate}>
              <div className="form-grid"><label>Tiempo estimado (min)<input type="number" min="1" required value={estimatedMinutesDraft} onChange={(event) => setEstimatedMinutesDraft(event.target.value)} /></label><div className="time-readout"><span>Tiempo real (cronómetro)</span><strong>{elapsedWorkLabel || (currentVisit?.arrivedAt ? 'En curso' : 'Se inicia en el diagnóstico')}</strong><small>{selectedTask.estimatedMinutes > 0 ? `Objetivo: ${selectedTask.estimatedMinutes} min${isOverEstimate ? ' · excedido' : ''}` : 'Define el tiempo estimado para comparar'}</small></div></div>
              <p className="prototype-note">El cronómetro inicia automáticamente al registrar el diagnóstico y compara el tiempo real con el tiempo estimado.</p>
              <button type="submit" className="primary-btn" disabled={!(selectedTask.materials.length || materialsConfirmed)}>Guardar estimación</button>
              {!(selectedTask.materials.length || materialsConfirmed) && <p className="disabled-hint">Agrega materiales o confirma que no se requieren.</p>}
            </form>
            {selectedTask.status === 'ESTIMATED' && <button type="button" className="primary-btn" onClick={startWork}>Iniciar reparación</button>}
            {selectedTask.status === 'IN_PROGRESS' && <div className="success-inline">Trabajo en proceso</div>}
          </section>
        )}
        {workflowStep === 5 && (
          <section className="workflow-card">
            <div className="section-heading"><h2>Resolución, evidencia y cierre</h2><span className="chip chip-grey">{formatStatus(selectedTask.status)}</span></div>
            <form className="form-card" onSubmit={saveResolution}>
              <label>Resolución técnica<textarea required rows="4" value={resolutionDraft} onChange={(event) => setResolutionDraft(event.target.value)} placeholder="Qué se hizo, cómo quedó el problema y qué pruebas se realizaron" /></label>
              <label>Observaciones<textarea rows="2" value={observationsDraft} onChange={(event) => setObservationsDraft(event.target.value)} placeholder="Notas adicionales de la visita" /></label>
              <button type="submit" className="primary-btn">Guardar resolución</button>
            </form>
            <form className="form-card secondary-form" onSubmit={addEvidence}>
              <h3>Evidencia vinculada a esta orden y visita</h3>
              <div className="form-grid"><label>Tipo<select value={evidenceKind} onChange={(event) => setEvidenceKind(event.target.value)}><option>FOTO INICIAL</option><option>FOTO DIAGNÓSTICO</option><option>FOTO FINAL</option></select></label><label>Archivo<input name="evidence-file" type="file" accept="image/jpeg,image/png,image/webp" required /></label></div>
              <label>Descripción de la evidencia<input required value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} placeholder="Ej. Conexión reparada y sin fugas" /></label>
              <button type="submit" className="ghost-btn">Adjuntar evidencia</button>
            </form>
            {selectedTask.attachments.map((attachment, index) => <div className="material-row" key={`${attachment.name}-${index}`}><span>{attachment.kind} · {attachment.name}<small>{attachment.description}</small></span><strong>Adjunta</strong></div>)}
            <div className="completion-requirements"><strong>Validación para finalizar</strong>{checklist.map(([label, done]) => <span className={done ? 'requirement-done' : ''} key={label}>{done ? '✓' : '○'} {label}</span>)}</div>
            <button type="button" className="primary-btn" disabled={isCompleted || !checklist.every(([, done]) => done) || (customerAppointmentRequested && !(selectedTask.customerAppointments?.length))} onClick={completeTask}>{isCompleted ? 'Tarea finalizada' : 'FINALIZAR TAREA'}</button>
            {selectedTask.status !== 'COMPLETED' && (
              <label className="no-materials-control appointment-toggle">
                <input
                  type="checkbox"
                  checked={customerAppointmentRequested || Boolean(selectedTask.customerAppointments?.length)}
                  disabled={Boolean(selectedTask.customerAppointments?.length)}
                  onChange={(event) => setCustomerAppointmentRequested(event.target.checked)}
                />
                Se necesita nueva visita
              </label>
            )}
            {customerAppointmentRequested && !selectedTask.customerAppointments?.length && selectedTask.status !== 'COMPLETED' && (
              <form className="form-card secondary-form" onSubmit={scheduleCustomerAppointment}>
                <h3>Programar cita con el cliente</h3>
                <p className="prototype-note">La cita quedará vinculada a {selectedTask.resident} y aparecerá en Mis visitas y Calendario.</p>
                <div className="form-grid">
                  <label>Fecha<input type="date" required min={todayDate} value={customerAppointmentDate} onChange={(event) => setCustomerAppointmentDate(event.target.value)} /></label>
                  <label>Hora<input type="time" required value={customerAppointmentTime} onChange={(event) => setCustomerAppointmentTime(event.target.value)} /></label>
                </div>
                <label>Indicaciones para el cliente<textarea rows="2" value={customerAppointmentNote} onChange={(event) => setCustomerAppointmentNote(event.target.value)} placeholder="Confirma disponibilidad, acceso o motivo de la nueva visita" /></label>
                <button type="submit" className="ghost-btn" disabled={!customerAppointmentDate || !customerAppointmentTime || selectedTask.visits.some((visit) => visit.scheduledAt === `${customerAppointmentDate}T${customerAppointmentTime}`)}>Programar cita con el cliente</button>
              </form>
            )}
            {selectedTask.customerAppointments?.map((appointment) => (
              <div className="scheduled-visit-card customer-appointment-card" key={`customer-appointment-${appointment.number}`}>
                <span className="eyebrow">CITA DE SEGUIMIENTO · PROGRAMADA</span>
                <strong>{formatDateTime(appointment.scheduledAt)}</strong>
                <span>Cliente: {appointment.customer}</span>
                {appointment.note && <small>{appointment.note}</small>}
              </div>
            ))}
            {!isCompleted && customerAppointmentRequested && !selectedTask.customerAppointments?.length && <p className="disabled-hint">Programa la cita con el cliente para poder finalizar la tarea.</p>}
            {!isCompleted && !checklist.every(([, done]) => done) && <p className="disabled-hint">Completa todos los requisitos y agrega una foto final descrita para habilitar el cierre.</p>}
            {isCompleted && <div className="success-inline">Cierre: {formatDateTime(selectedTask.completedAt)} · Estado COMPLETED</div>}
          </section>
        )}
        <section className="workflow-card audit-card"><div className="section-heading"><h2>Auditoría de la orden</h2><span>{selectedTask.events.length} eventos</span></div>{selectedTask.events.map((event, index) => <span key={`${event}-${index}`}>{event}</span>)}</section>
      </main>
    )
  }

  if (sessionState !== 'authenticated') {
    const checkingSession = sessionState === 'loading'
    return (
      <div className="app-shell auth-shell">
        <div className="device-frame auth-frame">
          <div className="auth-orb" aria-hidden="true" />
          <header className="auth-brand"><img className="brand-logo" src="/logo-brand-cropped.png" alt="AlquilaYa" /></header>
          <main className="auth-content">
            <p className="auth-eyebrow">{checkingSession ? 'FIELD OPERATIONS' : mfaRequired ? 'VERIFICACIÓN DE SEGURIDAD' : 'FIELD OPERATIONS'}</p>
            <h1>{checkingSession ? 'Conectando' : mfaRequired ? 'Verifica tu identidad' : 'Iniciar sesión'}</h1>
            <p className="auth-subtitle">{checkingSession ? 'Conectando con tu cuenta del ERP…' : mfaRequired ? 'Ingresa el código de autenticación de tu cuenta.' : 'Accede con las credenciales de tu cuenta del ERP.'}</p>
            {!checkingSession && storageWarning && <div className="storage-warning auth-warning" role="alert">{storageWarning}</div>}
            {!checkingSession && (mfaRequired ? (
              <form className="auth-form" onSubmit={handleMfaVerify}>
                <label className="auth-field">
                  <span className="sr-only">Código de autenticación</span>
                  <input autoComplete="one-time-code" inputMode="numeric" placeholder="Código de autenticación" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required />
                </label>
                <button className="primary-btn auth-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Verificando…' : 'Verificar'}
                  <span className="auth-submit-icon" aria-hidden="true">→</span>
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleLogin}>
                <label className="auth-field">
                  <span className="sr-only">Correo electrónico</span>
                  <input type="email" autoComplete="username" placeholder="Correo electrónico" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} required />
                </label>
                <label className="auth-field auth-password-field">
                  <span className="sr-only">Contraseña</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3" /></svg>
                  <input type="password" autoComplete="current-password" placeholder="Contraseña" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} required />
                </label>
                <button className="primary-btn auth-submit" type="submit" disabled={isLoading}>
                  {isLoading ? 'Ingresando…' : 'Iniciar sesión'}
                  <span className="auth-submit-icon" aria-hidden="true">→</span>
                </button>
              </form>
            ))}
          </main>
          <footer className="auth-footer"><span className="auth-footer-icon" aria-hidden="true">✓</span><span>Acceso seguro del ERP</span></footer>
        </div>
      </div>
    )
  }

  if (activeTab === 'order') {
    const initials = user?.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
    return <div className="app-shell"><div className="device-frame"><header className={`topbar ${isTopBarElevated ? 'elevated' : 'plain'}`}><div className="left-header"><button className="icon-btn" aria-label="Volver" type="button" onClick={() => setActiveTab('tasks')}>←</button><div className="brand-block compact"><img className="brand-logo" src="/logo-brand-cropped.png" alt="Alquilaya" /></div></div><div className="right-header"><span className="eyebrow">DETALLE DE ORDEN</span><span className="avatar">{initials}</span></div></header>{storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}{renderOrder()}{previewAttachment && <div className="image-lightbox" role="presentation" onClick={() => setPreviewAttachment(null)}><section className="image-lightbox-panel" role="dialog" aria-modal="true" aria-label={`Vista previa ${previewAttachment.kind}`} onClick={(event) => event.stopPropagation()}><button className="image-lightbox-close" type="button" aria-label="Cerrar vista previa" onClick={() => setPreviewAttachment(null)}>×</button><img src={previewAttachment.url} alt={previewAttachment.description || previewAttachment.name} /><div><strong>{previewAttachment.kind}</strong><span>{previewAttachment.description || previewAttachment.name}</span></div></section></div>}</div></div>
  }

  const initials = user?.name?.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="app-shell">
      <div className="device-frame">
        <header className={`topbar ${isTopBarElevated ? 'elevated' : 'plain'}`}>
          <div className="left-header">
            <div className="brand-block">
              <img className="brand-logo" src="/logo-brand-cropped.png" alt="Alquilaya" />
            </div>
          </div>
          <div className="right-header"><button className="icon-btn" aria-label="Notificaciones" type="button" onClick={() => setActiveTab('notifications')}><NavigationIcon name="bell" /></button><div className="avatar">{initials}</div></div>
        </header>
        {storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}
        {urgentNotice && (
          <div className="urgent-task-notice" role="alert">
            <button className="urgent-task-notice-open" type="button" onClick={() => openTask(urgentNotice)}>
              <span className="urgent-task-notice-icon" aria-hidden="true">!</span>
              <span><strong>Nueva tarea urgente</strong><small>{urgentNotice.code} · {urgentNotice.title}</small></span>
            </button>
            <button className="urgent-task-notice-dismiss" type="button" aria-label="Cerrar aviso" onClick={() => setUrgentNotice(null)}>×</button>
          </div>
        )}
        {renderMainTab()}
        <nav className="bottom-nav" aria-label="Navegación principal">
          {primaryTabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'selected' : ''} type="button" aria-label={tab.label} title={tab.label} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}><span><NavigationIcon name={tab.icon} /></span></button>)}
        </nav>
      </div>
    </div>
  )
}

export default App
