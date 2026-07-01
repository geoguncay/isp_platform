/**
 * Ajustes de Sistema — contenedor de la pestaña "Generales" en SettingsPage.
 */
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { getSystemSettings } from '@/services/systemSettings'
import { LocalizationSettingsForm } from './LocalizationSettingsForm'
import { FiscalSettingsForm } from './FiscalSettingsForm'
import { NotificationSettingsForm } from './NotificationSettingsForm'
import { SecuritySettingsForm } from './SecuritySettingsForm'
import { MaintenanceSettingsForm } from './MaintenanceSettingsForm'
import { IntegrationSettingsForm } from './IntegrationSettingsForm'

type StatusSetter = (msg: { type: 'success' | 'error'; text: string } | null) => void

type SubTab = 'localizacion' | 'fiscal' | 'notificaciones' | 'seguridad' | 'mantenimiento' | 'integraciones'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'localizacion', label: 'Localización' },
  { id: 'fiscal', label: 'Fiscal' },
  { id: 'notificaciones', label: 'Notificaciones' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'mantenimiento', label: 'Mantenimiento' },
  { id: 'integraciones', label: 'Integraciones' },
]

export function GeneralSettingsTab({ isAdmin, setStatusMessage }: { isAdmin: boolean; setStatusMessage: StatusSetter }) {
  const [subTab, setSubTab] = useState<SubTab>('localizacion')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: getSystemSettings,
    enabled: isAdmin,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['system-settings'] })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap gap-1 p-1 bg-secondary/30 rounded-xl border border-secondary/50 max-w-max">
        {SUB_TABS.map((sub) => (
          <button
            key={sub.id}
            onClick={() => { setSubTab(sub.id); setStatusMessage(null) }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${subTab === sub.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="glass-card p-12 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {subTab === 'localizacion' && (
            <LocalizationSettingsForm data={data.localization} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'fiscal' && (
            <FiscalSettingsForm data={data.fiscal} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'notificaciones' && (
            <NotificationSettingsForm data={data.notifications} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'seguridad' && (
            <SecuritySettingsForm data={data.security} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'mantenimiento' && (
            <MaintenanceSettingsForm data={data.maintenance} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
          {subTab === 'integraciones' && (
            <IntegrationSettingsForm data={data.integrations} onSaved={invalidate} setStatusMessage={setStatusMessage} />
          )}
        </>
      )}
    </div>
  )
}
