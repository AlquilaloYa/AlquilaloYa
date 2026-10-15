import { Capacitor } from '@capacitor/core'

const API_ROOT = '/api'
const ERP_ORIGIN = import.meta.env.VITE_ERP_API_URL?.replace(/\/+$/, '')
const NATIVE_APP = Capacitor.isNativePlatform()

async function request(path, options = {}) {
  if (NATIVE_APP && !ERP_ORIGIN) {
    throw new Error('La app móvil no está configurada con la dirección HTTPS del ERP.')
  }
  const response = await fetch(`${ERP_ORIGIN || ''}${API_ROOT}${path}`, {
    ...options,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      ...(NATIVE_APP ? { 'X-FieldOps-Client': 'android-native' } : {}),
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
  const data = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(data?.error || `Error del servidor (${response.status})`)
    error.status = response.status
    throw error
  }
  return data
}

function formatEvent(event) {
  const time = event.createdAt ? new Date(event.createdAt).toLocaleString('es-MX') : ''
  const details = event.details && typeof event.details === 'object' ? event.details : {}
  const summary = details.note || details.material || details.fileName || ''
  return [time, event.eventType?.replaceAll('_', ' ').toLowerCase(), summary].filter(Boolean).join(' · ')
}

function mapVisit(visit, rescheduleHistory = []) {
  return {
    number: Number(visit.visitNumber),
    scheduledAt: visit.scheduledAt,
    arrivedAt: visit.arrivedAt ? new Date(visit.arrivedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
    arrivedAtIso: visit.arrivedAt || '',
    completedAt: visit.completedAt ? new Date(visit.completedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '',
    completedAtIso: visit.completedAt || '',
    note: visit.note || '',
    isCustomerAppointment: Boolean(visit.isCustomerAppointment),
    customer: visit.customerName || '',
    rescheduleHistory,
  }
}

function buildRescheduleHistory(order) {
  const byVisit = new Map()
  for (const event of order.events || []) {
    if (event.eventType !== 'VISIT_RESCHEDULED') continue
    const details = event.details && typeof event.details === 'object' ? event.details : {}
    if (!details.visitNumber) continue
    const number = Number(details.visitNumber)
    if (!byVisit.has(number)) byVisit.set(number, [])
    byVisit.get(number).push({
      changedAt: event.createdAt,
      previousScheduledAt: details.previousScheduledAt || '',
      newScheduledAt: details.scheduledAt || '',
      reason: details.reason || '',
    })
  }
  return byVisit
}

function mapTask(order, materials = []) {
  const rescheduleHistoryByVisit = buildRescheduleHistory(order)
  const allVisits = (order.visits || [])
    .map((visit) => mapVisit(visit, rescheduleHistoryByVisit.get(Number(visit.visitNumber)) || []))
    .sort((a, b) => a.number - b.number)
  const visits = allVisits.filter((visit) => !visit.isCustomerAppointment)
  const attachments = (order.attachments || []).map((attachment) => ({
    id: attachment.id,
    name: attachment.fileName,
    kind: attachment.kind || 'EVIDENCIA',
    description: attachment.description || '',
    url: attachment.url,
  }))
  const customerAppointments = allVisits
    .filter((visit) => visit.isCustomerAppointment)
    .map((visit) => ({ ...visit, status: 'SCHEDULED' }))
  const assignedName = order.assigneeName || ''
  return {
    id: order.id,
    code: order.code || order.id,
    title: order.title,
    issue: order.issueType,
    description: order.description || '',
    location: [order.site, order.departmentName, order.departmentNumber].filter(Boolean).join(' · ') || order.location,
    resident: order.contactName || '',
    priority: order.priority,
    status: order.status,
    responsible: assignedName,
    assignedEmployeeId: order.assignedEmployeeId || '',
    targetAt: order.targetAt || '',
    updatedAt: order.updatedAt || '',
    workStartedAt: order.workStartedAt || '',
    estimatedMinutes: Number(order.estimatedMinutes) || 0,
    actualMinutes: Number(order.actualMinutes) || 0,
    completedAt: order.completedAt || '',
    visits,
    diagnosis: order.diagnosis || '',
    cause: order.cause || '',
    canResolveToday: order.canResolveToday ?? true,
    materials: materials.map((material) => ({
      id: material.id,
      name: material.material,
      quantity: String(material.quantity),
      unit: material.unit,
      unitCost: String(material.unitCost),
    })),
    materialsConfirmed: Boolean(order.materialsConfirmed || materials.length),
    estimatedCost: order.estimatedCost == null ? '' : String(order.estimatedCost),
    actualCost: order.actualCost == null ? '' : String(order.actualCost),
    resolution: order.resolution || '',
    observations: order.observations || '',
    attachments,
    customerAppointments,
    events: (order.events || []).map(formatEvent),
  }
}

export const fieldopsApi = {
  request,

  async getSession() {
    const data = await request('/auth/me')
    if (!data?.user) {
      const error = new Error('El servidor no devolvió la sesión del usuario.')
      error.status = 401
      throw error
    }
    return data.user
  },

  async login(email, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },

  async verifyMfa(code) {
    return request('/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },

  async logout() {
    return request('/auth/logout', { method: 'POST' })
  },

  async registerPushToken(token) {
    return request('/fieldops/push-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  },

  async unregisterPushToken(token) {
    return request('/fieldops/push-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    })
  },

  async getEmployees() {
    return request('/operaciones/empleados')
  },

  async getOrderSummaries() {
    return request('/operaciones/ordenes')
  },

  async getOrderDetails(summary) {
    const [order, materials] = await Promise.all([
      request(`/operaciones/ordenes/${summary.id}`),
      request(`/operaciones/ordenes/${summary.id}/materiales`),
    ])
    return mapTask({ ...summary, ...order }, materials)
  },

  async loadOrders() {
    const rows = await this.getOrderSummaries()
    return Promise.all(rows.map((row) => this.getOrderDetails(row)))
  },

  async updateOrder(id, changes) {
    return request(`/operaciones/ordenes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
  },

  async addMaterial(id, material) {
    return request(`/operaciones/ordenes/${id}/materiales`, {
      method: 'POST',
      body: JSON.stringify(material),
    })
  },

  async uploadEvidence(id, file, kind, description) {
    const form = new FormData()
    form.append('files', file)
    form.append('kind', kind)
    form.append('description', description)
    return request(`/operaciones/ordenes/${id}/evidencias`, {
      method: 'POST',
      body: form,
    })
  },
}
