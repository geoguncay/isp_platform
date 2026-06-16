/**
 * LoginPage — Página de inicio de sesión premium con diseño dark.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Wifi, Eye, EyeOff, Loader2, Shield, Activity } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})
type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    setError(null)
    try {
      await login(data.email, data.password)
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } }
      setError(axiosErr?.response?.data?.detail ?? 'Error al iniciar sesión')
    }
  }

  return (
    <div className="min-h-screen flex bg-surface-200">
      {/* ── Panel izquierdo — branding ── */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden
                      bg-gradient-to-br from-brand-900/80 via-surface-50 to-surface-200 border-r border-border">
        {/* Glow decorativo */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl translate-x-1/4 translate-y-1/4 pointer-events-none" />

        {/* Logo */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-600/30">
            <Wifi className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-bold text-foreground">ISP Platform</p>
            <p className="text-xs text-muted-foreground">Management</p>
          </div>
        </div>

        {/* Stats decorativas */}
        <div className="relative z-10 space-y-6">
          <div>
            <h1 className="text-4xl font-bold text-foreground leading-tight">
              Gestión centralizada<br />
              <span className="text-brand-400">para tu red ISP</span>
            </h1>
            <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
              Multi-router MikroTik · Monitoreo en tiempo real
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Activity, label: 'Routers activos', value: 'Tiempo real' },
              { icon: Shield, label: 'Cifrado Fernet', value: 'AES-128' },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="glass-card p-4">
                <Icon className="w-5 h-5 text-brand-400 mb-2" />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground relative z-10">
          © 2026 ISP Platform — Ecuador
        </p>
      </div>

      {/* ── Panel derecho — formulario ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md animate-fade-in">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Wifi className="w-4 h-4 text-white" />
            </div>
            <p className="font-bold text-foreground">ISP Platform</p>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Iniciar sesión</h2>
          <p className="text-muted-foreground text-sm mb-8">
            Ingresa tus credenciales para acceder al panel
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" id="login-form">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="admin@isp.local"
                {...register('email')}
                className="input-field"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className="input-field pr-11"
                />
                <button
                  type="button"
                  id="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {/* Error general */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <button
              type="submit"
              id="login-submit"
              disabled={isLoading}
              className="btn-primary w-full justify-center py-3"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Autenticando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
