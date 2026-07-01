/**
 * Cliente tipado para los endpoints de Ajustes de Sistema (/settings/system/*).
 */
import api from '@/services/api'

export interface LocalizationSettings {
  loc_timezone: string
  loc_locale: string
  loc_currency_code: string
  loc_currency_symbol: string
  loc_date_format: string
}

export interface FiscalSettings {
  fiscal_tax_rate: number
  fiscal_tax_name: string
  fiscal_invoice_prefix: string
  fiscal_invoice_next_number: number
}

export interface SmtpSettingsRead {
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_password_set: boolean
  smtp_from_email: string | null
  smtp_from_name: string | null
  smtp_use_tls: boolean
  sms_notifications_enabled: boolean
}

export interface SecuritySettings {
  sec_password_min_length: number
  sec_password_expiration_days: number
  sec_default_session_timeout_minutes: number
  sec_max_login_attempts: number
  sec_lockout_duration_minutes: number
  sec_ip_whitelist: string[]
}

export interface MaintenanceSettings {
  maint_audit_log_retention_days: number
  maint_maintenance_mode: boolean
  maint_maintenance_message: string | null
}

export interface IntegrationSettingsRead {
  pg_api_key: string | null
  pg_api_secret_set: boolean
}

export interface BillingSettings {
  billing_hora_generacion: string
  billing_ciclo: string
  billing_modo_precio: string
  billing_auto_aprobar_enviar: boolean
  billing_detener_suspendidos: boolean
  billing_notify_new_invoice: boolean
  billing_attach_pdf_receipt: boolean
  billing_default_dia_pago: number
  billing_default_dias_gracia: number
  billing_aviso_nueva_factura: boolean
  billing_aviso_previo_dias: number
  billing_recordatorios_pago: boolean
  billing_recordatorio_frecuencia_dias: number
}

export interface SuspensionSettings {
  suspension_automatica: boolean
  suspension_hora: number
  suspension_retraso_dias: number
  suspension_permitir_aplazamiento: boolean
  suspension_notify_suspendido: boolean
  suspension_notify_pospuesto: boolean
  suspension_motivos: string[]
}

export interface PaymentMethodItem {
  value: string
  label: string
  isSystem?: boolean
}

export interface CatalogSettings {
  payment_methods: PaymentMethodItem[]
  fechas_corte: number[]
  colas_padre: string[]
  address_lists: string[]
}

export interface SystemSettingsRead {
  localization: LocalizationSettings
  fiscal: FiscalSettings
  notifications: SmtpSettingsRead
  security: SecuritySettings
  maintenance: MaintenanceSettings
  integrations: IntegrationSettingsRead
  billing: BillingSettings
  suspension: SuspensionSettings
  catalogs: CatalogSettings
  updated_at: string
}

export interface BackupResult {
  filename: string
  size_bytes: number
  created_at: string
}

export async function getSystemSettings(): Promise<SystemSettingsRead> {
  const { data } = await api.get('/settings/system')
  return data
}

export async function updateLocalization(payload: Partial<LocalizationSettings>) {
  const { data } = await api.put('/settings/system/localization', payload)
  return data as LocalizationSettings
}

export async function updateFiscal(payload: Partial<FiscalSettings>) {
  const { data } = await api.put('/settings/system/fiscal', payload)
  return data as FiscalSettings
}

export interface SmtpSettingsWrite {
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_password?: string | null
  smtp_from_email?: string | null
  smtp_from_name?: string | null
  smtp_use_tls?: boolean
  sms_notifications_enabled?: boolean
}

export async function updateNotifications(payload: SmtpSettingsWrite) {
  const { data } = await api.put('/settings/system/notifications', payload)
  return data as SmtpSettingsRead
}

export async function updateSecurity(payload: Partial<SecuritySettings>) {
  const { data } = await api.put('/settings/system/security', payload)
  return data as SecuritySettings
}

export async function updateMaintenance(payload: Partial<MaintenanceSettings>) {
  const { data } = await api.put('/settings/system/maintenance', payload)
  return data as MaintenanceSettings
}

export interface IntegrationSettingsWrite {
  pg_api_key?: string | null
  pg_api_secret?: string | null
}

export async function updateIntegrations(payload: IntegrationSettingsWrite) {
  const { data } = await api.put('/settings/system/integrations', payload)
  return data as IntegrationSettingsRead
}

export async function updateBilling(payload: Partial<BillingSettings>) {
  const { data } = await api.put('/settings/system/billing', payload)
  return data as BillingSettings
}

export async function updateSuspension(payload: Partial<SuspensionSettings>) {
  const { data } = await api.put('/settings/system/suspension', payload)
  return data as SuspensionSettings
}

export async function updateCatalogs(payload: Partial<CatalogSettings>) {
  const { data } = await api.put('/settings/system/catalogs', payload)
  return data as CatalogSettings
}

export async function runManualBackup(): Promise<BackupResult> {
  const { data } = await api.post('/settings/system/backup')
  return data
}
