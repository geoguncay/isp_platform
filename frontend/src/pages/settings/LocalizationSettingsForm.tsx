import { useMutation } from '@tanstack/react-query'
import { Globe, Save, Loader2 } from 'lucide-react'
import { updateLocalization, type LocalizationSettings } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

const FALLBACK_TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Santo_Domingo', 'America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Santiago', 'America/Buenos_Aires', 'Europe/Madrid', 'Europe/London']

function getUtcOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    const offset = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
    return offset.replace('GMT', 'UTC')
  } catch {
    return 'UTC'
  }
}

function offsetToMinutes(offsetLabel: string): number {
  const match = offsetLabel.match(/UTC([+-]\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const sign = match[1].startsWith('-') ? -1 : 1
  const hours = Math.abs(parseInt(match[1], 10))
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  return sign * (hours * 60 + minutes)
}

// Un representante conocido por desfase horario, para no listar las ~400 zonas IANA.
const PREFERRED_ZONES = [
  'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
  'America/Denver', 'America/Chicago', 'America/Mexico_City', 'America/Bogota',
  'America/New_York', 'America/Santo_Domingo', 'America/Caracas', 'America/Santiago',
  'America/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia', 'Atlantic/Azores',
  'UTC', 'Europe/London', 'Europe/Madrid', 'Europe/Berlin', 'Europe/Athens',
  'Europe/Moscow', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney',
  'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Tongatapu',
]

const TIMEZONE_OPTIONS: { value: string; label: string }[] = (() => {
  let names: string[]
  try {
    // @ts-expect-error - supportedValuesOf no está en el lib target del proyecto pero sí en los navegadores soportados
    const list = Intl.supportedValuesOf?.('timeZone') as string[] | undefined
    names = list && list.length ? list : FALLBACK_TIMEZONES
  } catch {
    names = FALLBACK_TIMEZONES
  }

  const zonesByOffset = new Map<string, string[]>()
  for (const tz of names) {
    const offset = getUtcOffsetLabel(tz)
    const bucket = zonesByOffset.get(offset)
    if (bucket) bucket.push(tz)
    else zonesByOffset.set(offset, [tz])
  }

  const options = Array.from(zonesByOffset.entries()).map(([offset, zones]) => {
    const representative = zones.find((tz) => PREFERRED_ZONES.includes(tz)) ?? [...zones].sort()[0]
    return { value: representative, label: `${offset} ${representative}` }
  })

  return options.sort((a, b) => offsetToMinutes(a.label) - offsetToMinutes(b.label))
})()

export function LocalizationSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: LocalizationSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateLocalization,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de localización guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la localización.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-400" />
          Localización
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Zona horaria, idioma, formato de fecha y moneda utilizados en toda la plataforma.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            loc_timezone: target.timezone.value,
            loc_locale: target.locale.value,
            loc_currency_code: target.currencyCode.value,
            loc_currency_symbol: target.currencySymbol.value,
            loc_date_format: target.dateFormat.value,
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Zona horaria</label>
            <select name="timezone" defaultValue={data.loc_timezone} className="input-field font-mono">
              {!TIMEZONE_OPTIONS.some((tz) => tz.value === data.loc_timezone) && (
                <option value={data.loc_timezone}>{data.loc_timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Idioma</label>
            <select name="locale" defaultValue={data.loc_locale} className="input-field">
              <option value="es">Español</option>
              <option value="en">Inglés</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Formato de fecha</label>
            <select name="dateFormat" defaultValue={data.loc_date_format} className="input-field">
              <option value="DD/MM/YYYY">DD/MM/AAAA</option>
              <option value="MM/DD/YYYY">MM/DD/AAAA</option>
              <option value="YYYY-MM-DD">AAAA-MM-DD</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Código de moneda</label>
            <input name="currencyCode" type="text" maxLength={10} defaultValue={data.loc_currency_code} className="input-field font-mono uppercase" placeholder="USD" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Símbolo de moneda</label>
            <input name="currencySymbol" type="text" maxLength={5} defaultValue={data.loc_currency_symbol} className="input-field font-mono" placeholder="$" />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-border/50">
          <button type="submit" disabled={mutation.isPending} className="btn-primary">
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
