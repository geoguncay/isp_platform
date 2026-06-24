/**
 * ProfilePage — Configuración de perfil de usuario personal.
 */
import React, { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { User, Lock, Save, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

// ── Zod Schemas ──────────────────────────────────────────────────────────────
const profileSchema = z
  .object({
    nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120),
    email: z.string().email('Correo electrónico inválido'),
    password: z.string().optional().or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
    inactivity_timeout: z.preprocess(
      (val) => (val === '' || val === undefined || val === null ? 0 : Number(val)),
      z.number().int().min(0, 'Debe ser mayor o igual a 0')
    ),
  })
  .refine((data) => !data.password || data.password === data.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })

type ProfileFormData = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user, fetchMe } = useAuthStore()
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ── Formulario de Perfil ────────────────────────────────────────────────────
  const {
    register: registerProfile,
    handleSubmit: handleSubmitProfile,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(profileSchema) as any,
  })

  useEffect(() => {
    if (user) {
      resetProfile({
        nombre: user.nombre,
        email: user.email,
        password: '',
        confirmPassword: '',
        inactivity_timeout: user.inactivity_timeout ?? 0,
      })
    }
  }, [user, resetProfile])

  const profileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const payload: { nombre: string; email: string; password?: string; inactivity_timeout: number } = {
        nombre: data.nombre,
        email: data.email,
        inactivity_timeout: data.inactivity_timeout,
      }
      if (data.password && data.password.trim() !== '') {
        payload.password = data.password
      }
      await api.put(`/users/${user?.id}`, payload)
    },
    onSuccess: async (_, variables) => {
      setStatusMessage({ type: 'success', text: 'Perfil actualizado exitosamente' })
      await fetchMe() // Recargar datos globales del usuario (actualiza sidebar)
      resetProfile({
        nombre: variables.nombre,
        email: variables.email,
        password: '',
        confirmPassword: '',
        inactivity_timeout: variables.inactivity_timeout,
      })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (err: any) => {
      const errMsg = err?.response?.data?.detail || 'Error al actualizar el perfil'
      setStatusMessage({ type: 'error', text: errMsg })
    },
  })

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gestiona tus datos personales de acceso y contraseña.
        </p>
      </div>

      {/* Status Alert */}
      {statusMessage && (
        <div
          className={`rounded-xl p-4 flex items-start gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* Profile Form */}
      <div className="glass-card p-6">
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-brand-400" />
          Información del Perfil Personal
        </h2>
        <form
          id="profile-form"
          onSubmit={handleSubmitProfile((data) => profileMutation.mutate(data))}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Nombre Completo *</label>
              <div className="relative">
                <input
                  id="profile-nombre"
                  type="text"
                  {...registerProfile('nombre')}
                  className="input-field"
                  placeholder="Geo"
                />
              </div>
              {profileErrors.nombre && (
                <p className="text-xs text-destructive mt-1">{profileErrors.nombre.message}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Correo Electrónico *</label>
              <div className="relative">
                <input
                  id="profile-email"
                  type="email"
                  {...registerProfile('email')}
                  className="input-field"
                  placeholder="correo@ejemplo.com"
                />
              </div>
              {profileErrors.email && (
                <p className="text-xs text-destructive mt-1">{profileErrors.email.message}</p>
              )}
            </div>

            {/* Desconectar por inactividad */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Desconectar por inactividad</label>
              <div className="relative">
                <input
                  id="profile-inactivity-timeout"
                  type="number"
                  min="0"
                  {...registerProfile('inactivity_timeout')}
                  className="input-field"
                  placeholder="0"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">* minutos, 0 = Desactivado</p>
              {profileErrors.inactivity_timeout && (
                <p className="text-xs text-destructive mt-1">{profileErrors.inactivity_timeout.message}</p>
              )}
            </div>
          </div>

          <hr className="border-border/50 my-6" />

          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Lock className="w-4 h-4 text-brand-400" />
            Cambiar Contraseña
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Deje los campos de contraseña en blanco si no desea modificar su contraseña actual.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nueva Contraseña */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5 font-sans">Nueva Contraseña</label>
              <input
                id="profile-password"
                type="password"
                {...registerProfile('password')}
                className="input-field font-sans"
                placeholder="Mínimo 8 caracteres"
              />
              {profileErrors.password && (
                <p className="text-xs text-destructive mt-1">{profileErrors.password.message}</p>
              )}
            </div>

            {/* Confirmar Nueva Contraseña */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Confirmar Nueva Contraseña</label>
              <input
                id="profile-confirm-password"
                type="password"
                {...registerProfile('confirmPassword')}
                className="input-field"
                placeholder="Repita la nueva contraseña"
              />
              {profileErrors.confirmPassword && (
                <p className="text-xs text-destructive mt-1">{profileErrors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              id="save-profile-btn"
              disabled={profileMutation.isPending}
              className="btn-primary"
            >
              {profileMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {profileMutation.isPending ? 'Guardando...' : 'Guardar Perfil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
