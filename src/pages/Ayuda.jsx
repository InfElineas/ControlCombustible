import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  LayoutDashboard, List, Users, WalletCards, Bell, BarChart3,
  Navigation, BookOpen, Settings, Shield, HelpCircle, Search,
  ChevronRight, Fuel, ArrowRightLeft, AlertTriangle, CheckCircle2,
  Calculator, Info, Lightbulb, FileText, Gauge, Car,
  CreditCard, TrendingUp, Clock, Route, User2, Database, ClipboardList,
  Droplets, PackageCheck, XCircle, Upload,
} from 'lucide-react';

// ── Primitivos de layout ──────────────────────────────────────────────────────

function Callout({ type = 'info', title, children }) {
  const cfg = {
    info:    { cls: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-950/40 dark:border-sky-800 dark:text-sky-200',    Icon: Info,          iconCls: 'text-sky-500'    },
    tip:     { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200', Icon: Lightbulb,     iconCls: 'text-emerald-500' },
    warning: { cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200',   Icon: AlertTriangle, iconCls: 'text-amber-500'   },
    formula: { cls: 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800/60 dark:border-slate-600 dark:text-slate-200',   Icon: Calculator,    iconCls: 'text-slate-500'   },
  }[type];
  const { cls, Icon, iconCls } = cfg;
  return (
    <div className={`rounded-xl border px-4 py-3 my-3 ${cls}`}>
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconCls}`} />
        <div className="flex-1 min-w-0 text-sm">
          {title && <p className="font-semibold mb-1">{title}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function Formula({ children }) {
  return (
    <code className="block bg-slate-100 dark:bg-slate-800 rounded-lg px-4 py-2.5 my-2 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
      {children}
    </code>
  );
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className="text-base font-bold text-slate-800 dark:text-slate-100 mt-6 mb-2 scroll-mt-4">
      {children}
    </h2>
  );
}

function SubTitle({ children }) {
  return (
    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-4 mb-1.5">
      {children}
    </h3>
  );
}

function P({ children }) {
  return <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">{children}</p>;
}

function TableDoc({ headers, rows }) {
  return (
    <div className="overflow-x-auto my-3 rounded-xl border border-slate-100 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-800">
            {headers.map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-800/40'}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-700 dark:text-slate-300 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tag({ children, color = 'sky' }) {
  const colors = {
    sky:     'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    orange:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    violet:  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    red:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mr-1 ${colors[color] || colors.sky}`}>
      {children}
    </span>
  );
}

// ── Secciones de contenido ────────────────────────────────────────────────────

const sections = [
  {
    id: 'introduccion',
    label: 'Introducción',
    icon: HelpCircle,
    color: 'text-sky-600',
    content: () => (
      <>
        <P>
          El <strong>Sistema de Control de Combustible</strong> permite gestionar, supervisar y auditar
          el consumo de combustible de toda la flota de vehículos y equipos de la organización.
          Registra cada carga, despacho, ruta y alerta, generando reportes trazables en tiempo real.
        </P>

        <SubTitle>Flujo general del sistema</SubTitle>
        <Callout type="info" title="Cómo fluye el combustible en el sistema">
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li><strong>DEPÓSITO (entrada al sistema):</strong> el proveedor externo (cisterna, CUPET central) entrega combustible al <em>Iso Tanque</em> de la empresa. Se registra como DEPÓSITO — el origen es el Iso Tanque seleccionado del catálogo.</li>
            <li><strong>DESPACHO Iso Tanque → Cupet:</strong> del Iso Tanque se transfiere al Cupet interno (punto de distribución). Se registra como DESPACHO: origen = Iso Tanque, destino = Cupet.</li>
            <li><strong>COMPRA (vehículo en surtidor):</strong> el vehículo carga en el Cupet con su tarjeta corporativa vinculada. Se registra como COMPRA: tarjeta + consumidor + litros + odómetro.</li>
            <li><strong>DESPACHO directo (alternativo):</strong> para equipos o vehículos sin tarjeta, la reserva puede despachar directamente sin pasar por Cupet.</li>
            <li><strong>Análisis:</strong> el sistema calcula km/L por vehículo, detecta desviaciones respecto al índice de referencia y genera alertas automáticas.</li>
          </ol>
        </Callout>
        <Callout type="tip" title="Vehículos sin control de odómetro (autorizos / directivos)">
          Los vehículos de dirección o autorizos pueden marcarse con el flag <strong>"Sin control de odómetro"</strong>
          en la ficha del consumidor. En ese caso el sistema <strong>no pide km ni nivel de tanque</strong>
          al registrar cargas — se registra solo la fecha, tarjeta y litros. No generan alertas de km/L.
        </Callout>

        <SubTitle>Roles de usuario</SubTitle>
        <TableDoc
          headers={['Rol', 'Qué puede hacer']}
          rows={[
            [<Tag color="sky">Super Admin</Tag>, 'Acceso completo: crear, editar, eliminar en todos los módulos. Gestiona usuarios y roles. Puede eliminar bonificaciones de prueba.'],
            [<Tag color="emerald">Operador</Tag>, 'Registra movimientos, consumidores, alertas y configuración. Puede registrar y gestionar bonificaciones. No accede a Finanzas ni Administración.'],
            [<Tag color="violet">Auditor</Tag>, 'Solo lectura. Ve Dashboard, Movimientos, Rutas, Reportes y Bonificaciones. No puede crear ni eliminar.'],
            [<Tag color="amber">Económico</Tag>, 'Accede a Dashboard, Movimientos, Finanzas, Reportes y Bonificaciones. Puede marcar bonificaciones como cobradas. Perfil contable/financiero.'],
            [<Tag color="red">Cajero</Tag>, 'Acceso exclusivo a Bonificaciones y Reportes de bonificaciones. Registra nuevas bonificaciones, marca retiros y cobros. Perfil para el personal de caja.'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'guia',
    label: 'Guía de inicio',
    icon: ClipboardList,
    color: 'text-emerald-600',
    content: () => (
      <>
        <P>
          Esta guía te lleva desde la configuración inicial del sistema hasta la operación diaria.
          Síguela en orden la primera vez; luego usa la barra lateral para profundizar en cualquier módulo.
        </P>

        <SectionTitle id="guia-configuracion">Fase 1 — Configuración inicial (una sola vez)</SectionTitle>

        <Callout type="info" title="Orden recomendado de configuración">
          Respeta este orden porque cada paso depende del anterior:
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li><strong>Catálogos → Tipos de combustible</strong> — define los combustibles disponibles (Gasolina Regular, Diésel, etc.).</li>
            <li><strong>Catálogos → Tipos de consumidor</strong> — crea los tipos y activa los comportamientos clave por nombre.</li>
            <li><strong>Catálogos → Consumidores</strong> — registra los consumidores en este orden: ISO TANQUE → tanques/reservas → vehículos.</li>
            <li><strong>Catálogos → Conductores</strong> — carga el personal que opera los vehículos.</li>
            <li><strong>Finanzas → Tarjetas</strong> — registra las tarjetas corporativas usadas en surtidores.</li>
            <li><strong>Rutas → Catálogo de rutas</strong> — crea las rutas habituales de la flota.</li>
            <li><strong>(Opcional) Configuración → GPS</strong> — vincula los vehículos con sus dispositivos GPS para lectura automática de odómetro y km recorridos.</li>
          </ol>
        </Callout>

        <SubTitle>Paso 1 — Tipos de combustible</SubTitle>
        <P>
          Ve a <strong>Catálogos</strong> y agrega cada tipo de combustible que usa la flota
          (Gasolina Regular, Gasolina Especial, Diésel, etc.). Sin este paso no podrás registrar movimientos.
        </P>

        <SubTitle>Paso 2 — Tipos de consumidor</SubTitle>
        <P>
          El <em>nombre</em> del tipo controla el comportamiento automático del sistema.
          Crea al menos estos tipos:
        </P>
        <TableDoc
          headers={['Tipo que debes crear', 'Nombre sugerido', 'Por qué']}
          rows={[
            ['ISO TANQUE', '"ISO TANQUE" o "Iso Tanque"', 'El nombre debe contener "ISO". Solo así aparecerá en el selector de DEPÓSITO.'],
            ['Vehículo', '"Vehículo" o "Camión"', 'El nombre debe contener "veh". Activa odómetro, km/L, conductor y alertas.'],
            ['Reserva / Cupet', '"Reserva" o "Cupet"', 'El nombre debe contener "tanque" o "reserva". Permite usarla como origen de DESPACHO.'],
            ['Equipo eléctrico', '"Equipo" o "Generador"', 'El nombre debe contener "equipo", "planta" o "grupo". Activa horómetro.'],
          ]}
        />

        <SubTitle>Paso 3 — Consumidores</SubTitle>
        <P>
          Crea los consumidores en el orden indicado. Para vehículos configura el índice de consumo de
          referencia (km/L fabricante) para que funcionen las alertas:
        </P>
        <TableDoc
          headers={['En este orden', 'Qué configurar']}
          rows={[
            ['1. ISO TANQUE (ej: ISOTANQUE-001)', 'Tipo: ISO TANQUE. Litros iniciales: 0 si vas a registrar todos los ingresos como DEPÓSITO. Combustible: el principal de la flota.'],
            ['2. Tanques / Reservas (ej: Cupet Central)', 'Tipo: Reserva. Litros iniciales: stock actual. Combustible correspondiente.'],
            ['3. Vehículos (uno por unidad)', 'Tipo: Vehículo. Chapa, conductor principal, ayudante, capacidad del tanque, km/L fabricante. Activa "Sin odómetro" solo para autorizos/directivos.'],
          ]}
        />
        <Callout type="warning" title="Litros iniciales del ISO TANQUE">
          El campo <strong>Litros iniciales</strong> del ISO TANQUE representa el combustible
          físico al momento de empezar a usar el sistema. Si ya existen movimientos de DEPÓSITO
          que cubren ese stock, ponlo en <strong>0</strong> para evitar doble conteo.
        </Callout>

        <SubTitle>Paso 4 — Conductores</SubTitle>
        <P>
          Ve a <strong>Conductores</strong> y registra el personal operativo. Luego vuelve
          a cada vehículo en Consumidores y asigna el conductor principal (y ayudante si aplica).
        </P>

        <SubTitle>Paso 5 — Tarjetas corporativas</SubTitle>
        <P>
          En <strong>Finanzas → Tarjetas</strong>, registra cada tarjeta de pago usada en
          surtidores externos. Las tarjetas son obligatorias para registrar un movimiento de tipo COMPRA.
        </P>

        <SubTitle>Paso 6 — Catálogo de rutas</SubTitle>
        <P>
          En <strong>Rutas → Catálogo de rutas</strong>, crea las rutas habituales con nombre,
          distancia de referencia y vehículo por defecto. Los viajes ocasionales (viajes extra)
          no requieren ruta previa en el catálogo.
        </P>

        <SectionTitle id="guia-diaria">Fase 2 — Operación diaria</SectionTitle>

        <Callout type="tip" title="Secuencia típica de un día operativo">
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li><strong>¿Llegó cisterna?</strong> → registra un <Tag color="emerald">DEPÓSITO</Tag> al ISO TANQUE.</li>
            <li><strong>¿Se transfirió al Cupet?</strong> → registra un <Tag color="violet">DESPACHO</Tag> (ISO TANQUE → Cupet).</li>
            <li><strong>¿Vehículo cargó en surtidor?</strong> → registra una <Tag color="orange">COMPRA</Tag> con la tarjeta corporativa.</li>
            <li><strong>Rutas del día</strong> → en Rutas → Programa diario, marca cada ruta o usa <strong>"Importar del chat"</strong>.</li>
          </ol>
        </Callout>

        <SubTitle>A — Registrar entrada de combustible (DEPÓSITO)</SubTitle>
        <P>
          Cuando la cisterna entrega combustible al ISO TANQUE, ve a <strong>Movimientos → Nuevo</strong>
          y selecciona tipo <strong>DEPÓSITO</strong>. El formulario solo muestra ISO TANQUEs como destino.
          El origen puede ser un ISO TANQUE del catálogo (referencia interna) o texto libre
          (número de remisión del proveedor).
        </P>

        <SubTitle>B — Transferir del ISO TANQUE al punto de distribución (DESPACHO)</SubTitle>
        <P>
          Cuando se bombea combustible del ISO TANQUE al Cupet, registra un <strong>DESPACHO</strong>:
          origen = ISO TANQUE, destino = Cupet. Esto descuenta del ISO TANQUE y acredita al Cupet.
        </P>

        <SubTitle>C — Vehículo carga en surtidor o recibe despacho (COMPRA / DESPACHO)</SubTitle>
        <P>
          Si el vehículo usa una tarjeta en el surtidor externo: registra una <strong>COMPRA</strong>
          con la tarjeta, el odómetro actual y los litros.<br />
          Si el vehículo recibe combustible directamente de la reserva interna: registra un{' '}
          <strong>DESPACHO</strong> (origen = Cupet, destino = vehículo).
        </P>
        <Callout type="tip">
          El sistema calcula automáticamente el km/L de la carga anterior al registrar el odómetro actual.
          El consumo real se actualiza en la tarjeta del consumidor al guardar.
        </Callout>

        <SubTitle>D — Programa diario de rutas</SubTitle>
        <P>
          Al final del día ve a <strong>Rutas → Programa diario</strong>.
          Hay dos formas de registrar los viajes:
        </P>
        <TableDoc
          headers={['Método', 'Cuándo usarlo', 'Cómo']}
          rows={[
            ['Manual', 'Tienes los datos disponibles directamente', 'Clic en cada ruta → rellena estado, vehículo, km reales y conductor.'],
            ['Importar del chat', 'Los conductores reportaron el día por WhatsApp', 'Botón "Importar del chat" → pega el texto del grupo o sube el .txt exportado → revisa y confirma.'],
          ]}
        />
        <Callout type="info" title="Barra resumen del día">
          Sobre el listado de rutas hay una barra que muestra en tiempo real:
          <ul className="mt-1.5 space-y-0.5 list-none">
            <li>✅ <strong>Completadas</strong> — rutas con estado "completada" ese día.</li>
            <li>❌ <strong>Canceladas</strong> — rutas canceladas ese día.</li>
            <li>📏 <strong>Km totales</strong> — suma de km reales registrados (rutas + viajes extra).</li>
            <li>⛽ <strong>Litros estimados</strong> — suma de litros estimados (disponibles al importar del chat).</li>
            <li>📊 <strong>Cumplimiento %</strong> — completadas ÷ (completadas + canceladas) × 100.</li>
          </ul>
        </Callout>

        <SectionTitle id="guia-revision">Fase 3 — Revisión periódica</SectionTitle>

        <TableDoc
          headers={['Frecuencia', 'Qué revisar', 'Dónde']}
          rows={[
            ['Diaria', 'Barra resumen del programa diario: completadas, km, litros, cumplimiento.', 'Rutas → Programa diario'],
            ['Semanal', 'Alertas de consumo: vehículos con km/L bajo el umbral. Revisar odómetros sospechosos.', 'Dashboard → Alertas críticas / Módulo Alertas'],
            ['Mensual', 'Estadísticas de rutas: km totales, canceladas, sustituciones, litros. Reporte de consumo por vehículo.', 'Rutas → Estadísticas / Módulo Reportes'],
            ['Cuando sea necesario', 'Stock de ISO TANQUE y Cupet. Si hay desvío, revisar si falta algún DEPÓSITO o DESPACHO.', 'Dashboard → sección de combustible'],
          ]}
        />

        <Callout type="tip" title="Primeros pasos después de la configuración">
          Una vez creados los consumidores y el catálogo de rutas, el flujo mínimo para empezar es:
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li>Registra el primer DEPÓSITO para establecer el stock del ISO TANQUE.</li>
            <li>Registra un DESPACHO del ISO TANQUE al Cupet si aplica.</li>
            <li>Registra la primera COMPRA de un vehículo con su odómetro actual.</li>
            <li>Registra la segunda COMPRA del mismo vehículo — a partir de aquí el sistema ya calculará km/L.</li>
          </ol>
        </Callout>
      </>
    ),
  },
  {
    id: 'movimientos',
    label: 'Movimientos',
    icon: List,
    color: 'text-orange-600',
    content: () => (
      <>
        <P>
          Los movimientos son el registro central del sistema. Cada carga de combustible,
          ya sea en un surtidor externo o desde una reserva interna, se registra aquí.
        </P>

        <SubTitle>Tipos de movimiento</SubTitle>
        <TableDoc
          headers={['Tipo', 'Descripción', 'Quién interviene', 'Efecto en el stock']}
          rows={[
            [
              <Tag color="orange">COMPRA</Tag>,
              'El consumidor adquiere combustible en un surtidor o Cupet usando una tarjeta corporativa.',
              'Surtidor / Cupet → Vehículo / Equipo',
              'Suma litros al consumidor destino.',
            ],
            [
              <Tag color="violet">DESPACHO</Tag>,
              'Transferencia interna desde una reserva o Iso Tanque hacia otro consumidor.',
              'Iso Tanque / Reserva → Cupet / Vehículo / Equipo',
              'Resta litros del origen. Suma litros al destino.',
            ],
            [
              <Tag color="emerald">DEPÓSITO</Tag>,
              'Entrada de combustible desde fuente externa al Iso Tanque de la empresa. El origen se selecciona del catálogo de Iso Tanques registrados (o se escribe una referencia libre para origen externo).',
              'Proveedor externo → Iso Tanque',
              'Suma litros al Iso Tanque destino. No descuenta ningún origen interno.',
            ],
          ]}
        />

        <Callout type="info" title="Flujo operativo típico">
          <strong>DEPÓSITO</strong> (cisterna → Iso Tanque) →{' '}
          <strong>DESPACHO</strong> (Iso Tanque → Cupet) →{' '}
          <strong>COMPRA</strong> (vehículo retira del Cupet con tarjeta).<br />
          El DEPÓSITO solo acepta <em>Iso Tanques</em> como destino. El origen puede ser un Iso Tanque
          registrado en el catálogo o una referencia libre (número de remisión, proveedor externo).
        </Callout>

        <Callout type="warning" title="Diferencia clave COMPRA vs DESPACHO">
          Un vehículo puede abastecerse por COMPRA (va al surtidor con tarjeta) o por DESPACHO (recibe
          combustible directamente de la reserva). Ambos suman al consumo real del vehículo, pero solo
          la COMPRA genera gasto financiero con tarjeta corporativa.
        </Callout>

        <SubTitle>Campos de un movimiento</SubTitle>
        <TableDoc
          headers={['Campo', 'Obligatorio', 'Descripción']}
          rows={[
            ['Fecha', 'Sí', 'Fecha en que ocurrió la carga o despacho.'],
            ['Tipo', 'Sí', 'COMPRA o DESPACHO.'],
            ['Consumidor (destino)', 'Sí', 'Vehículo, equipo o reserva que recibe el combustible.'],
            ['Origen (solo DESPACHO)', 'Sí en DESPACHO', 'Reserva que entrega el combustible.'],
            ['Combustible', 'Sí', 'Tipo de combustible (Gasolina Regular, Gasolina Especial, Diésel, etc.).'],
            ['Litros', 'Sí', 'Cantidad de combustible en litros.'],
            ['Precio unitario', 'Sí en COMPRA', 'Precio por litro en el momento de la compra.'],
            ['Monto total', 'Auto', 'Se calcula automáticamente: Litros × Precio.'],
            ['Tarjeta', 'Sí en COMPRA', 'Tarjeta corporativa utilizada para el pago.'],
            ['Odómetro', 'Condicional', 'Lectura actual del cuentakilómetros. Obligatorio para vehículos, opcional para equipos/tanques.'],
            ['Nivel en tanque (L)', 'No', 'Litros físicos en el tanque del consumidor ANTES de recibir el combustible. Disponible en COMPRA, DESPACHO y DEPÓSITO. Permite verificar el stock real y calcular el consumo entre cargas.'],
            ['Consumo real (km/L)', 'Auto', 'Se calcula automáticamente al registrar dos odómetros consecutivos.'],
            ['Observaciones', 'No', 'Notas libres sobre la operación.'],
          ]}
        />

        <SubTitle>Cómo se calcula el consumo real (km/L)</SubTitle>
        <Callout type="formula" title="Fórmula de consumo real">
          <Formula>
{`Km recorridos = Odómetro actual − Odómetro de la carga anterior
Consumo real  = Km recorridos ÷ Litros de la carga anterior

Ejemplo:
  Carga anterior: 35.200 km, 23 L
  Carga actual:   35.890 km
  Km recorridos = 35.890 − 35.200 = 690 km
  Consumo real  = 690 ÷ 23 = 30,0 km/L`}
          </Formula>
          El sistema calcula automáticamente el consumo real de la carga <em>anterior</em> usando
          el odómetro de la <em>carga actual</em> como referencia de cierre del tramo.
        </Callout>

        <SubTitle>Filtros disponibles</SubTitle>
        <P>La vista de movimientos permite filtrar por: período (mes), tipo (COMPRA/DESPACHO), consumidor, tipo de combustible y tarjeta.</P>
        <Callout type="tip" title="Acceso directo desde alertas">
          Al hacer clic en "Ver →" en el modal de alertas críticas del Dashboard, el sistema lleva
          directamente a Movimientos con ese movimiento específico resaltado y una barra de filtro activa.
          Puedes desactivar este filtro haciendo clic en "✕ Quitar filtro".
        </Callout>
      </>
    ),
  },
  {
    id: 'dashboard',
    label: 'Inicio',
    icon: LayoutDashboard,
    color: 'text-sky-600',
    content: () => (
      <>
        <P>
          La pantalla <strong>Inicio</strong> (accesible desde el primer ítem del menú lateral) es el panel
          principal del sistema. Muestra el resumen del mes seleccionado, alertas activas, el estado del
          stock por tipo de combustible y el resumen de operación GPS de la flota.
        </P>

        <SubTitle>KPIs del mes</SubTitle>
        <TableDoc
          headers={['Tarjeta', 'Qué mide', 'Cómo se calcula']}
          rows={[
            ['Gasto combustible', 'Monto total pagado en combustible del período', 'Σ(monto COMPRA del período) — solo compras en surtidores externos con tarjeta'],
            ['Litros comprados', 'Litros adquiridos externamente + litros despachados de reservas', 'Línea principal: Σ(litros COMPRA). Sublínea: Σ(litros DESPACHO) del período'],
            ['Consumidores activos', 'Unidades de flota en operación', 'Cuenta de consumidores con el flag «activo» habilitado'],
            ['Consumo crítico', 'Vehículos con rendimiento bajo el umbral crítico', 'Consumidores cuya desviación de km/L supera el umbral crítico configurado (por defecto 30%)'],
          ]}
        />

        <SubTitle>Resumen por tipo de combustible</SubTitle>
        <Callout type="formula" title="Cálculo del saldo por combustible">
          <Formula>
{`Total disponible = Litros inicio del período + Σ(Litros COMPRA del período)
Consumo         = Σ(Litros DESPACHO del período)
Saldo final     = Total disponible − Consumo

"Consumo por consumidor" = DESPACHO desglosado por destinatario`}
          </Formula>
          <strong>Importante:</strong> las compras directas de vehículos (COMPRA) suman al "Total disponible"
          pero, como el vehículo consume directamente sin pasar por reserva, no generan un DESPACHO
          de salida. Esto es correcto operativamente.
        </Callout>
        <Callout type="info" title="Descomposición del saldo final">
          Cuando hay reservas internas, el <strong>«Saldo final»</strong> se desglosa automáticamente
          en dos sub-líneas que suman exactamente ese total:
          <ul className="mt-1.5 space-y-0.5 list-none">
            <li>🛢 <strong>En reserva (tanques)</strong> — litros estimados actualmente en los tanques
              físicos de la empresa (entradas históricas menos despachos acumulados al momento actual).</li>
            <li>🚗 <strong>Ya en vehículos</strong> — diferencia entre el saldo total y el stock en
              reserva: combustible que ya fue distribuido a los vehículos (compras directas en surtidor
              externo, menos lo que esos vehículos hayan redistribuido como cisterna).</li>
          </ul>
          <strong>Las dos líneas siempre suman el saldo final.</strong> El desglose bajo «+ Compras» (separado)
          muestra cómo ingresó el combustible al sistema: «↳ A reserva interna» y «↳ Compra directa
          vehículos» (suma = total compras del período).
        </Callout>

        <SubTitle>Alertas críticas</SubTitle>
        <P>
          El panel de alertas muestra vehículos cuyo consumo real se ha desviado negativamente
          respecto a su índice de referencia. Solo aparecen en el panel los que superan el umbral
          crítico configurado (por defecto 30%).
        </P>
        <Callout type="formula" title="Fórmula de desviación de consumo">
          <Formula>
{`Desviación (%) = ((Consumo referencia − Consumo real) ÷ Consumo referencia) × 100

Si Desviación ≥ Umbral crítico (por defecto 30%) → CRÍTICO (rojo)
Si Desviación ≥ Umbral alerta  (por defecto 15%) → ALERTA   (naranja)
Si Desviación < Umbral alerta                    → NORMAL   (verde)`}
          </Formula>
        </Callout>

        <SubTitle>Filtro de período</SubTitle>
        <P>
          El selector de mes en el Dashboard filtra todos los KPIs, el resumen por combustible
          y las tarjetas de consumidores. Al seleccionar "Todo" se muestran los datos históricos completos.
          Las alertas de consumo se calculan sobre el último movimiento disponible (COMPRA o DESPACHO)
          del vehículo, independientemente del filtro de mes seleccionado.
        </P>
        <Callout type="tip" title="Ver consumo mes a mes por vehículo">
          Cada tarjeta de vehículo tiene el botón <strong>«Ver detalles por mes»</strong> que abre
          una tabla con el desglose histórico completo: cargas, litros, monto, odómetro y km/L separados
          por mes. Aparece cuando el vehículo tiene actividad en dos o más meses distintos.
        </Callout>

        <SubTitle>Resumen Flota GPS del mes</SubTitle>
        <P>
          Justo sobre la sección «Resumen por combustible» aparece automáticamente el panel
          <strong> Flota GPS</strong> cuando hay registros de rutas del mes seleccionado.
          Muestra 4 tarjetas de un vistazo:
        </P>
        <TableDoc
          headers={['Tarjeta', 'Qué mide', 'Fuente']}
          rows={[
            ['Km GPS', 'Total de kilómetros acumulados por los recorridos GPS guardados automáticamente al cierre del día', 'asignacion_ruta donde tipo_viaje = "recorrido_gps"'],
            ['Km Reg.', 'Km declarados manualmente en novedades y viajes extra del mes', 'asignacion_ruta donde tipo_viaje ≠ "recorrido_gps"'],
            ['Días con GPS', 'Número de días únicos en que hay al menos un registro GPS guardado', 'Fechas únicas de los recorridos GPS del período'],
            ['Última actualización', 'Fecha del registro más reciente entre GPS y novedades del período', 'Máximo de fecha en todos los registros del mes'],
          ]}
        />
        <Callout type="info">
          El panel solo aparece cuando al menos uno de los dos valores (Km GPS o Km Reg.) es mayor que cero.
          El mes mostrado se sincroniza con el selector de período del Dashboard: si filtras por "Abril 2026",
          el panel muestra los datos GPS de abril.
          El enlace <em>«Ver comparativo detallado →»</em> lleva directamente al tab GPS vs Mov. en Rutas.
        </Callout>
      </>
    ),
  },
  {
    id: 'consumidores',
    label: 'Consumidores',
    icon: Users,
    color: 'text-emerald-600',
    content: () => (
      <>
        <P>
          Un <strong>consumidor</strong> es cualquier entidad que recibe o almacena combustible:
          vehículos, equipos eléctricos (grupos electrógenos) y depósitos/reservas internas.
        </P>

        <SubTitle>Tipos de consumidor</SubTitle>
        <TableDoc
          headers={['Tipo', 'Ejemplos', 'Particularidades']}
          rows={[
            ['Vehículo', 'Camiones, autos, camionetas, motos', 'Tiene odómetro, capacidad de tanque, índice km/L y conductor asignado. Genera alertas de consumo. Puede marcarse "sin odómetro" para autorizos/directivos.'],
            ['Equipo / Generador', 'Plantas eléctricas, grupos electrógenos', 'No requiere odómetro. Registra horas de uso (horómetro). Sin alertas de km/L.'],
            ['Tanque / Reserva / Cupet', 'Depósito principal, reserva gasolina, Cupet', 'Actúa como fuente en DESPACHO. Su stock = litros iniciales + COMPRA recibidas − DESPACHO salidos.'],
            ['ISO TANQUE', 'ISOTANQUE-001, Cisterna Norte', 'Primer punto de entrada al sistema. Solo los ISO TANQUEs aparecen como destino en un DEPÓSITO y como origen en el selector de DEPÓSITO. Tipo creado con nombre que contenga "ISO" en Catálogos.'],
          ]}
        />
        <Callout type="tip" title="Cómo crear un Iso Tanque">
          Ve a <strong>Catálogos → Tipos de consumidor</strong> y crea un tipo cuyo nombre contenga
          la palabra <strong>"ISO"</strong> (ej: "ISO TANQUE", "Iso Tanque"). Luego en <strong>Consumidores</strong>
          crea un consumidor de ese tipo. Solo esos consumidores aparecerán en el selector de origen
          y destino del formulario de DEPÓSITO.
        </Callout>

        <SubTitle>Vehículos sin control de odómetro</SubTitle>
        <P>
          Algunos vehículos (autorizos, carros de dirección) no requieren registrar kilómetros.
          Para ellos existe el flag <strong>"Sin control de odómetro"</strong> en la ficha del vehículo
          (sección "Datos del Vehículo" al editar el consumidor).
        </P>
        <TableDoc
          headers={['Con odómetro', 'Sin odómetro (flag activado)']}
          rows={[
            ['Pide km actual al registrar COMPRA/DESPACHO', 'No pide km ni nivel de tanque'],
            ['Calcula km recorridos y km/L automáticamente', 'No calcula km/L (sin datos de distancia)'],
            ['Genera alertas de consumo', 'No aparece en alertas de km/L'],
            ['Muestra historial de odómetro en la ficha', 'Muestra solo litros y fechas'],
          ]}
        />
        <Callout type="tip">
          Para activar: edita el consumidor → despliega "Datos del Vehículo" → activa el interruptor
          <strong> "Sin control de odómetro"</strong> al final de esa sección.
        </Callout>

        <SubTitle>Conductor y ayudante asignados al vehículo</SubTitle>
        <P>
          Cada vehículo puede tener un <strong>conductor principal</strong> y un <strong>ayudante</strong>
          asignados desde el catálogo de conductores. Estos campos aparecen en la ficha del consumidor
          cuando el tipo es "Vehículo".
        </P>
        <TableDoc
          headers={['Campo', 'Descripción']}
          rows={[
            ['Conductor principal', 'Conductor habitual asignado al vehículo. Aparece en reportes y asignaciones de ruta.'],
            ['Ayudante', 'Segundo operador del vehículo. No puede ser el mismo que el conductor principal.'],
          ]}
        />
        <Callout type="info">
          El conductor y ayudante también se pueden especificar en cada <strong>viaje del programa diario</strong>
          (módulo Rutas), independientemente de la asignación fija del consumidor.
        </Callout>

        <SubTitle>Cálculo de stock de una reserva</SubTitle>
        <Callout type="formula" title="Stock actual de una reserva">
          <Formula>
{`Stock = Litros iniciales (configurado)
       + Σ(Litros COMPRA con destino = esta reserva)
       − Σ(Litros DESPACHO con origen = esta reserva)`}
          </Formula>
        </Callout>

        <SubTitle>Indicadores de un consumidor (vehículo)</SubTitle>
        <TableDoc
          headers={['Indicador', 'Descripción', 'Fuente de datos']}
          rows={[
            ['Total abastecido', 'Litros recibidos en el período seleccionado.', 'COMPRA + DESPACHO recibidos'],
            ['Gasto del período', 'Costo financiero del período.', 'Solo COMPRA (DESPACHO es transferencia interna)'],
            ['Último abastecimiento', 'Fecha y litros de la carga más reciente.', 'COMPRA o DESPACHO, el más reciente'],
            ['Odo. inicio / Odo. final', 'Primera y última lectura de odómetro entre las dos cargas más recientes con datos.', 'COMPRA + DESPACHO con odómetro registrado'],
            ['Km recorridos', 'Odo. final − Odo. inicio entre las dos lecturas más recientes.', 'Diferencia de los dos odómetros más altos'],
            ['Consumo real (km/L)', 'Promedio de los consumos reales del período.', 'COMPRA + DESPACHO con consumo_real calculado'],
            ['Consumo fabricante (km/L)', 'Referencia configurada en el catálogo del vehículo.', 'Tabla consumidores → datos_vehiculo'],
            ['Días sin abastecimiento', 'Días desde la última carga (COMPRA o DESPACHO).', 'Fecha del movimiento más reciente'],
          ]}
        />

        <SubTitle>Desglose histórico por mes («Ver detalles por mes»)</SubTitle>
        <P>
          El botón <strong>«Ver detalles por mes»</strong> aparece en cada tarjeta de vehículo o equipo
          cuando tiene actividad registrada en dos o más meses distintos. Abre una tabla con el consumo
          completo desglosado mes a mes.
        </P>
        <TableDoc
          headers={['Columna', 'Qué muestra', 'Fuente']}
          rows={[
            ['Mes', 'Nombre del mes y año.', '—'],
            ['Cargas', 'Número total de movimientos recibidos ese mes.', 'COMPRA + DESPACHO'],
            ['Litros', 'Total de litros abastecidos ese mes.', 'COMPRA + DESPACHO'],
            ['Monto', 'Gasto financiero ese mes.', 'Solo COMPRA'],
            ['Odo. inicio', 'Odómetro máximo registrado antes del inicio del mes (punto de referencia de partida).', 'COMPRA + DESPACHO'],
            ['Odo. fin', 'Odómetro máximo registrado dentro del mes.', 'COMPRA + DESPACHO'],
            ['Km rec.', 'Odo. fin − Odo. inicio. Queda vacío (⚠) si el odómetro es inconsistente.', 'Calculado'],
            ['km/L', 'Promedio de consumos reales del mes. Muestra «pend.» si el tramo no está cerrado, o «⚠» en rojo si el valor supera 200 km/L (dato erróneo).', 'COMPRA + DESPACHO con consumo_real'],
            ['En tanque', 'Litros físicos en el tanque al cierre del mes. Columna visible solo cuando alguna carga tiene nivel_tanque registrado. Dato exacto (azul) o estimado con ≈ (gris).', 'nivel_tanque del movimiento'],
          ]}
        />
        <P>El pie del panel muestra totales acumulados y, cuando hay datos suficientes, una estimación del combustible actualmente en el tanque del vehículo.</P>
        <Callout type="tip" title="Columna «En tanque» — nivel físico registrado">
          La columna <strong>«En tanque»</strong> aparece automáticamente en la tabla cuando alguna
          carga del vehículo tiene el campo <code>nivel_tanque</code> registrado. Muestra cuántos
          litros había físicamente en el tanque al cierre de cada mes:
          <ul className="mt-1.5 space-y-0.5 list-none">
            <li><strong>Azul (dato exacto):</strong> el <code>nivel_tanque</code> de la primera carga
              del mes siguiente — es el nivel exacto al llegar a esa carga, es decir, el nivel real
              al cierre del mes anterior.</li>
            <li><strong>Gris con ≈ (estimado):</strong> solo para el mes más reciente, donde no hay
              carga posterior. Se calcula como <code>nivel_tanque + litros</code> de la última carga
              del mes (el nivel justo después de esa carga, antes del consumo posterior).</li>
            <li><strong>— (sin datos):</strong> ninguna carga del mes ni del mes siguiente tiene
              <code>nivel_tanque</code> registrado.</li>
          </ul>
          A diferencia de las estimaciones por km/L, este dato es <strong>físicamente correcto</strong>
          y siempre respetará la capacidad del tanque del vehículo.
        </Callout>
        <Callout type="warning" title="km/L con ⚠ en rojo — valor atípico (dato erróneo)">
          Si la columna km/L muestra un <strong>⚠ número en rojo</strong>, significa que el promedio
          calculado supera los 200 km/L, lo cual es físicamente imposible para cualquier vehículo
          terrestre. La causa más común es un movimiento de ese mes con:
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li><strong>Litros muy bajos o en 0</strong> al registrarse la carga (denomina el km/L).</li>
            <li><strong>Salto de odómetro incorrecto</strong> (e.g., odómetro ingresado en metros en lugar de kilómetros).</li>
          </ul>
          El valor anómalo se excluye del km/L promedio global. Para corregirlo, localizá el movimiento
          del mes marcado en el módulo de Movimientos y corregí el litros u odómetro mal ingresado.
        </Callout>
        <Callout type="info" title="km/L «pend.» — tramo aún no cerrado">
          El km/L de un mes se muestra como <strong>pend.</strong> (con ícono de reloj) cuando el mes tiene
          cargas con odómetro registrado, pero ninguna de ellas tiene <code>consumo_real</code> calculado.
          Esto ocurre porque el km/L se calcula <em>al momento de la carga siguiente</em>: el sistema toma
          la diferencia de odómetro entre la carga actual y la anterior. Si el vehículo aún no fue cargado
          nuevamente después de ese mes, el tramo queda abierto y el rendimiento no puede calcularse.
          Es el comportamiento normal para el mes más reciente. No requiere acción; se actualizará
          automáticamente con la próxima carga registrada.
        </Callout>
        <Callout type="warning" title="Meses con odómetro inconsistente">
          Si el <strong>Odo. fin</strong> de un mes es menor al <strong>Odo. inicio</strong> (es decir, el
          odómetro «retrocedió»), la fila se resalta en <strong>amarillo</strong> y la columna «Km rec.»
          muestra <strong>⚠ —</strong> en lugar de un número. Esto indica un error de carga: el valor ingresado
          en alguna carga de ese mes es inferior a lecturas anteriores del mismo vehículo. El sistema
          no inventa kilómetros negativos; simplemente deja el dato en blanco hasta que se corrija
          el registro erróneo en el módulo de Movimientos.
        </Callout>

        <Callout type="tip" title="«DESPACHO» como origen">
          Cuando un vehículo aparece como <em>origen</em> de un DESPACHO (ej: un camión cisterna que
          abastece a otros), sus litros despachados se muestran por separado del combustible que él
          mismo ha recibido.
        </Callout>
      </>
    ),
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    icon: WalletCards,
    color: 'text-amber-600',
    content: () => (
      <>
        <P>
          El módulo de Finanzas es el panel económico principal del sistema. Muestra el resumen
          financiero del mes seleccionado organizado en tres pestañas: <strong>Tarjetas</strong>,{' '}
          <strong>Bonificaciones</strong> y <strong>Precios</strong>. Solo está disponible para
          los roles <Tag color="amber">Económico</Tag> y <Tag color="sky">Super Admin</Tag>.
        </P>

        <SubTitle>Selector de período</SubTitle>
        <P>
          El selector de mes (esquina superior derecha) filtra todos los datos de la página al
          mes elegido. El botón <strong>Exportar</strong> genera un Excel con tres hojas:
          Compras, Bonificaciones y Resumen del período.
        </P>

        <SubTitle>Indicadores principales (KPIs)</SubTitle>
        <TableDoc
          headers={['Indicador', 'Qué muestra']}
          rows={[
            ['Gasto compras', 'Suma de montos de todas las COMPRA del período (combustible adquirido en surtidores externos).'],
            ['Litros comprados', 'Total de litros registrados en COMPRA durante el período.'],
            ['Bonificaciones', 'Monto total de bonificaciones activas del período (excluye las canceladas).'],
            ['Pendiente cobro', 'Bonificaciones en estado Pendiente o Entregado que aún no han sido cobradas.'],
          ]}
        />
        <P>
          Debajo de los KPIs aparece el <strong>Balance financiero</strong>: muestra el gasto total
          en compras, lo cobrado en bonificaciones y el flujo neto de caja del período. Si hay
          bonificaciones por cobrar, se destaca el monto pendiente.
        </P>

        <SubTitle>Pestaña Tarjetas</SubTitle>
        <P>
          Muestra el resumen de compras agrupado por tarjeta y por tipo de combustible, con fila
          de totales. Más abajo aparece el detalle expandible de cada tarjeta con todos sus
          movimientos del período (se expande pulsando la flecha de cada tarjeta).
        </P>
        <TableDoc
          headers={['Campo tarjeta', 'Descripción']}
          rows={[
            ['Número / Alias', 'Identificador y nombre descriptivo de la tarjeta.'],
            ['Moneda', 'USD, CUP o MLC. Determina el formato del monto.'],
            ['Activa', 'Las tarjetas inactivas no pueden usarse en nuevos movimientos.'],
            ['Gasto del período', 'Suma de COMPRA vinculadas a esa tarjeta en el mes seleccionado.'],
          ]}
        />

        <SubTitle>Pestaña Bonificaciones</SubTitle>
        <P>
          Muestra 4 sub-indicadores (total, litros, cobrado, pendiente) y el listado completo de
          bonificaciones del período con su estado. El total en la parte inferior suma solo las
          bonificaciones activas (excluye canceladas). Para cambiar estados ve al módulo{' '}
          <strong>Bonificaciones</strong>.
        </P>

        <SubTitle>Pestaña Precios</SubTitle>
        <P>
          Muestra los precios vigentes por tipo de combustible y permite gestionar los precios de
          despacho por tipo de consumidor (los precios que se aplican automáticamente al registrar
          una bonificación). Los cambios en precios se aplican a nuevas bonificaciones, no a las
          ya registradas.
        </P>

        <Callout type="info" title="Nota para el rol Económico">
          El perfil <Tag color="amber">Económico</Tag> puede ver toda la información financiera
          pero no puede registrar ni editar movimientos directamente. Para registrar compras o
          ajustes, el operador debe hacerlo desde el módulo de Movimientos.
        </Callout>
      </>
    ),
  },
  {
    id: 'alertas',
    label: 'Alertas',
    icon: Bell,
    color: 'text-red-600',
    content: () => (
      <>
        <P>
          El módulo de Alertas monitorea continuamente el consumo de cada vehículo y muestra
          aquellos que se desvían de su rendimiento esperado.
        </P>

        <SubTitle>Lógica de detección de alertas</SubTitle>
        <Callout type="formula" title="Fórmula de desviación y clasificación">
          <Formula>
{`Consumo referencia = indice_consumo_real (si existe) ó indice_consumo_fabricante
Último consumo real = km/L de la carga más reciente con odómetro registrado

Desviación (%) = ((Consumo ref − Último consumo real) / Consumo ref) × 100

Clasificación:
  Desviación ≥ Umbral crítico  → 🔴 CRÍTICO
  Desviación ≥ Umbral alerta   → 🟡 ALERTA
  Desviación < Umbral alerta   → 🟢 NORMAL
  Sin datos suficientes        → ⬜ SIN DATOS`}
          </Formula>
          Los umbrales por defecto son <strong>15% para alerta</strong> y <strong>30% para crítico</strong>.
          Se pueden personalizar por vehículo en la pantalla de Alertas.
        </Callout>

        <SubTitle>¿Qué consumidores aparecen en Alertas?</SubTitle>
        <P>
          Solo los consumidores de tipo <em>vehículo</em> con al menos una carga que tenga
          odómetro y consumo real calculado. Los tanques, reservas y equipos eléctricos
          no generan alertas de km/L.
        </P>

        <SubTitle>Estado en la lista</SubTitle>
        <TableDoc
          headers={['Sección', 'Condición', 'Acción recomendada']}
          rows={[
            ['EN ALERTA', 'Desviación ≥ umbral de alerta (15% por defecto)', 'Revisar historial de cargas y odómetro. Verificar posibles fugas o uso indebido.'],
            ['NORMAL', 'Desviación < umbral de alerta', 'Sin acción requerida.'],
            ['SIN DATOS', 'No tiene cargas con odómetro o no tiene consumo de referencia configurado', 'Registrar el índice de consumo de referencia en Catálogos → Consumidores.'],
          ]}
        />

        <SubTitle>Gráfico de historial de consumo</SubTitle>
        <P>
          Al expandir un vehículo en la lista de alertas, se muestra el gráfico de consumo
          histórico (km/L por carga). Se necesitan al menos 2 cargas con odómetro para
          que aparezca el historial. La línea de referencia muestra el consumo esperado.
        </P>

        <SubTitle>Notificación por correo</SubTitle>
        <P>
          Los vehículos en estado crítico pueden generar un correo electrónico automático
          al responsable configurado. El botón de envío aparece en cada fila de vehículo
          crítico cuando hay un email de destino configurado en la alerta.
        </P>

        <SubTitle>Configuración de alertas</SubTitle>
        <P>
          Cada consumidor puede tener una configuración de alerta personalizada (umbrales,
          email de destino). Se accede desde el botón de configuración ⚙ en cada fila.
          Si no hay configuración propia, se usan los umbrales del catálogo del vehículo
          (datos_vehiculo) o los valores por defecto del sistema.
        </P>
      </>
    ),
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: BarChart3,
    color: 'text-indigo-600',
    content: () => (
      <>
        <P>
          El módulo de Reportes ofrece vistas analíticas del consumo de la flota y las bonificaciones,
          filtrables por rango de fechas (campo «Desde» / «Hasta»).
          Cuando no se establece ningún filtro se muestran todos los datos históricos disponibles.
        </P>

        <Callout type="info" title="Regla de datos en todos los reportes">
          Para <strong>volumen consumido</strong> (litros, cargas, odómetro, km/L) se incluyen
          tanto COMPRA como DESPACHO recibidos. Para <strong>valor financiero</strong> (monto, gasto)
          solo se incluyen COMPRA, ya que los DESPACHO son transferencias internas sin costo externo directo.
        </Callout>

        <SubTitle>Reporte de Consumidores</SubTitle>
        <P>
          Ranking de todos los consumidores que recibieron combustible en el período,
          ordenables por litros totales, monto o número de cargas.
        </P>
        <Callout type="formula" title="Cálculo por fila de consumidor">
          <Formula>
{`Litros totales = Σ(litros COMPRA) + Σ(litros DESPACHO recibidos) del período
Monto total    = Σ(monto COMPRA) del período  ← DESPACHO no genera costo directo

Barra de capacidad (si el consumidor tiene capacidad_tanque configurada):
  Porcentaje = MIN(100 %, litros totales / capacidad_tanque × 100)

Sin capacidad configurada → barra relativa al mayor consumidor del período.`}
          </Formula>
        </Callout>
        <Callout type="warning">
          El porcentaje en la barra <strong>no</strong> indica el nivel actual del tanque.
          Refleja el volumen acumulado en el período respecto a la capacidad nominal —
          puede superar el 100 % en períodos largos o para consumidores de tanque pequeño.
        </Callout>

        <SubTitle>Reporte de Consumo (km/L y rendimiento)</SubTitle>
        <P>
          Análisis de eficiencia por consumidor con odómetro, km recorridos y rendimiento km/L.
          Aparecen solo los consumidores con al menos un movimiento registrado en el período.
        </P>
        <TableDoc
          headers={['Columna', 'Cálculo', 'Fuente']}
          rows={[
            ['Litros', 'Total de litros abastecidos en el período', 'COMPRA + DESPACHO recibidos'],
            ['Monto', 'Gasto financiero del período', 'Solo COMPRA'],
            ['Cargas', 'Cantidad de movimientos del período', 'COMPRA + DESPACHO'],
            ['Ref (km/L)', 'Índice de consumo de referencia del vehículo', 'Catálogo consumidores'],
            ['Prom (km/L)', 'Promedio de todos los consumos_real con odómetro registrado', 'COMPRA + DESPACHO'],
            ['Último (km/L)', 'Consumo real del movimiento más reciente con odómetro', 'COMPRA + DESPACHO'],
            ['Estado', 'Normal / Alerta / Crítico según desviación respecto a la referencia', 'Calculado'],
          ]}
        />

        <SubTitle>Historial de movimientos por consumidor</SubTitle>
        <P>
          Desde el ícono de lista en cualquier fila del reporte se puede ver el historial
          completo de movimientos de ese consumidor, con filtros de fecha y tipo.
        </P>

        <SubTitle>Reporte de Bonificaciones</SubTitle>
        <P>
          La pestaña <strong>Bonificaciones</strong> muestra el listado de bonificaciones de combustible
          a trabajadores, exportable a Excel y PDF. El rol <Tag color="red">Cajero</Tag> solo ve esta pestaña.
          Para más detalles ve a la sección <strong>Bonificaciones</strong> de esta ayuda.
        </P>
      </>
    ),
  },
  {
    id: 'bonificaciones',
    label: 'Bonificaciones',
    icon: Droplets,
    color: 'text-rose-600',
    content: () => (
      <>
        <P>
          El módulo de <strong>Bonificación de Combustible</strong> permite registrar y controlar
          el beneficio laboral de combustible que reciben los trabajadores de la empresa.
          Cada bonificación pasa por tres etapas: se registra, se entrega físicamente y luego se cobra.
        </P>

        <Callout type="info" title="¿Para qué sirve este módulo?">
          En lugar de anotar las entregas de combustible a trabajadores en papel o en una hoja de cálculo,
          este módulo las registra en el sistema de forma trazable. Cada entrega descuenta del stock
          del tanque, genera un movimiento de despacho automático y queda vinculada al trabajador
          y al período correspondiente.
        </Callout>

        <SubTitle>Ciclo de vida de una bonificación</SubTitle>
        <TableDoc
          headers={['Estado', 'Qué significa', 'Qué acción lo genera']}
          rows={[
            [<Tag color="amber">Pendiente</Tag>, 'La bonificación fue registrada pero el trabajador aún no ha retirado el combustible. Los litros quedan reservados en el stock (nadie más puede usar esa cantidad).', 'Se crea al registrar una nueva bonificación.'],
            [<Tag color="sky">Entregado</Tag>, 'El trabajador pasó por caja y retiró el combustible físicamente. En ese momento se descuenta del tanque y se crea un movimiento de Despacho automático.', 'Botón "Retirar" — lo marca el cajero u operador al momento de la entrega.'],
            [<Tag color="emerald">Pagado-Finalizado</Tag>, 'El trabajador pagó el monto correspondiente. La operación queda cerrada.', 'Botón "Cobrado" — lo marca el cajero o el perfil económico.'],
            [<Tag color="red">Cancelado</Tag>, 'La bonificación fue cancelada. Los litros reservados quedan disponibles nuevamente.', 'Botón de anulación (×) — solo disponible en estado Pendiente o Entregado.'],
          ]}
        />

        <Callout type="tip" title="¿Cómo afecta al stock de combustible?">
          <ul className="space-y-1 mt-1">
            <li>📌 <strong>Al registrar</strong> (Pendiente): los litros se <em>reservan</em>. El stock disponible para otros despachos se reduce aunque el trabajador aún no haya retirado.</li>
            <li>📦 <strong>Al retirar</strong> (Retirado): el sistema crea automáticamente un <strong>Despacho</strong> en el módulo de Movimientos. Esto descuenta definitivamente los litros del tanque.</li>
            <li>❌ <strong>Al anular</strong>: los litros reservados se liberan y vuelven a estar disponibles.</li>
          </ul>
        </Callout>

        <SectionTitle id="bon-registro">Registrar una nueva bonificación</SectionTitle>
        <P>
          Pulsa el botón <strong>"+ Nueva bonificación"</strong> en la esquina superior derecha.
          Se abre un formulario con estos campos:
        </P>
        <TableDoc
          headers={['Campo', 'Obligatorio', 'Qué poner']}
          rows={[
            ['Fecha', 'Sí', 'Fecha en que se registra la bonificación (hoy por defecto).'],
            ['Trabajador', 'Sí', 'Selecciona el trabajador del listado de beneficiarios.'],
            ['Tanque de origen', 'Sí', 'El depósito de donde saldrá el combustible.'],
            ['Tipo de combustible', 'Sí', 'Se activa al elegir el tanque. Selecciona el tipo correspondiente.'],
            ['Litros', 'Sí', 'Cantidad de combustible a entregar.'],
            ['Referencia', 'No', 'Nota opcional (número de resolución, observación, etc.).'],
          ]}
        />
        <Callout type="info" title="Precio automático">
          El sistema calcula el monto automáticamente usando el precio de despacho configurado
          en <strong>Finanzas → Precios de despacho</strong> para ese tipo de combustible.
          Si no hay precio configurado, el formulario no permite guardar y muestra una advertencia.
          En ese caso contacta al administrador para que configure el precio.
        </Callout>
        <Callout type="warning" title="Control de stock">
          Si los litros solicitados superan el stock disponible del tanque (considerando otras
          bonificaciones pendientes), aparece un aviso en rojo de "Stock insuficiente".
          No se puede registrar la bonificación hasta reducir la cantidad.
        </Callout>

        <SectionTitle id="bon-flujo">Flujo diario típico</SectionTitle>
        <Callout type="tip" title="Ejemplo: un trabajador retira su bonificación">
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li>El operador o cajero abre <strong>Bonificaciones → Nueva bonificación</strong> y registra los litros para el trabajador. Estado: <Tag color="amber">Pendiente</Tag>.</li>
            <li>El trabajador se presenta en caja. El cajero lo busca en la pestaña <strong>Pendientes</strong> y pulsa <strong>"Retirar"</strong>. Estado: <Tag color="sky">Entregado</Tag>. El sistema crea el despacho automáticamente.</li>
            <li>El trabajador paga. El cajero o el perfil económico pulsa <strong>"Cobrado"</strong>. Estado: <Tag color="emerald">Pagado-Finalizado</Tag>. La operación queda cerrada.</li>
          </ol>
        </Callout>

        <SectionTitle id="bon-trabajadores">Gestión de trabajadores</SectionTitle>
        <P>
          El botón <strong>"Trabajadores"</strong> abre el catálogo de beneficiarios.
          Aquí se pueden agregar, editar y buscar los trabajadores que tienen derecho a la bonificación.
        </P>
        <TableDoc
          headers={['Campo', 'Descripción']}
          rows={[
            ['Nombre completo', 'Nombre y apellidos del trabajador.'],
            ['CI', 'Carnet de identidad. Sirve para identificar al trabajador y evitar duplicados.'],
            ['Área / Departamento', 'Área de trabajo del trabajador dentro de la empresa.'],
          ]}
        />
        <Callout type="tip" title="Importar trabajadores desde archivo JSON">
          Si tienes la lista de trabajadores en un archivo exportado del sistema de RRHH (formato JSON),
          puedes importarlos en masa usando el botón <strong>"Importar JSON"</strong> dentro del panel
          de Trabajadores. El sistema:
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>Muestra todos los trabajadores del archivo con casillas de selección.</li>
            <li>Pre-selecciona automáticamente los trabajadores activos.</li>
            <li>Detecta y deshabilita los que ya existen en el sistema (mismo CI).</li>
            <li>Permite seleccionar manualmente trabajadores en baja si se necesita importarlos igualmente.</li>
            <li>Los trabajadores con estado "Baja" en el campo Departamento no se asignan a ninguna área.</li>
          </ul>
        </Callout>

        <SectionTitle id="bon-historial">Historial y filtros</SectionTitle>
        <P>
          La pestaña <strong>Historial</strong> muestra todas las bonificaciones del mes seleccionado.
          Puedes cambiar el mes en el selector de la parte superior y buscar por nombre de trabajador
          en el campo de búsqueda.
        </P>
        <P>
          Las tarjetas de resumen del mes muestran de un vistazo:
        </P>
        <TableDoc
          headers={['Tarjeta', 'Qué muestra']}
          rows={[
            ['Bonificaciones', 'Cantidad total de bonificaciones registradas en el mes.'],
            ['Pendientes', 'Cuántas bonificaciones aún no han sido retiradas.'],
            ['Litros', 'Total de litros entregados (o reservados) en el mes.'],
            ['Monto total', 'Suma de los montos de todas las bonificaciones no anuladas.'],
          ]}
        />

        <SectionTitle id="bon-reporte">Reporte de bonificaciones</SectionTitle>
        <P>
          En el módulo <strong>Reportes → pestaña Bonificaciones</strong> puedes exportar el listado
          completo de bonificaciones filtrado por período en formato Excel (.xlsx) o PDF.
          El reporte incluye: fecha, nombre del trabajador, CI, área, combustible, litros,
          precio por litro, monto, moneda, estado y tanque de origen.
        </P>
        <Callout type="tip">
          El rol <Tag color="red">Cajero</Tag> solo ve la pestaña de Bonificaciones en Reportes.
          Los demás módulos de reportes no están disponibles para ese perfil.
        </Callout>

        <SectionTitle id="bon-eliminar">Eliminar un registro (Solo Super Admin)</SectionTitle>
        <P>
          Los usuarios con rol <Tag color="sky">Super Admin</Tag> pueden eliminar definitivamente
          cualquier bonificación usando el ícono de papelera que aparece en cada fila.
          El sistema pedirá confirmación antes de borrar. Esta acción <strong>no se puede deshacer</strong>.
        </P>
        <Callout type="warning">
          Si la bonificación ya fue marcada como Retirada, el movimiento de Despacho que se creó
          automáticamente <strong>no se elimina</strong> al borrar la bonificación.
          Deberás eliminarlo manualmente desde el módulo de Movimientos si es necesario.
        </Callout>
      </>
    ),
  },
  {
    id: 'rutas',
    label: 'Rutas',
    icon: Navigation,
    color: 'text-teal-600',
    content: () => (
      <>
        <P>
          El módulo de Rutas documenta el historial operativo de viajes de los vehículos.
          Es independiente del combustible: registra <em>quién fue, a dónde, cuándo y cuántos km</em>,
          sin importar si hubo o no una carga asociada.
        </P>

        <Callout type="info" title="Relación con Movimientos">
          Rutas y Movimientos son registros <strong>paralelos</strong>: Movimientos registra el combustible,
          Rutas registra la operación. Los reportes del grupo de WhatsApp se importan directamente
          desde el botón <strong>"Importar del chat"</strong> en el programa diario, sin procesamiento externo.
        </Callout>

        <SectionTitle id="rutas-flujo">Flujo completo paso a paso</SectionTitle>

        <SubTitle>Paso 1 — Definir el catálogo de rutas</SubTitle>
        <P>
          Antes de registrar viajes, crea las rutas habituales en la pestaña <strong>Catálogo de rutas</strong>.
          Una ruta es una plantilla reutilizable: define el trayecto y su distancia de referencia.
          Los viajes del día se crean a partir de esa plantilla.
        </P>
        <TableDoc
          headers={['Campo', 'Obligatorio', 'Para qué sirve']}
          rows={[
            ['Nombre', 'Sí', 'Identifica la ruta en los selectores (ej: "Polígono Norte").'],
            ['Punto inicio / fin', 'No', 'Referencia geográfica de partida y llegada.'],
            ['Distancia (km)', 'No', 'Referencia para comparar con los km reales del viaje.'],
            ['Frecuencia', 'No', 'Indica si es diaria, semanal, etc. Solo informativo.'],
            ['Vehículo / Conductor por defecto', 'No', 'Prellenado sugerido al crear el viaje del día.'],
            ['Activa', 'Sí', 'Las rutas inactivas no aparecen en el selector del programa diario.'],
          ]}
        />
        <Callout type="tip">
          No es necesario tener todas las rutas antes de empezar. Los viajes que no corresponden
          a una ruta del catálogo se registran como <strong>Viaje extra</strong> con descripción libre.
        </Callout>

        <SubTitle>Paso 2 — Registrar viajes en el programa diario</SubTitle>
        <P>
          En la pestaña <strong>Programa diario</strong>, navega al día que quieres registrar
          con las flechas de fecha. Verás dos secciones:
        </P>
        <TableDoc
          headers={['Sección', 'Qué muestra', 'Qué puedes hacer']}
          rows={[
            ['Rutas del catálogo', 'Todas las rutas activas con el estado del día (sin novedad / completada / cancelada / sustitución)', 'Clic en el botón de la ruta para registrar la novedad del día'],
            ['Viajes extra', 'Viajes que no corresponden a ninguna ruta del catálogo', 'Botón "+ Viaje extra" para registrar un trayecto libre'],
          ]}
        />
        <Callout type="tip" title="Herramientas del programa diario">
          Junto a las flechas de navegación de fecha encontrarás dos elementos adicionales:
          <ul className="mt-1.5 space-y-0.5 list-none">
            <li>📥 <strong>"Importar del chat"</strong> — importa viajes directamente desde el grupo de WhatsApp (ver Paso 6).</li>
            <li>📊 <strong>Barra resumen</strong> — muestra en tiempo real: completadas, canceladas, km totales, litros estimados y cumplimiento % del día.</li>
          </ul>
        </Callout>

        <SubTitle>Paso 3 — Completar una ruta del catálogo</SubTitle>
        <P>
          Al hacer clic sobre una ruta del catálogo en el programa diario, se abre el formulario
          de novedad. Rellena estos campos:
        </P>
        <TableDoc
          headers={['Campo', 'Descripción']}
          rows={[
            ['Estado', '"Completada" si el viaje se realizó normalmente. "Cancelada" si no se realizó. "Pendiente" si aún no ha salido.'],
            ['Vehículo', 'Puede ser el mismo de la ruta (normal) o uno diferente (sustitución automática).'],
            ['Conductor / Ayudante', 'Quién realizó el viaje. Opcional pero recomendado para trazabilidad.'],
            ['km reales', 'Kilómetros efectivamente recorridos. Permite comparar con la distancia de referencia de la ruta.'],
            ['Observaciones', 'Cualquier incidencia, retraso o nota relevante.'],
          ]}
        />
        <Callout type="tip" title="¿Cómo sé que una ruta quedó correctamente registrada?">
          El registro es correcto cuando la fila de la ruta en el programa diario muestra
          el badge <Tag color="emerald">Completada</Tag> y, si registraste km reales,
          el valor aparece junto al nombre del vehículo. Si el vehículo era diferente al
          asignado por defecto, el sistema lo marca automáticamente como sustitución.
        </Callout>

        <SubTitle>Paso 4 — Registrar un viaje extra</SubTitle>
        <P>
          Para viajes fuera del catálogo (entregas, comisiones, contingencias), usa el
          botón <strong>"+ Viaje extra"</strong>. Elige el tipo según la naturaleza del viaje:
        </P>
        <TableDoc
          headers={['Tipo', 'Cuándo usarlo']}
          rows={[
            [<Tag color="sky">Regular</Tag>, 'Ruta planificada del catálogo. Se selecciona de la lista de rutas activas.'],
            [<Tag color="violet">Carga de mercancías</Tag>, 'Comerciales que salen con mercancía. Describe libremente el destino.'],
            [<Tag color="amber">Mensajería</Tag>, 'Entrega de documentos u objetos puntuales.'],
            [<Tag color="orange">Viaje extra</Tag>, 'Cualquier salida imprevista, contingencia o comisión no planificada.'],
          ]}
        />

        <SubTitle>Paso 5 — Verificar el historial en Estadísticas</SubTitle>
        <P>
          La pestaña <strong>Estadísticas</strong> consolida el mes actual con los siguientes indicadores:
        </P>
        <TableDoc
          headers={['Indicador', 'Qué mide']}
          rows={[
            ['Completadas', 'Rutas del catálogo marcadas como completadas en el mes.'],
            ['Canceladas', 'Rutas del catálogo canceladas en el mes.'],
            ['Sustituciones', 'Viajes donde el vehículo que realizó la ruta difiere del asignado por defecto.'],
            ['Km totales', 'Suma de km reales registrados en rutas + viajes extra del mes.'],
            ['Litros estimados', 'Suma de litros_estimados en registros del mes (disponibles al importar del chat).'],
            ['Cumplimiento (%)', 'Completadas ÷ (Completadas + Canceladas) × 100.'],
          ]}
        />
        <Callout type="tip">
          Úsala al cierre del mes para verificar que todos los viajes del catálogo quedaron registrados
          y para obtener los KPIs operativos del período.
        </Callout>

        <SubTitle>Paso 6 — Importar viajes del chat de WhatsApp</SubTitle>
        <P>
          En vez de registrar cada viaje manualmente, los conductores que reportan en el grupo
          de WhatsApp pueden importarse directamente desde el programa diario.
        </P>
        <Callout type="info" title="Flujo de importación del chat">
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li>En el programa diario del día que quieras importar, pulsa <strong>"Importar del chat"</strong>.</li>
            <li>Pega el texto copiado del grupo de WhatsApp o sube el archivo <code>.txt</code> exportado desde la app.</li>
            <li>El sistema detecta automáticamente: chapa del vehículo, conductor, km totales, litros y rutas mencionadas.</li>
            <li>Revisa la tabla de previsualización: ajusta el vehículo, km o litros en cualquier fila si es necesario.</li>
            <li>Marca ✓ los conductores que quieres importar y pulsa <strong>"Importar seleccionados"</strong>.</li>
          </ol>
        </Callout>
        <TableDoc
          headers={['Elemento detectado', 'Cómo se extrae', 'Qué hacer si falla']}
          rows={[
            ['Chapa del vehículo', 'Busca patrones tipo "C-XXXX", "P-XXXX" o la chapa directamente en el mensaje.', 'Selecciona el vehículo manualmente en el desplegable de la fila.'],
            ['Km totales', 'Detecta frases como "total: 120 km", "recorridos 120", "120 kilómetros".', 'Ingresa el valor manualmente en el campo km de la fila.'],
            ['Litros', 'Detecta frases como "cargó 40 L", "40 litros", "40L".', 'Ingresa el valor manualmente en el campo litros de la fila.'],
            ['Rutas mencionadas', 'Compara el texto del mensaje con los nombres del catálogo de rutas (similitud de palabras).', 'Las rutas no reconocidas se crean como viajes extra con la descripción original.'],
          ]}
        />
        <Callout type="tip" title="Formato del archivo .txt de WhatsApp">
          Exporta el chat desde WhatsApp: <em>Menú del chat → Más → Exportar chat → Sin archivos multimedia</em>.
          El archivo contiene un mensaje por línea con el formato:<br />
          <code className="text-xs">DD/MM/AAAA, HH:MM a. m. - Nombre: mensaje del conductor</code><br />
          El importador filtra automáticamente los mensajes del día seleccionado.
        </Callout>
        <Callout type="warning" title="Los registros importados del chat son viajes reales">
          A diferencia de flujos de análisis anteriores, los datos importados del chat crean
          registros reales en el programa diario con estado <strong>"completada"</strong> y
          fuente <strong>"chat"</strong>. Son parte del historial oficial, igual que los registros manuales.
        </Callout>

        <Callout type="tip">
          Solo los vehículos aparecen en el selector de asignación de viajes.
          Los tanques, reservas y equipos/generadores quedan excluidos automáticamente.
        </Callout>

        <SubTitle>Paso 5b — Trazabilidad: ver el origen de cualquier dato</SubTitle>
        <P>
          En la pestaña <strong>GPS vs Mov.</strong>, haz clic en cualquier fila de la tabla
          para abrir el panel de trazabilidad de ese vehículo. El panel muestra exactamente
          qué registros fuente generaron cada columna:
        </P>
        <TableDoc
          headers={['Sección del panel', 'Qué muestra', 'Modifica cambiando…']}
          rows={[
            ['Recorridos GPS', 'Lista de asignaciones tipo "Recorrido GPS" del mes con fecha y km de cada una', 'El km_reales de la asignación en el programa diario o el auto-guardado nocturno del GPS'],
            ['Novedades / Viajes', 'Lista de novedades y viajes extra del mes con fecha, tipo y km declarados', 'El km_reales al editar la novedad en el programa diario'],
            ['Combustible', 'Lista de movimientos COMPRA y DESPACHO del mes con fecha, litros y odómetro', 'El registro en la pantalla Movimientos (litros, odómetro)'],
            ['Cálculo Km Odóm.', 'Paso a paso de la resta: odo. fin del mes − odo. previo al mes', 'El odómetro en el movimiento más antiguo o más reciente del período'],
          ]}
        />
        <Callout type="tip" title="Por qué una columna muestra «—»">
          Si una columna es un guión, el panel de trazabilidad explica exactamente qué falta:
          «Sin registros GPS en este período», «Sin novedades declaradas» o «Sin odómetro suficiente».
          Esto permite identificar rápidamente si el dato no fue registrado o si hay un problema de vinculación.
        </Callout>

        <SubTitle>Paso 7 — Km reales automáticos desde GPS</SubTitle>
        <P>
          Si el vehículo tiene un dispositivo GPS vinculado (ver <strong>Configuración → GPS</strong>),
          al abrir el formulario de novedad o viaje extra aparece un botón de satélite junto al campo <em>Km reales</em>.
        </P>
        <TableDoc
          headers={['Acción', 'Resultado']}
          rows={[
            ['Pulsar el botón 🛰 en "Km reales"', 'Consulta AsTrack y obtiene los km recorridos por ese vehículo en la fecha del registro. Rellena el campo automáticamente.'],
            ['Km = 0 o sin datos', 'Se muestra una advertencia; el campo queda editable para ingreso manual.'],
            ['Sin GPS vinculado', 'El botón no aparece. El flujo es idéntico al registro manual.'],
          ]}
        />

        <SubTitle>Paso 8 — Mapa GPS en vivo y trayectoria del día</SubTitle>
        <P>
          La pestaña <strong>Mapa</strong> del módulo de Rutas combina las rutas del catálogo
          con la telemetría GPS en tiempo real de los vehículos vinculados.
        </P>
        <TableDoc
          headers={['Elemento', 'Qué representa']}
          rows={[
            ['Punto verde', 'Vehículo en movimiento (velocidad > 2 km/h). Posición actualizada cada 30 s.'],
            ['Punto gris', 'Vehículo detenido o con motor apagado.'],
            ['Popup del vehículo', 'Muestra nombre, chapa, tipo, combustible, velocidad actual, km recorridos hoy y estado del motor.'],
            ['Km hoy (popup)', 'Kilómetros acumulados desde 00:00 hasta el momento. Se actualiza cada 5 minutos.'],
            ['Botón "Ver recorrido de hoy"', 'Dibuja en el mapa la trayectoria GPS del día como línea de colores (violeta/índigo).'],
            ['Botón "Ocultar recorrido"', 'Quita la trayectoria del mapa.'],
          ]}
        />
        <SubTitle>Filtros del mapa</SubTitle>
        <P>
          La barra de filtros del mapa tiene dos selectores independientes:
        </P>
        <TableDoc
          headers={['Selector', 'Qué hace']}
          rows={[
            ['Selector de ruta', 'Filtra qué ruta del catálogo se dibuja en el mapa (polilínea de paradas). Selecciona "Todas las rutas" para ver el catálogo completo.'],
            ['Selector de vehículo (chapa)', 'Filtra qué vehículo GPS se muestra. Al seleccionar uno, el mapa centra su posición y el botón «Ver recorrido de hoy» aplica solo a ese vehículo.'],
          ]}
        />
        <Callout type="info" title="Sobre la trayectoria">
          La línea muestra los puntos GPS reales registrados por Traccar a lo largo del día,
          conectados en orden cronológico con marcadores numerados en los waypoints.
          Si la línea parece recta o tiene pocos puntos, el dispositivo GPS está configurado
          con baja frecuencia de actualización — esto es normal y no indica un fallo.
        </Callout>

        <SubTitle>Paso 9 — Histórico GPS automático al final del día</SubTitle>
        <P>
          El sistema guarda automáticamente el recorrido diario de cada vehículo GPS a las <strong>23:55</strong> mediante
          una tarea programada (Edge Function <code>gps-daily-save</code>). El registro incluye km recorridos,
          odómetro y velocidad máxima del día.
        </P>
        <TableDoc
          headers={['Campo guardado', 'Fuente']}
          rows={[
            ['Km recorridos', 'Resumen de actividad Traccar (0:00 – 23:59)'],
            ['Odómetro', 'Lectura actual del totalizador del GPS'],
            ['Velocidad máxima', 'Vel. máxima registrada por Traccar en el día'],
            ['Tipo de viaje', '"Recorrido GPS" — aparece en la pestaña Estadísticas con etiqueta teal'],
          ]}
        />
        <Callout type="warning" title="Requisito para el auto-guardado">
          La Edge Function <code>gps-daily-save</code> debe estar desplegada y el cron
          programado (sección §18 de la migración). Si el cron no está activo, los recorridos
          se pueden guardar manualmente desde el Mapa abriendo el popup de cualquier vehículo.
        </Callout>

        <SubTitle>Paso 10 — Marcadores de mapa</SubTitle>
        <P>
          Los <strong>Marcadores</strong> son puntos de interés nombrados que colocas directamente sobre
          el mapa. Sirven como bloques de construcción para definir rutas con paradas múltiples.
          Se gestionan en la pestaña <strong>Rutas → Marcadores</strong>.
        </P>
        <TableDoc
          headers={['Acción', 'Cómo hacerlo']}
          rows={[
            ['Crear marcador', 'Pulsa "Añadir marcador", haz clic en el punto del mapa y asígnale nombre, descripción y color.'],
            ['Buscar ubicación', 'Usa el buscador del mapa (esquina superior izquierda) para navegar a cualquier dirección o lugar en Cuba.'],
            ['Editar / Eliminar', 'Botones de lápiz y papelera en la lista lateral, o directamente desde el popup del marcador en el mapa.'],
            ['Color', '7 colores disponibles para distinguir tipos de punto (almacén, destino, parada intermedia…).'],
          ]}
        />

        <SubTitle>Paso 11 — Rutas con paradas (waypoints)</SubTitle>
        <P>
          Una ruta puede definirse como una <strong>secuencia ordenada de marcadores</strong>.
          Al añadir 2 o más paradas a una ruta, el sistema calcula automáticamente la distancia
          total (fórmula Haversine) y en el mapa la ruta se dibuja pasando por todos los puntos en orden.
        </P>
        <TableDoc
          headers={['Paso', 'Detalle']}
          rows={[
            ['1. Crea los marcadores', 'Ve a Rutas → Marcadores y coloca en el mapa todos los puntos que forman la ruta (ej: Almacén Cerro, CD Polígono, La Timba).'],
            ['2. Abre el catálogo de rutas', 'Rutas → Catálogo de rutas → Nueva ruta (o edita una existente).'],
            ['3. Añade paradas', 'En la sección "Paradas" del formulario, pulsa "+ Añadir parada" y selecciona los marcadores en el orden correcto.'],
            ['4. Reordena si es necesario', 'Usa las flechas ↑↓ para cambiar el orden. El botón × elimina una parada.'],
            ['5. Guarda', 'Las coordenadas de inicio/fin y la distancia se rellenan solas. Pulsa "Crear ruta".'],
            ['6. Ver en el mapa', 'La ruta aparece en Rutas → Mapa como polilínea azul que pasa por todas las paradas. El popup muestra la secuencia completa.'],
          ]}
        />
        <Callout type="tip" title="Rutas sin marcadores">
          Las rutas tradicionales (solo coordenadas de inicio y fin) siguen funcionando exactamente igual.
          Los marcadores/paradas son opcionales y complementan, no reemplazan, el flujo anterior.
        </Callout>

        <SubTitle>Paso 12 — Tab GPS vs Movimientos (comparativo mensual)</SubTitle>
        <P>
          La pestaña <strong>GPS vs Mov.</strong> cruza tres fuentes de datos para cada vehículo
          en el mes seleccionado y permite detectar discrepancias entre lo que reporta el GPS,
          lo que declararon los conductores y lo que registra el sistema de combustible.
        </P>
        <TableDoc
          headers={['Columna', 'Qué mide', 'Fuente de datos']}
          rows={[
            ['Km GPS', 'Suma de km de todos los recorridos GPS guardados automáticamente en el mes', 'asignacion_ruta · tipo_viaje = "recorrido_gps"'],
            ['Km Odóm.', 'Diferencia entre el odómetro máximo del mes y el último odómetro registrado antes del mes', 'movimiento · campo odometro (COMPRA/DESPACHO)'],
            ['Km Reg.', 'Suma de km declarados manualmente en novedades y viajes extra', 'asignacion_ruta · tipo_viaje ≠ "recorrido_gps"'],
            ['Litros', 'Total de litros consumidos (DESPACHO interno + COMPRA en surtidor)', 'movimiento · tipos COMPRA y DESPACHO'],
            ['km/L GPS / Odóm. / Reg.', 'Rendimiento calculado con cada fuente de km', 'Km (fuente) ÷ Litros'],
            ['Días / Viajes', 'Días únicos con registro GPS · viajes declarados en novedades', 'Conteos de registros por fuente'],
          ]}
        />
        <Callout type="formula" title="Fórmula Km Odóm.">
          <Formula>
{`Km Odóm. = Odo. fin del mes − Odo. inicio del mes

  Odo. fin del mes    = MAX(odometro) en movimientos del período
  Odo. inicio del mes = MAX(odometro) en movimientos ANTERIORES al período
                        (si no hay dato previo → MIN del propio mes)

Si no hay lecturas de odómetro → columna muestra —`}
          </Formula>
        </Callout>
        <Callout type="warning" title="¿Por qué algunas celdas muestran —?">
          <ul className="space-y-1 mt-1">
            <li><strong>Km GPS = —</strong>: no se guardaron recorridos GPS para ese vehículo en el período (el auto-guardado nocturno no corrió o el dispositivo no estaba activo).</li>
            <li><strong>Km Odóm. = —</strong>: no hay registros de odómetro en los movimientos del mes ni del mes anterior. Registra el odómetro al cargar combustible.</li>
            <li><strong>Km Reg. = —</strong>: no se registraron novedades ni viajes extra con km reales para ese vehículo.</li>
            <li><strong>Litros = —</strong>: no hay movimientos de COMPRA ni DESPACHO para ese vehículo en el período.</li>
          </ul>
          Haz clic en la fila del vehículo para ver el panel de trazabilidad con la explicación exacta.
        </Callout>
        <P>
          El encabezado del tab muestra la <strong>última fecha de actualización</strong> del período,
          calculada como la fecha más reciente entre todos los registros GPS y de combustible del mes.
          Esto indica hasta qué día están actualizados los datos del comparativo.
        </P>
        <Callout type="info" title="Límite de datos históricos resuelto">
          El comparativo consulta <em>directamente</em> la tabla de asignaciones en Supabase filtrada por mes,
          sin el límite de 2000 registros del programa diario. Esto garantiza que meses antiguos muestren
          datos completos aunque haya muchos registros en el sistema.
        </Callout>
      </>
    ),
  },
  {
    id: 'conductores',
    label: 'Conductores',
    icon: User2,
    color: 'text-cyan-600',
    content: () => (
      <>
        <P>
          El catálogo de conductores almacena los datos de los operadores de vehículos.
          Un conductor puede actuar como <strong>conductor principal</strong> o como <strong>ayudante</strong>
          según el vehículo o el viaje registrado.
        </P>
        <TableDoc
          headers={['Campo', 'Descripción']}
          rows={[
            ['Nombre', 'Nombre completo del conductor / operador.'],
            ['Teléfono / Email', 'Datos de contacto para notificaciones y registro.'],
            ['Activo', 'Los conductores inactivos no aparecen en los selectores de vehículo ni de rutas.'],
          ]}
        />

        <SubTitle>Dónde se usa un conductor</SubTitle>
        <TableDoc
          headers={['Contexto', 'Rol disponible', 'Cómo asignarlo']}
          rows={[
            ['Ficha del consumidor (vehículo)', 'Conductor principal + Ayudante', 'Editar consumidor → selector "Conductor principal" y "Ayudante" en la sección de datos del vehículo.'],
            ['Programa diario (Rutas)', 'Conductor + Ayudante del viaje', 'Al registrar la novedad de una ruta o un viaje extra, se puede cambiar el conductor y ayudante para ese viaje puntual.'],
          ]}
        />

        <Callout type="info" title="Conductor del mes (Dashboard)">
          El Dashboard calcula el "conductor del mes": el conductor cuyo vehículo asignado registró
          más litros en el período (COMPRA + DESPACHO). Se basa en la asignación del consumidor,
          no en los viajes individuales.
        </Callout>
        <Callout type="tip">
          El <strong>ayudante</strong> no puede ser el mismo que el conductor principal en el mismo
          vehículo. El selector lo filtra automáticamente.
        </Callout>
      </>
    ),
  },
  {
    id: 'catalogos',
    label: 'Catálogos',
    icon: BookOpen,
    color: 'text-rose-600',
    content: () => (
      <>
        <P>
          Los catálogos son las tablas maestras del sistema. Definen los tipos de datos
          que se usan en el resto de módulos.
        </P>

        <SubTitle>Tipos de consumidor</SubTitle>
        <P>
          Define las categorías de consumidores. El nombre del tipo controla qué campos
          y comportamientos se activan automáticamente:
        </P>
        <TableDoc
          headers={['Nombre contiene…', 'Comportamiento activado']}
          rows={[
            ['"veh" (vehículo)', 'Muestra campos de odómetro, capacidad de tanque, km/L, conductor/ayudante, sin_odómetro. Genera alertas de consumo.'],
            ['"tanque" o "reserva"', 'Actúa como fuente en DESPACHO. Aparece en el selector de origen de DESPACHO.'],
            ['"iso" (ISO TANQUE)', 'Aparece exclusivamente en el selector de origen/destino del formulario de DEPÓSITO. Primer punto de entrada al sistema.'],
            ['"equipo", "planta" o "grupo"', 'Muestra campo de horómetro (horas de uso) en lugar de odómetro. Sin alertas de km/L.'],
          ]}
        />
        <Callout type="warning">
          El nombre del tipo es case-insensitive pero debe contener exactamente la palabra clave
          indicada. Por ejemplo "ISO TANQUE", "Iso Tanque" o "isotanque" son todos válidos.
          Un tipo llamado solo "Almacenamiento" no activará el comportamiento ISO.
        </Callout>

        <SubTitle>Tipos de combustible</SubTitle>
        <P>
          Lista los combustibles disponibles (Gasolina Regular, Gasolina Especial, Diésel, etc.).
          Cada consumidor tiene asociado su tipo de combustible por defecto.
        </P>

        <SubTitle>Precios de combustible</SubTitle>
        <P>
          Registro histórico de precios por litro. Cada precio tiene una fecha de vigencia.
          Al registrar una COMPRA, el sistema busca el precio vigente más reciente para
          esa fecha y ese tipo de combustible.
        </P>
        <Callout type="formula" title="Precio vigente en una fecha">
          <Formula>
{`Precio vigente = MAX(fecha_desde) de los precios donde:
  combustible_id = combustible seleccionado
  fecha_desde   ≤ fecha del movimiento`}
          </Formula>
        </Callout>

        <SubTitle>Consumidores (catálogo completo)</SubTitle>
        <P>
          Lista todos los consumidores con sus datos técnicos. Aquí se configuran los
          parámetros clave para el análisis:
        </P>
        <TableDoc
          headers={['Parámetro', 'Dónde se usa']}
          rows={[
            ['capacidad_tanque (L)', 'Barra de capacidad en Reporte Vehículos. Validación de exceso en nuevas cargas.'],
            ['indice_consumo_fabricante (km/L)', 'Referencia para calcular desviación de consumo en Alertas.'],
            ['indice_consumo_real (km/L)', 'Si está configurado, tiene prioridad sobre el fabricante como referencia.'],
            ['umbral_alerta_pct (%)', 'Porcentaje de desviación que activa el nivel "Alerta" (naranja).'],
            ['umbral_critico_pct (%)', 'Porcentaje de desviación que activa el nivel "Crítico" (rojo).'],
            ['litros_iniciales', 'Stock inicial para reservas/tanques (saldo de apertura).'],
          ]}
        />

        <SubTitle>Vehículos</SubTitle>
        <P>
          Catálogo técnico de los vehículos físicos (marca, modelo, año, chapa).
          Los vehículos del catálogo pueden vincularse a un consumidor para cruzar datos
          de historial de odómetro.
        </P>
      </>
    ),
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    icon: Settings,
    color: 'text-slate-600',
    content: () => (
      <>
        <P>
          La pantalla de Configuración permite ajustar parámetros operativos del sistema,
          gestionar la importación de datos históricos y vincular los dispositivos GPS.
        </P>

        <SectionTitle id="conf-precios">Gestión de precios</SectionTitle>
        <P>
          Puedes agregar, editar o eliminar precios vigentes por tipo de combustible.
          Los cambios de precio afectan el cálculo del monto en los nuevos movimientos
          que se registren desde esa fecha en adelante.
        </P>
        <Callout type="warning">
          Modificar un precio histórico puede alterar el monto calculado en movimientos
          ya registrados si el sistema lo recalcula. Se recomienda agregar un nuevo precio
          con fecha de vigencia en lugar de editar el existente.
        </Callout>

        <SectionTitle id="conf-importacion">Importación de datos</SectionTitle>
        <P>
          La guía de importación explica el formato de archivo CSV/Excel aceptado para
          cargar datos históricos de movimientos de forma masiva. Úsala cuando se migra
          al sistema desde registros en papel u hojas de cálculo.
        </P>

        <SectionTitle id="conf-alertas">Alertas globales</SectionTitle>
        <P>
          Umbrales por defecto aplicables a todos los consumidores que no tienen
          configuración propia de alerta.
        </P>

        <SectionTitle id="conf-gps">Vinculación GPS (AsTrack / Traccar)</SectionTitle>
        <P>
          La pestaña <strong>GPS — Vinculación</strong> conecta cada vehículo del catálogo
          con su dispositivo GPS registrado en AsTrack Cuba (plataforma Traccar).
          Una vez vinculados, el sistema puede leer el odómetro y los km recorridos
          directamente desde el GPS.
        </P>

        <SubTitle>Requisitos previos</SubTitle>
        <Callout type="warning" title="Antes de usar la vinculación GPS">
          <ol className="list-decimal ml-4 space-y-1 mt-1">
            <li>La <strong>Edge Function</strong> <code>gps-proxy</code> debe estar desplegada en Supabase.</li>
            <li>Los secrets <code>TRACCAR_EMAIL</code> y <code>TRACCAR_PASSWORD</code> deben estar configurados en el panel de Supabase → Functions → Secrets.</li>
            <li>La tabla <code>gps_session_cache</code> debe existir en la base de datos (incluida en la migración global).</li>
          </ol>
        </Callout>

        <SubTitle>Cómo vincular un vehículo con su GPS</SubTitle>
        <TableDoc
          headers={['Paso', 'Acción']}
          rows={[
            ['1', 'Abre Configuración → pestaña "GPS — Vinculación".'],
            ['2', 'Pulsa "Cargar dispositivos GPS". El panel se conectará a AsTrack y listará todos los dispositivos disponibles.'],
            ['3', 'Para cada vehículo, selecciona su dispositivo GPS en el desplegable de la derecha.'],
            ['4', 'El vínculo se guarda automáticamente al seleccionar.'],
          ]}
        />

        <SubTitle>Funciones que se activan tras vincular</SubTitle>
        <TableDoc
          headers={['Función', 'Dónde aparece', 'Qué hace']}
          rows={[
            ['Leer odómetro GPS', 'Movimientos → COMPRA / DESPACHO', 'Botón 🛰 junto al campo Odómetro. Rellena con el odómetro acumulado actual del GPS.'],
            ['Leer km del día GPS', 'Rutas → Novedad / Viaje extra', 'Botón 🛰 junto al campo "Km reales". Obtiene los km recorridos en la fecha del registro.'],
            ['Posición en vivo', 'Rutas → Mapa', 'Punto verde/gris actualizado cada 30 s con velocidad y estado del motor.'],
            ['Km recorridos hoy', 'Rutas → Mapa (popup)', 'Contador diario actualizado cada 5 minutos desde 00:00.'],
            ['Trayectoria del día', 'Rutas → Mapa (popup → "Ver recorrido")', 'Línea violeta/índigo sobre el mapa con los puntos GPS registrados desde 00:00 hasta ahora. Cada waypoint muestra un círculo numerado.'],
            ['Auto-guardado al cierre del día', 'Rutas → Estadísticas (tipo "Recorrido GPS")', 'La tarea programada guarda km, odómetro y vel. máx a las 23:55 sin intervención del usuario.'],
          ]}
        />

        <Callout type="info" title="Sobre la trayectoria en el mapa">
          La trayectoria en el mapa conecta los puntos GPS registrados por Traccar en orden cronológico con una línea violeta/índigo.
          Si aparece casi recta o con pocos segmentos, el dispositivo GPS está configurado con baja
          frecuencia de reporte en AsTrack (normal para dispositivos en modo económico).
          La precisión de la trayectoria depende enteramente de la configuración del dispositivo,
          no del sistema de combustible.
        </Callout>

        <Callout type="tip" title="Sin GPS vinculado">
          Los botones de lectura GPS solo aparecen cuando el consumidor tiene un dispositivo GPS
          asociado. Para vehículos sin GPS el flujo es exactamente igual que antes.
        </Callout>
      </>
    ),
  },
  {
    id: 'administracion',
    label: 'Administración',
    icon: Shield,
    color: 'text-violet-600',
    content: () => (
      <>
        <P>
          El panel de administración es exclusivo para usuarios con rol <Tag color="sky">Super Admin</Tag>.
          Permite gestionar usuarios, roles y ver el registro de auditoría del sistema.
        </P>

        <SubTitle>Gestión de usuarios y roles</SubTitle>
        <TableDoc
          headers={['Rol', 'Descripción']}
          rows={[
            ['superadmin', 'Acceso total. Puede gestionar usuarios, eliminar registros y ver auditoría.'],
            ['operador', 'Registra y edita movimientos, consumidores, conductores y alertas.'],
            ['auditor', 'Solo lectura. Ve movimientos, rutas y reportes sin poder modificar nada.'],
            ['economico', 'Accede a Finanzas y Reportes. Perfil orientado al análisis financiero.'],
          ]}
        />

        <SubTitle>Registro de auditoría</SubTitle>
        <P>
          El registro de auditoría captura automáticamente <strong>cada acción</strong> realizada
          en el sistema: creaciones, ediciones, eliminaciones y cambios de rol.
        </P>
        <TableDoc
          headers={['Campo', 'Descripción']}
          rows={[
            ['Acción', 'CREATE, UPDATE, DELETE o ROLE_CHANGE.'],
            ['Entidad', 'Tipo de registro afectado (Movimiento, Consumidor, Tarjeta, etc.).'],
            ['Etiqueta', 'Nombre o identificador del registro afectado.'],
            ['Usuario', 'Email y nombre del usuario que realizó la acción.'],
            ['Fecha/Hora', 'Timestamp exacto de la operación (UTC).'],
            ['Payload', 'Estado completo del registro en el momento de la operación (JSON).'],
            ['Cambios', 'Para UPDATE: los campos que fueron modificados y sus nuevos valores.'],
          ]}
        />
        <Callout type="tip" title="Trazabilidad completa">
          Para las eliminaciones, el sistema toma una copia del registro completo
          <em> antes de borrarlo</em> y la guarda en el payload del log.
          Esto permite reconstruir el estado de cualquier dato eliminado.
        </Callout>

        <Callout type="info" title="Retención y refresco">
          El registro de auditoría se refresca automáticamente cada 60 segundos en la
          pantalla de administración. Incluye filtros por acción, entidad y búsqueda de texto.
        </Callout>
      </>
    ),
  },
  {
    id: 'glosario',
    label: 'Glosario',
    icon: FileText,
    color: 'text-slate-600',
    content: () => (
      <>
        <P>Referencia rápida de los términos técnicos usados en el sistema.</P>
        <TableDoc
          headers={['Término', 'Definición']}
          rows={[
            ['COMPRA', 'Movimiento de entrada: el consumidor adquiere combustible en un surtidor externo con tarjeta corporativa.'],
            ['DESPACHO', 'Movimiento de transferencia interna: una reserva transfiere combustible a un consumidor.'],
            ['Consumidor', 'Cualquier entidad que recibe o almacena combustible: vehículo, equipo o reserva.'],
            ['Reserva / Tanque', 'Depósito interno de la empresa que actúa como fuente de combustible para DESPACHO.'],
            ['Tarjeta corporativa', 'Medio de pago utilizado para COMPRA en surtidores externos. Se asocia a cada movimiento.'],
            ['Odómetro (km)', 'Lectura del cuentakilómetros del vehículo al momento de la carga.'],
            ['Consumo real (km/L)', 'Km recorridos entre dos cargas consecutivas dividido entre los litros de la carga anterior.'],
            ['Índice de consumo fabricante', 'Rendimiento km/L indicado por el fabricante del vehículo. Usado como referencia base.'],
            ['Índice de consumo real', 'Rendimiento km/L observado en condiciones reales de operación. Tiene prioridad sobre el fabricante.'],
            ['Desviación (%)', '((Consumo referencia − Consumo real) / Consumo referencia) × 100. Mide cuánto peor rinde el vehículo.'],
            ['Umbral de alerta', 'Porcentaje de desviación a partir del cual el sistema activa una alerta naranja.'],
            ['Umbral crítico', 'Porcentaje de desviación a partir del cual el sistema activa una alerta roja.'],
            ['Saldo final', 'Litros disponibles estimados en reservas: COMPRA totales − DESPACHO totales del período.'],
            ['Litros iniciales', 'Stock de apertura configurado para una reserva (combustible ya existente antes del primer registro).'],
            ['Período', 'Intervalo de tiempo seleccionado para filtrar datos (mes específico o historial completo).'],
            ['km/L', 'Kilómetros por litro. Medida de eficiencia de combustible. Mayor es mejor.'],
            ['DEPÓSITO', 'Movimiento de entrada de combustible desde fuente externa hacia un Iso Tanque registrado. El origen se selecciona del catálogo de Iso Tanques o se escribe como referencia libre. No descuenta ningún origen interno.'],
            ['ISO TANQUE', 'Tipo de consumidor especial que representa el primer punto de almacenamiento físico de la empresa (cisterna estacionaria o móvil). Solo aparece en el formulario de DEPÓSITO. Se crea con un tipo cuyo nombre contenga "ISO".'],
            ['Nivel en tanque (nivel_tanque)', 'Litros físicos medidos en el depósito del consumidor ANTES de recibir el combustible. Campo opcional disponible en COMPRA, DESPACHO y DEPÓSITO. Permite verificar consistencia del stock real.'],
            ['Sin odómetro (sin_odometro)', 'Flag de un consumidor vehículo que desactiva el registro de km y nivel de tanque. Usado para autorizos y vehículos de dirección. Se activa en la ficha del consumidor → Datos del Vehículo.'],
            ['Autorizo / Directivo', 'Vehículo de uso ejecutivo o autorizado que no requiere control de odómetro. Se configura activando el flag "Sin control de odómetro" en el consumidor correspondiente.'],
            ['Conductor principal', 'Conductor habitual asignado a un vehículo en su ficha de consumidor. Se selecciona del catálogo de conductores.'],
            ['Ayudante', 'Segundo operador asignado a un vehículo o viaje. No puede coincidir con el conductor principal. Seleccionable en la ficha del consumidor y en cada viaje del programa diario.'],
            ['Ruta regular', 'Trayecto preestablecido en el catálogo de rutas, con distancia y puntos definidos.'],
            ['Viaje extra', 'Desplazamiento fuera de las rutas planificadas: imprevistos, contingencias o viajes especiales.'],
            ['Importar del chat (WhatsApp)', 'Función del programa diario de Rutas que analiza el texto exportado de un grupo de WhatsApp y crea automáticamente los registros de viaje del día a partir de los mensajes de los conductores.'],
            ['Litros estimados (rutas)', 'Campo litros_estimados en un registro de asignación de ruta. Se completa al importar del chat o se puede ingresar manualmente. Aparece en la barra resumen del día y en las estadísticas del mes.'],
            ['Fuente del registro (fuente)', 'Indica el origen de un registro de ruta: "manual" si fue registrado por el operador directamente, "chat" si fue importado desde WhatsApp. Visible en las estadísticas por vehículo.'],
            ['Audit log', 'Registro inmutable de cada acción realizada en el sistema con usuario, fecha y datos completos.'],
            ['Km GPS', 'Kilómetros registrados automáticamente por el sistema GPS al cierre del día (tipo "Recorrido GPS"). Se consultan en el tab GPS vs Mov. de Rutas.'],
            ['Km Odóm.', 'Kilómetros estimados a partir de la diferencia de odómetro: odo. fin del mes − odo. más reciente registrado antes del mes. Fuente: campo odometro en movimientos COMPRA/DESPACHO.'],
            ['Km Reg.', 'Kilómetros declarados manualmente en novedades y viajes extra (campo km_reales). Fuente: asignacion_ruta con tipo_viaje ≠ recorrido_gps.'],
            ['Recorrido GPS (tipo de viaje)', 'Tipo especial de asignación de ruta generado automáticamente por el auto-guardado nocturno del GPS. Aparece en Estadísticas con etiqueta teal y alimenta la columna Km GPS del comparativo.'],
            ['Trazabilidad', 'Capacidad de ver el origen exacto de un dato: qué registros fuente lo componen, sus fechas y cómo afectan a los totales. En el tab GPS vs Mov., haz clic en cualquier fila para ver el panel de trazabilidad del vehículo.'],
            ['Panel de trazabilidad', 'Modal que se abre al hacer clic en una fila del comparativo GPS vs Mov. Desglosa por secciones los registros GPS, novedades, movimientos de combustible y el cálculo paso a paso del km por odómetro.'],
            ['Última actualización (comparativo)', 'Fecha más reciente entre todos los registros GPS y de combustible del mes seleccionado. Se muestra en el encabezado del tab GPS vs Mov. como indicador de vigencia de los datos.'],
            ['Flota GPS (Dashboard)', 'Sección del panel Inicio que resume los km GPS, km registrados, días con actividad GPS y la última fecha de registro del mes. Se sincroniza con el selector de período del Dashboard.'],
          ]}
        />
      </>
    ),
  },
];

// ── Componente principal ──────────────────────────────────────────────────────

const PAGE_TO_SECTION = {
  Dashboard:     'dashboard',
  Movimientos:   'movimientos',
  Consumidores:  'consumidores',
  Finanzas:      'finanzas',
  Alertas:       'alertas',
  Reportes:      'reportes',
  Rutas:         'rutas',
  Conductores:   'conductores',
  Catalogos:     'catalogos',
  Configuracion: 'configuracion',
  AdminPanel:    'administracion',
  Guia:          'guia',
  Ventas:        'bonificaciones',
};

export default function Ayuda() {
  const [searchParams] = useSearchParams();
  const fromPage = searchParams.get('from');
  const initialSection = PAGE_TO_SECTION[fromPage] || 'introduccion';

  const [activeId, setActiveId] = useState(initialSection);
  const [query, setQuery] = useState('');
  const contentRef = useRef(null);

  useEffect(() => {
    const section = PAGE_TO_SECTION[searchParams.get('from')];
    if (section) setActiveId(section);
  }, [searchParams]);

  const activeSection = sections.find(s => s.id === activeId);

  const filtered = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.filter(s => {
      if (s.label.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [query]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
          <HelpCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Centro de ayuda</h1>
          <p className="text-xs text-slate-400">Documentación completa del sistema de control de combustible</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar sección…"
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="flex gap-4 items-start">
        {/* Sidebar */}
        <nav className="hidden md:flex flex-col gap-0.5 w-44 shrink-0 sticky top-4">
          {(query ? filtered : sections).map(s => {
            const Icon = s.icon;
            const active = s.id === activeId;
            return (
              <button
                key={s.id}
                onClick={() => { setActiveId(s.id); setQuery(''); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-left transition-all ${
                  active
                    ? 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? s.color : 'text-slate-400'}`} />
                {s.label}
                {active && <ChevronRight className="w-3 h-3 ml-auto text-sky-400" />}
              </button>
            );
          })}
        </nav>

        {/* Mobile: pills row */}
        <div className="md:hidden flex gap-1.5 flex-wrap">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeId === s.id
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3 h-3" />{s.label}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        {activeSection && (
          <div
            ref={contentRef}
            className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 p-5 shadow-sm"
          >
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100 dark:border-slate-700">
              <activeSection.icon className={`w-5 h-5 shrink-0 ${activeSection.color}`} />
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{activeSection.label}</h2>
            </div>

            {/* Rendered section */}
            <activeSection.content />
          </div>
        )}

        {/* Search results (no active section) */}
        {query && filtered.length > 0 && (
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-slate-400">{filtered.length} sección{filtered.length !== 1 ? 'es' : ''} encontrada{filtered.length !== 1 ? 's' : ''}</p>
            {filtered.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => { setActiveId(s.id); setQuery(''); }}
                  className="w-full flex items-center gap-3 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950 transition-colors text-left"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${s.color}`} />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-slate-300" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
