import { useMutation } from '@tanstack/react-query'
import { Plug, Save, Loader2, MessageSquare } from 'lucide-react'
import { updateIntegrations, type IntegrationSettingsRead } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

export function IntegrationSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: IntegrationSettingsRead; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateIntegrations,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración de integraciones guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar las integraciones.' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Plug className="w-5 h-5 text-brand-400" />
            Pasarela de Pago
          </h3>
          <p className="text-muted-foreground text-xs mt-1">
            Credenciales de la pasarela de pago utilizada para cobros en línea.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const target = e.currentTarget as any
            mutation.mutate({
              pg_api_key: target.pgApiKey.value || null,
              pg_api_secret: target.pgApiSecret.value || undefined,
            })
          }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">API Key</label>
              <input name="pgApiKey" type="text" defaultValue={data.pg_api_key ?? ''} className="input-field font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                API Secret {data.pg_api_secret_set && <span className="text-emerald-400 normal-case">(configurado)</span>}
              </label>
              <input name="pgApiSecret" type="password" className="input-field font-mono" placeholder={data.pg_api_secret_set ? '••••••••' : ''} />
              <span className="text-[10px] text-muted-foreground block">Deje en blanco para mantener el secreto actual.</span>
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

      <div className="glass-card p-6 space-y-2">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-brand-400" />
          SMS (Twilio)
        </h3>
        <p className="text-muted-foreground text-xs">
          Las credenciales de Twilio se configuran por variables de entorno del servidor. El envío de
          SMS puede habilitarse o deshabilitarse desde la pestaña de Notificaciones.
        </p>
      </div>
    </div>
  )
}
