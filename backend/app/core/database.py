"""
Base SQLAlchemy declarativa y motor de base de datos.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

# SQLite (tests) no soporta pool_size ni max_overflow
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")

_engine_kwargs: dict = {"pool_pre_ping": True}
if not _is_sqlite:
    _engine_kwargs["pool_size"] = 10
    _engine_kwargs["max_overflow"] = 20

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def run_migrations(bind_engine) -> None:
    """
    Ejecuta migraciones simples de base de datos para agregar las nuevas columnas a la tabla gateways.
    """
    if not str(bind_engine.url).startswith("sqlite"):
        with bind_engine.connect() as conn:
            # ── Migración: Router → Gateway (Renombrar tabla principal primero si existe como 'routers') ──
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'routers'
                ) THEN
                    ALTER TABLE routers RENAME TO gateways;
                END IF;
            END $$;
            """))

            conn.execute(text("ALTER TABLE gateways ADD COLUMN IF NOT EXISTS cola_padre VARCHAR(100);"))
            conn.execute(text("ALTER TABLE gateways ADD COLUMN IF NOT EXISTS address_list VARCHAR(100);"))
            conn.execute(text("ALTER TABLE gateways ADD COLUMN IF NOT EXISTS ancho_banda_up INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE gateways ADD COLUMN IF NOT EXISTS ancho_banda_down INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255);"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS use_logo_on_login BOOLEAN NOT NULL DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_bg_url VARCHAR(255);"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS use_login_bg BOOLEAN NOT NULL DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS inactivity_timeout INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS tipo_operador VARCHAR(50);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS permisos_router VARCHAR(255);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS horario_acceso VARCHAR(100);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS permisos VARCHAR(500);"))
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS custom_services (
                id VARCHAR(36) PRIMARY KEY,
                nombre VARCHAR(120) NOT NULL UNIQUE,
                precio NUMERIC(10, 2) NOT NULL,
                descripcion VARCHAR(255),
                impuestos NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
                activo BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sites (
                id VARCHAR(36) PRIMARY KEY,
                nombre VARCHAR(120) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("ALTER TABLE gateways ADD COLUMN IF NOT EXISTS site_id VARCHAR(36) REFERENCES sites(id);"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS invoices (
                id VARCHAR(36) PRIMARY KEY,
                cliente_id VARCHAR(36) REFERENCES clients(id) ON DELETE CASCADE,
                plan_id VARCHAR(36) REFERENCES plans(id) ON DELETE SET NULL,
                periodo VARCHAR(10) NOT NULL,
                monto NUMERIC(10, 2) NOT NULL,
                fecha_emision TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                fecha_vencimiento TIMESTAMP WITH TIME ZONE NOT NULL,
                estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(36) REFERENCES invoices(id) ON DELETE SET NULL;"))
            conn.execute(text("ALTER TABLE payments ADD COLUMN IF NOT EXISTS usuario_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL;"))
            conn.execute(text("ALTER TABLE payments ADD COLUMN IF NOT EXISTS notas VARCHAR(255);"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS client_custom_services (
                cliente_id VARCHAR(36) REFERENCES clients(id) ON DELETE CASCADE,
                custom_service_id VARCHAR(36) REFERENCES custom_services(id) ON DELETE CASCADE,
                PRIMARY KEY (cliente_id, custom_service_id)
            );
            """))
            conn.execute(text("ALTER TABLE custom_services ADD COLUMN IF NOT EXISTS recurrente BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS invoice_custom_services (
                invoice_id VARCHAR(36) REFERENCES invoices(id) ON DELETE CASCADE,
                custom_service_id VARCHAR(36) REFERENCES custom_services(id) ON DELETE CASCADE,
                PRIMARY KEY (invoice_id, custom_service_id)
            );
            """))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS inicio_facturacion TIMESTAMP WITH TIME ZONE;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS dia_inicio_periodo INTEGER DEFAULT 1;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS crear_factura_anticipo_dias INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS tipo_facturacion VARCHAR(20) DEFAULT 'forward';"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS auto_aplicar_pago BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS usar_credito_auto BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS prorrateo_separado BOOLEAN DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);"))
            conn.execute(text("ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS modelo VARCHAR(80);"))
            conn.execute(text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS latitud DOUBLE PRECISION;"))
            conn.execute(text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS longitud DOUBLE PRECISION;"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS system_settings (
                id VARCHAR(36) PRIMARY KEY,
                mikrotik_timeout INTEGER NOT NULL DEFAULT 10,
                mikrotik_attempts INTEGER NOT NULL DEFAULT 1,
                mikrotik_debug BOOLEAN NOT NULL DEFAULT FALSE,
                mikrotik_ssl BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS product_categories (
                id VARCHAR(36) PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                usuario_id UUID REFERENCES users(id) ON DELETE SET NULL,
                usuario_nombre VARCHAR(150),
                accion VARCHAR(60) NOT NULL,
                entidad_tipo VARCHAR(60),
                entidad_id VARCHAR(36),
                entidad_nombre VARCHAR(250),
                detalle JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_accion ON audit_logs(accion);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_entidad_tipo ON audit_logs(entidad_tipo);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_entidad_id ON audit_logs(entidad_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_created_at ON audit_logs(created_at DESC);"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS client_inventory_items (
                id VARCHAR(36) PRIMARY KEY,
                client_id VARCHAR(36) NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                inventory_item_id VARCHAR(36) NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
                cantidad INTEGER NOT NULL DEFAULT 1,
                numero_serie VARCHAR(100),
                mac VARCHAR(17),
                notas TEXT,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_client_inventory_items_client_id ON client_inventory_items(client_id);"))
            conn.execute(text("ALTER TABLE clients ALTER COLUMN telefono DROP NOT NULL;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS suspension_programada TIMESTAMP WITH TIME ZONE;"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS suspension_programada_motivo VARCHAR(255);"))
            conn.execute(text("ALTER TABLE clients ADD COLUMN IF NOT EXISTS reactivacion_programada TIMESTAMP WITH TIME ZONE;"))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS mikrotik_sync_queue (
                id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
                gateway_id  UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
                client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
                operation   VARCHAR(50) NOT NULL,
                payload     JSONB NOT NULL DEFAULT '{}',
                status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                attempts    INTEGER NOT NULL DEFAULT 0,
                last_error  TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                next_retry_at TIMESTAMPTZ
            );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_msq_gateway_status ON mikrotik_sync_queue(gateway_id, status);"))

            # ── Ajustes de Sistema: localización, fiscal, notificaciones, seguridad, mantenimiento, integraciones ──
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS loc_timezone VARCHAR(60) NOT NULL DEFAULT 'UTC';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS loc_locale VARCHAR(10) NOT NULL DEFAULT 'es';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS loc_currency_code VARCHAR(10) NOT NULL DEFAULT 'USD';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS loc_currency_symbol VARCHAR(5) NOT NULL DEFAULT '$';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS loc_date_format VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fiscal_tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fiscal_tax_name VARCHAR(20) NOT NULL DEFAULT 'ITBIS';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fiscal_invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'FAC-';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fiscal_invoice_next_number INTEGER NOT NULL DEFAULT 1;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_host VARCHAR(255);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_port INTEGER DEFAULT 587;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_user VARCHAR(255);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_password_encrypted TEXT;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_from_email VARCHAR(255);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_from_name VARCHAR(120);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS smtp_use_tls BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_password_min_length INTEGER NOT NULL DEFAULT 8;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_password_expiration_days INTEGER NOT NULL DEFAULT 0;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_default_session_timeout_minutes INTEGER NOT NULL DEFAULT 30;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_max_login_attempts INTEGER NOT NULL DEFAULT 5;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_lockout_duration_minutes INTEGER NOT NULL DEFAULT 15;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS sec_ip_whitelist JSONB;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maint_audit_log_retention_days INTEGER NOT NULL DEFAULT 90;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maint_maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maint_maintenance_message VARCHAR(500);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS pg_api_key VARCHAR(255);"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS pg_api_secret_encrypted TEXT;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_hora_generacion VARCHAR(5) NOT NULL DEFAULT '08:00';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_ciclo VARCHAR(20) NOT NULL DEFAULT 'mensual';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_modo_precio VARCHAR(20) NOT NULL DEFAULT 'incluido';"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_auto_aprobar_enviar BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_detener_suspendidos BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_notify_new_invoice BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_attach_pdf_receipt BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_default_dia_pago INTEGER NOT NULL DEFAULT 5;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_default_dias_gracia INTEGER NOT NULL DEFAULT 3;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_aviso_nueva_factura BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_aviso_previo_dias INTEGER NOT NULL DEFAULT 5;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_recordatorios_pago BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS billing_recordatorio_frecuencia_dias INTEGER NOT NULL DEFAULT 3;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_automatica BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_hora INTEGER NOT NULL DEFAULT 0;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_retraso_dias INTEGER NOT NULL DEFAULT 0;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_permitir_aplazamiento BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_notify_suspendido BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_notify_pospuesto BOOLEAN NOT NULL DEFAULT TRUE;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS suspension_motivos JSONB;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS payment_methods JSONB;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS fechas_corte JSONB;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS colas_padre JSONB;"))
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS address_lists JSONB;"))

            # Renombrar columna router_id → gateway_id en cada tabla relacionada
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'clients' AND column_name = 'router_id'
                ) THEN
                    ALTER TABLE clients RENAME COLUMN router_id TO gateway_id;
                END IF;
            END $$;
            """))
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'pppoe_profiles' AND column_name = 'router_id'
                ) THEN
                    ALTER TABLE pppoe_profiles RENAME COLUMN router_id TO gateway_id;
                END IF;
            END $$;
            """))
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'pppoe_secrets' AND column_name = 'router_id'
                ) THEN
                    ALTER TABLE pppoe_secrets RENAME COLUMN router_id TO gateway_id;
                END IF;
            END $$;
            """))
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'static_ips' AND column_name = 'router_id'
                ) THEN
                    ALTER TABLE static_ips RENAME COLUMN router_id TO gateway_id;
                END IF;
            END $$;
            """))
            conn.execute(text("""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'traffic_samples' AND column_name = 'router_id'
                ) THEN
                    ALTER TABLE traffic_samples RENAME COLUMN router_id TO gateway_id;
                END IF;
            END $$;
            """))
            conn.commit()




