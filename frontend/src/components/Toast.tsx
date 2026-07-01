import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning'

export interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose: () => void
}

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertCircle,
}

const STYLES = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  error:   'bg-rose-500/10 border-rose-500/30 text-rose-400',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
}

const BAR_STYLES = {
  success: 'bg-emerald-500',
  error:   'bg-rose-500',
  warning: 'bg-amber-500',
}

export function Toast({ message, type = 'success', duration = 4000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const Icon = ICONS[type]

  const dismiss = () => {
    setLeaving(true)
    setTimeout(onClose, 300)
  }

  useEffect(() => {
    // Entrada con pequeño delay para que el CSS transition se aplique
    const showTimer = setTimeout(() => setVisible(true), 10)
    const hideTimer = setTimeout(dismiss, duration)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [duration])

  return (
    <div
      className={`
        relative flex items-start gap-3 w-80 px-4 py-3.5 rounded-xl border shadow-lg backdrop-blur-sm
        transition-all duration-300
        ${STYLES[type]}
        ${visible && !leaving ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0'}
      `}
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />

      <p className="flex-1 text-sm font-medium leading-snug pr-1">{message}</p>

      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Barra de progreso */}
      <div
        className={`absolute bottom-0 left-0 h-0.5 rounded-b-xl ${BAR_STYLES[type]}`}
        style={{
          width: '100%',
          animation: `shrink ${duration}ms linear forwards`,
        }}
      />

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  )
}

/* ── ToastContainer ────────────────────────────────────────────────────────── */

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  duration?: number
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onClose: (id: number) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          message={t.message}
          type={t.type}
          duration={t.duration}
          onClose={() => onClose(t.id)}
        />
      ))}
    </div>
  )
}
