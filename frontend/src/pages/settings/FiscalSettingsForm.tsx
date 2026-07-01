import { useMutation } from '@tanstack/react-query'
import { Hash, Save, Loader2 } from 'lucide-react'
import { updateFiscal, type FiscalSettings } from '@/services/systemSettings'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

export function FiscalSettingsForm({
  data, onSaved, setStatusMessage,
}: { data: FiscalSettings; onSaved: () => void; setStatusMessage: StatusSetter }) {
  const mutation = useMutation({
    mutationFn: updateFiscal,
    onSuccess: () => {
      onSaved()
      setStatusMessage({ type: 'success', text: 'Configuración fiscal guardada.' })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setStatusMessage({ type: 'error', text: msg || 'Error al guardar la configuración fiscal.' })
    },
  })

  return (
    <div className="glass-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Hash className="w-5 h-5 text-brand-400" />
          Fiscal
        </h3>
        <p className="text-muted-foreground text-xs mt-1">
          Impuesto aplicado a las facturas y numeración correlativa.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const target = e.currentTarget as any
          mutation.mutate({
            fiscal_tax_rate: parseFloat(target.taxRate.value),
            fiscal_tax_name: target.taxName.value,
            fiscal_invoice_prefix: target.invoicePrefix.value,
            fiscal_invoice_next_number: parseInt(target.invoiceNextNumber.value, 10),
          })
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Nombre del impuesto</label>
            <input name="taxName" type="text" maxLength={20} defaultValue={data.fiscal_tax_name} className="input-field" placeholder="IVA" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Tasa de impuesto (%)</label>
            <input name="taxRate" type="number" min={0} max={100} step="0.01" defaultValue={data.fiscal_tax_rate} className="input-field font-mono" placeholder="18" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Prefijo de factura</label>
            <input name="invoicePrefix" type="text" maxLength={20} defaultValue={data.fiscal_invoice_prefix} className="input-field font-mono" placeholder="FAC-" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Próximo número de factura</label>
            <input name="invoiceNextNumber" type="number" min={1} defaultValue={data.fiscal_invoice_next_number} className="input-field font-mono" />
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
