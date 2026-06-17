import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUptime(uptime: string | null | undefined): string {
  if (!uptime) return '—'

  // Si tiene el formato hh:mm:ss (ej: 05:12:43)
  if (/^\d{2}:\d{2}:\d{2}$/.test(uptime)) {
    const [h, m, s] = uptime.split(':').map(Number)
    const parts = []
    if (h > 0) parts.push(`${h} ${h === 1 ? 'hora' : 'horas'}`)
    if (m > 0) parts.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`)
    if (h === 0 && m === 0 && s > 0) parts.push(`${s} ${s === 1 ? 'segundo' : 'segundos'}`)
    return parts.join(', ') || '0 minutos'
  }

  // Si tiene formato de letras (ej: 3w2d5h10m15s)
  const regex = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/
  const match = uptime.match(regex)

  if (match && (match[1] || match[2] || match[3] || match[4] || match[5])) {
    const weeks = match[1] ? parseInt(match[1]) : 0
    const days = match[2] ? parseInt(match[2]) : 0
    const hours = match[3] ? parseInt(match[3]) : 0
    const minutes = match[4] ? parseInt(match[4]) : 0
    const seconds = match[5] ? parseInt(match[5]) : 0

    const parts = []
    if (weeks > 0) parts.push(`${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`)
    if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`)
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`)
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`)
    
    // Solo mostrar segundos si no hay unidades mayores
    if (parts.length === 0 && seconds > 0) {
      parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`)
    }

    return parts.join(', ') || uptime
  }

  return uptime
}
