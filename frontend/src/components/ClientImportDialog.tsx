/**
 * ClientImportDialog — Modal Asistente para importar clientes desde un CSV.
 */
import { useState, useEffect } from 'react'
import { X, Loader2, Upload, FileSpreadsheet, ArrowRight, AlertTriangle, CheckCircle, HelpCircle, RefreshCw } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/services/api'

interface ClientImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface RouterOption {
  id: string
  nombre: string
}

interface PlanOption {
  id: string
  nombre: string
}

// Campos del sistema que se pueden mapear
const SYSTEM_FIELDS = [
  { key: 'apellidos', label: 'Apellidos', required: true },
  { key: 'nombres', label: 'Nombres', required: true },
  { key: 'nombre', label: 'Nombre Completo (Opcional)', required: false },
  { key: 'cedula', label: 'Cédula / RUC', required: true },
  { key: 'telefono', label: 'Teléfono', required: true },
  { key: 'direccion', label: 'Dirección', required: true },
  { key: 'email', label: 'Correo Electrónico', required: false },
  { key: 'router', label: 'Router', required: true },
  { key: 'plan', label: 'Plan de Internet', required: false },
  { key: 'tipo', label: 'Tipo de Conexión (static/pppoe)', required: false },
  { key: 'ip', label: 'Dirección IP (para estático)', required: false },
  { key: 'mac', label: 'Dirección MAC (para estático)', required: false },
  { key: 'usuario_ppp', label: 'Usuario PPPoE', required: false },
  { key: 'contraseña_ppp', label: 'Contraseña PPPoE', required: false },
]

export function ClientImportDialog({ isOpen, onClose, onSuccess }: ClientImportDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<any[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [mappedData, setMappedData] = useState<any[]>([])
  
  // Listas de la BD para mapeo de nombres a IDs
  const [routerMappings, setRouterMappings] = useState<Record<string, string>>({}) // NombreCSV -> RouterIdBD
  const [planMappings, setPlanMappings] = useState<Record<string, string>>({}) // NombreCSV -> PlanIdBD

  // Resultados de validación del backend
  const [validationResult, setValidationResult] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Cargar routers y planes para los selectores de mapeo de referencias
  const { data: dbRouters = [] } = useQuery<RouterOption[]>({
    queryKey: ['routers-import-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/gateways')
      return data
    },
    enabled: isOpen
  })

  const { data: dbPlans = [] } = useQuery<PlanOption[]>({
    queryKey: ['plans-import-dropdown'],
    queryFn: async () => {
      const { data } = await api.get('/plans')
      return data
    },
    enabled: isOpen
  })

  // Reset del estado cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setCsvHeaders([])
      setCsvRows([])
      setColumnMapping({})
      setMappedData([])
      setRouterMappings({})
      setPlanMappings({})
      setValidationResult(null)
      setImportResult(null)
      setErrorMsg(null)
    }
  }, [isOpen])

  // Parsea el archivo CSV en el frontend
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return

      try {
        const lines = text.split(/\r?\n/)
        if (lines.length === 0 || !lines[0].trim()) {
          setErrorMsg('El archivo seleccionado está vacío.')
          return
        }

        // Parsea cabecera respetando comillas
        const parseLine = (line: string) => {
          return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => 
            v.trim().replace(/^["']|["']$/g, '').trim()
          )
        }

        const headers = parseLine(lines[0])
        const rows: any[] = []

        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue
          const values = parseLine(lines[i])
          const rowObj: Record<string, string> = {}
          headers.forEach((header, idx) => {
            rowObj[header] = values[idx] || ''
          })
          rows.push(rowObj)
        }

        setCsvHeaders(headers)
        setCsvRows(rows)
        setErrorMsg(null)

        // Pre-mapeo inteligente de columnas
        const initialMapping: Record<string, string> = {}
        SYSTEM_FIELDS.forEach(field => {
          const match = headers.find(h => {
            const cleanHeader = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            const cleanField = field.key.toLowerCase()
            return cleanHeader === cleanField || 
                   cleanHeader.includes(cleanField) ||
                   (cleanField === 'nombre' && (cleanHeader.includes('name') || cleanHeader.includes('cliente') || cleanHeader.includes('completo'))) ||
                   (cleanField === 'cedula' && (cleanHeader.includes('ruc') || cleanHeader.includes('identificacion') || cleanHeader.includes('id'))) ||
                   (cleanField === 'telefono' && (cleanHeader.includes('phone') || cleanHeader.includes('celular') || cleanHeader.includes('movil'))) ||
                   (cleanField === 'direccion' && cleanHeader.includes('address'))
          })
          if (match) {
            initialMapping[field.key] = match
          }
        })
        setColumnMapping(initialMapping)
        setStep(2)
      } catch (err) {
        setErrorMsg('Error al procesar el formato CSV. Asegúrese de que sea un archivo delimitado por comas válido.')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  // Avanza al mapeo de referencias tras mapear las columnas
  const applyColumnMapping = () => {
    // Validar campos requeridos mapeados
    const missingFields = SYSTEM_FIELDS.filter(f => f.required && !columnMapping[f.key])
    if (missingFields.length > 0) {
      setErrorMsg(`Debe mapear los campos obligatorios: ${missingFields.map(f => f.label).join(', ')}`)
      return
    }

    setErrorMsg(null)

    // Crear el listado mapeado listo para enviar al backend
    const mapped = csvRows.map(row => {
      const obj: any = {}
      SYSTEM_FIELDS.forEach(field => {
        const csvCol = columnMapping[field.key]
        obj[field.key] = csvCol ? row[csvCol] : ''
      })
      return obj
    })

    setMappedData(mapped)

    // Enviar una validación preliminar para saber qué routers y planes vienen en el archivo
    validateMutation.mutate(mapped)
  }

  // Mutación para validar los datos en el backend
  const validateMutation = useMutation({
    mutationFn: async (payload: any[]) => {
      const { data } = await api.post('/clients/import/validate', payload)
      return data
    },
    onSuccess: (data) => {
      setValidationResult(data)
      
      // Auto-mapeo inteligente de Routers y Planes basados en los detectados
      const initialRouters: Record<string, string> = {}
      data.detected_routers.forEach((name: string) => {
        const found = dbRouters.find(r => r.nombre.toLowerCase().trim() === name.toLowerCase().trim() || r.id === name)
        if (found) initialRouters[name] = found.id
      })
      setRouterMappings(initialRouters)

      const initialPlans: Record<string, string> = {}
      data.detected_plans.forEach((name: string) => {
        const found = dbPlans.find(p => p.nombre.toLowerCase().trim() === name.toLowerCase().trim() || p.id === name)
        if (found) initialPlans[name] = found.id
      })
      setPlanMappings(initialPlans)

      setStep(3)
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail ?? 'Error al validar datos con el servidor.')
    }
  })

  // Ejecuta la validación final (con los IDs de routers y planes resueltos)
  const runFinalValidation = () => {
    // Validar que todos los routers detectados tengan un mapeo seleccionado
    const unmappedRouters = validationResult.detected_routers.filter((name: string) => !routerMappings[name])
    if (unmappedRouters.length > 0) {
      setErrorMsg('Debe asignar un router válido del sistema para cada router detectado en el archivo.')
      return
    }

    setErrorMsg(null)

    // Re-mapear los datos con los IDs reales
    const finalizedPayload = mappedData.map(row => {
      const resolvedRouterId = routerMappings[row.router] || ''
      const resolvedPlanId = planMappings[row.plan] || null

      return {
        ...row,
        router: resolvedRouterId, // Reemplazar nombre por UUID
        plan: resolvedPlanId // Reemplazar nombre por UUID o null
      }
    })

    setMappedData(finalizedPayload)

    // Volver a validar enviando los IDs en lugar de los nombres para el dry-run final
    revalidateMutation.mutate(finalizedPayload)
  }

  const revalidateMutation = useMutation({
    mutationFn: async (payload: any[]) => {
      const { data } = await api.post('/clients/import/validate', payload)
      return data
    },
    onSuccess: (data) => {
      setValidationResult(data)
      setStep(4)
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail ?? 'Error al revalidar datos.')
    }
  })

  // Mutación para importar definitivamente
  const importMutation = useMutation({
    mutationFn: async (clientsToImport: any[]) => {
      const payload = {
        clients: clientsToImport.map(row => {
          // Adaptar a la estructura de ClientCreate del Backend
          return {
            nombre: row.nombre || null,
            apellidos: row.apellidos,
            nombres: row.nombres,
            cedula: row.cedula,
            telefono: row.telefono,
            direccion: row.direccion,
            email: row.email || null,
            gateway_id: row.router,
            plan_id: row.plan || null,
            tipo: row.tipo || 'static',
            ip: row.ip || null,
            mac: row.mac || null,
            notas_ip: row.notas_ip || null,
            usuario_ppp: row.usuario_ppp || null,
            contraseña_ppp: row.contraseña_ppp || null,
            inicio_facturacion: row.inicio_facturacion || null,
            dia_inicio_periodo: row.dia_inicio_periodo ? parseInt(row.dia_inicio_periodo) : 1,
            auto_aplicar_pago: true,
            usar_credito_auto: true,
            prorrateo_separado: true
          }
        })
      }
      const { data } = await api.post('/clients/import/commit', payload)
      return data
    },
    onSuccess: (data) => {
      setImportResult(data)
      setStep(5)
      if (onSuccess) onSuccess()
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.detail ?? 'Ocurrió un error al procesar la importación masiva.')
    }
  })

  const handleImportCommit = () => {
    // Filtrar solo las filas válidas del validationResult
    const validRowsIndexes = validationResult.rows
      .filter((r: any) => r.valid)
      .map((r: any) => r.index)

    const validClients = mappedData.filter((_, idx) => validRowsIndexes.includes(idx))

    if (validClients.length === 0) {
      setErrorMsg('No hay clientes válidos para importar en el archivo actual.')
      return
    }

    setErrorMsg(null)
    importMutation.mutate(validClients)
  }

  const downloadTemplate = () => {
    const csvContent = 
      "apellidos,nombres,cedula,telefono,direccion,email,router,plan,tipo,ip,mac,usuario_ppp,contraseña_ppp,inicio_facturacion,dia_inicio_periodo\n" +
      "Perez Garcia,Juan Andres,1712345678,0998887766,\"Av. Amazonas 123 y Colon, Quito\",juan.perez@example.com,Router Principal,Plan Hogar 50Mbps,static,192.168.10.50,AA:BB:CC:DD:EE:FF,,,2026-06-01,1\n" +
      "Lopez Lopez,Maria,1798765432,0991112233,\"Av. 12 de Octubre, Quito\",maria.lopez@example.com,Router Secundario,Plan Corporativo 100Mbps,pppoe,,,maria_ppp,clave123,2026-06-01,5\n"

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", "plantilla_clientes_isp.csv")
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="glass-card w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-brand-400" />
            <span>Asistente de Importación de Clientes</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper Progress */}
        <div className="px-6 py-4 bg-secondary/20 border-b border-border/40 flex items-center justify-between text-xs font-semibold text-muted-foreground">
          <div className="flex items-center gap-6 w-full justify-around">
            <span className={`flex items-center gap-1.5 ${step === 1 ? 'text-brand-400 font-bold' : step > 1 ? 'text-emerald-400' : ''}`}>
              {step > 1 ? <CheckCircle className="w-4 h-4" /> : '1.'} Subir CSV
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-40" />
            <span className={`flex items-center gap-1.5 ${step === 2 ? 'text-brand-400 font-bold' : step > 2 ? 'text-emerald-400' : ''}`}>
              {step > 2 ? <CheckCircle className="w-4 h-4" /> : '2.'} Mapear Columnas
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-40" />
            <span className={`flex items-center gap-1.5 ${step === 3 ? 'text-brand-400 font-bold' : step > 3 ? 'text-emerald-400' : ''}`}>
              {step > 3 ? <CheckCircle className="w-4 h-4" /> : '3.'} Mapear Referencias
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-40" />
            <span className={`flex items-center gap-1.5 ${step === 4 ? 'text-brand-400 font-bold' : step > 4 ? 'text-emerald-400' : ''}`}>
              {step > 4 ? <CheckCircle className="w-4 h-4" /> : '4.'} Previsualizar
            </span>
            <ArrowRight className="w-3.5 h-3.5 opacity-40" />
            <span className={`flex items-center gap-1.5 ${step === 5 ? 'text-brand-400 font-bold' : ''}`}>
              5. Finalizar
            </span>
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-red-400 text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: UPLOAD CSV */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-border/80 rounded-xl hover:border-brand-500/50 transition-all bg-secondary/10 group cursor-pointer relative h-64">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <Upload className="w-12 h-12 text-muted-foreground group-hover:text-brand-400 transition-colors mb-4" />
                <p className="text-sm font-semibold text-foreground mb-1">
                  Selecciona o arrastra tu archivo CSV
                </p>
                <p className="text-xs text-muted-foreground text-center max-w-sm px-4">
                  Asegúrate de que tu archivo esté separado por comas (CSV) y codificado en UTF-8.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between p-4 bg-secondary/20 border border-border/60 rounded-xl">
                <div className="text-left">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-brand-400" /> Plantilla de Importación
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-md">
                    Descarga nuestra plantilla estructurada con ejemplos prácticos para asegurar que tus datos tengan el formato requerido por la plataforma.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="btn-secondary w-full sm:w-auto px-4 py-2 shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 rotate-180" />
                  Descargar Plantilla CSV
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: MAP COLUMNS */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-secondary/20 border border-border/60 rounded-xl">
                <h4 className="text-sm font-bold text-foreground mb-1 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-brand-400" />
                  Mapeo de Columnas
                </h4>
                <p className="text-xs text-muted-foreground">
                  Asocia los campos requeridos por el sistema con las columnas que detectamos en tu archivo CSV.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto pr-2">
                {SYSTEM_FIELDS.map((field) => (
                  <div key={field.key} className="flex flex-col gap-1.5 p-3 rounded-lg bg-secondary/30 border border-border/40">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      {field.label}
                      {field.required && <span className="text-red-500 font-bold">*</span>}
                    </label>
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                      className="input-field cursor-pointer text-xs"
                    >
                      <option value="">-- Ignorar o No Mapeado --</option>
                      {csvHeaders.map(header => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="btn-secondary px-4 py-2"
                >
                  Atrás
                </button>
                <button
                  onClick={applyColumnMapping}
                  disabled={validateMutation.isPending}
                  className="btn-primary px-6 py-2 flex items-center gap-1.5"
                >
                  {validateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Analizando...
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REF MAPS */}
          {step === 3 && validationResult && (
            <div className="space-y-5">
              <div className="p-4 bg-secondary/20 border border-border/60 rounded-xl">
                <h4 className="text-sm font-bold text-foreground mb-1">
                  Mapeo de Routers y Planes
                </h4>
                <p className="text-xs text-muted-foreground">
                  Detectamos los siguientes nombres de Routers y Planes en tu CSV. Por favor, asócialos con sus equivalentes reales de la plataforma.
                </p>
              </div>

              {/* Mapeo de Routers */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-brand-400 uppercase tracking-wider">Mapeo de Routers Detectados</h5>
                <div className="space-y-2 max-h-[15vh] overflow-y-auto pr-1">
                  {validationResult.detected_routers.map((name: string) => (
                    <div key={name} className="flex items-center gap-4 p-2.5 rounded-lg bg-secondary/30 border border-border/40 justify-between text-xs">
                      <span className="font-semibold text-foreground font-mono">{name || '(Vacío / Sin Router)'}</span>
                      <select
                        value={routerMappings[name] || ''}
                        onChange={(e) => setRouterMappings({ ...routerMappings, [name]: e.target.value })}
                        className="input-field w-64 text-xs cursor-pointer"
                      >
                        <option value="">-- Seleccionar Router en Sistema --</option>
                        {dbRouters.map(r => (
                          <option key={r.id} value={r.id}>{r.nombre}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mapeo de Planes */}
              {validationResult.detected_plans.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-border/40">
                  <h5 className="text-xs font-bold text-brand-400 uppercase tracking-wider">Mapeo de Planes Detectados</h5>
                  <div className="space-y-2 max-h-[15vh] overflow-y-auto pr-1">
                    {validationResult.detected_plans.map((name: string) => (
                      <div key={name} className="flex items-center gap-4 p-2.5 rounded-lg bg-secondary/30 border border-border/40 justify-between text-xs">
                        <span className="font-semibold text-foreground font-mono">{name || '(Vacío)'}</span>
                        <select
                          value={planMappings[name] || ''}
                          onChange={(e) => setPlanMappings({ ...planMappings, [name]: e.target.value })}
                          className="input-field w-64 text-xs cursor-pointer"
                        >
                          <option value="">-- No asignar plan / Ignorar --</option>
                          {dbPlans.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <button
                  onClick={() => setStep(2)}
                  className="btn-secondary px-4 py-2"
                >
                  Atrás
                </button>
                <button
                  onClick={runFinalValidation}
                  disabled={revalidateMutation.isPending}
                  className="btn-primary px-6 py-2 flex items-center gap-1.5"
                >
                  {revalidateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Validando...
                    </>
                  ) : (
                    <>
                      Validar Datos <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: PREVIEW VALIDATION */}
          {step === 4 && validationResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-secondary/20 border border-border/60 rounded-xl">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Previsualización y Validación del Lote
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Revise qué filas son válidas para importar. Las filas con errores serán omitidas.
                  </p>
                </div>
                <div className="flex gap-4 text-xs">
                  <div className="text-center bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-lg">
                    <span className="block font-bold text-emerald-400">{validationResult.valid_rows}</span>
                    <span className="text-[10px] text-muted-foreground">Válidos</span>
                  </div>
                  <div className="text-center bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-lg">
                    <span className="block font-bold text-red-400">{validationResult.invalid_rows}</span>
                    <span className="text-[10px] text-muted-foreground">Errores</span>
                  </div>
                </div>
              </div>

              {/* Listado de filas con estado */}
              <div className="border border-border/60 rounded-xl overflow-hidden max-h-[35vh] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-secondary/40 border-b border-border/60 text-muted-foreground uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3 w-16">Fila</th>
                      <th className="p-3 w-48">Cliente</th>
                      <th className="p-3 w-32">Cédula</th>
                      <th className="p-3">Estado / Detalle de Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {validationResult.rows.map((row: any) => (
                      <tr key={row.index} className={row.valid ? 'hover:bg-emerald-500/5' : 'bg-red-500/5 hover:bg-red-500/10'}>
                        <td className="p-3 text-muted-foreground font-mono">{row.index + 1}</td>
                        <td className="p-3 font-semibold text-foreground">{row.data.nombre || '—'}</td>
                        <td className="p-3 font-mono text-muted-foreground">{row.data.cedula || '—'}</td>
                        <td className="p-3">
                          {row.valid ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Listo
                            </span>
                          ) : (
                            <div className="text-red-400 space-y-1">
                              {row.errors.map((err: string, i: number) => (
                                <p key={i} className="flex items-start gap-1">
                                  <span className="font-bold">•</span>
                                  <span>{err}</span>
                                </p>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
                <button
                  onClick={() => setStep(3)}
                  className="btn-secondary px-4 py-2"
                >
                  Atrás
                </button>
                <button
                  onClick={handleImportCommit}
                  disabled={importMutation.isPending || validationResult.valid_rows === 0}
                  className="btn-primary bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-600/10 px-6 py-2 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Importando...
                    </>
                  ) : (
                    <>
                      Importar {validationResult.valid_rows} Clientes <CheckCircle className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: FINAL SUMMARY */}
          {step === 5 && importResult && (
            <div className="space-y-6 py-4 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center border border-emerald-500/20 mb-2">
                <CheckCircle className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-foreground">Importación Finalizada</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  El proceso de importación masiva se completó. A continuación se detalla el resultado:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                  <span className="block text-2xl font-bold text-emerald-400 font-mono">{importResult.imported_count}</span>
                  <span className="text-xs text-muted-foreground">Importados con éxito</span>
                </div>
                <div className="p-4 bg-secondary/30 border border-border/40 rounded-xl">
                  <span className="block text-2xl font-bold text-red-400 font-mono">{importResult.failed_count}</span>
                  <span className="text-xs text-muted-foreground">Fallidos</span>
                </div>
              </div>

              {importResult.failed_count > 0 && (
                <div className="w-full text-left bg-red-500/5 border border-red-500/10 rounded-xl p-4 space-y-2 max-h-[25vh] overflow-y-auto">
                  <h5 className="text-xs font-bold text-red-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" /> Detalles de Errores en MikroTik / BD
                  </h5>
                  <div className="divide-y divide-border/20 text-xs">
                    {importResult.failures.map((f: any, i: number) => (
                      <div key={i} className="py-2 flex justify-between gap-4">
                        <span className="font-semibold text-foreground">{f.nombre} ({f.cedula})</span>
                        <span className="text-red-400 font-medium">{f.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="btn-primary px-8 py-2.5 mt-2"
              >
                Cerrar Asistente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
