import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const hasFlag = (flag) => argv.includes(flag);
const getArg = (name, fallback) => {
  const idx = argv.findIndex((a) => a === name);
  if (idx === -1 || idx === argv.length - 1) return fallback;
  return argv[idx + 1];
};

const SEED_DIR = path.resolve(process.cwd(), getArg('--dir', 'seed-data'));
const DRY_RUN = !hasFlag('--apply');

const loadDotEnv = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] == null) {
        process.env[key] = value;
      }
    }
  } catch {
    // Archivo .env no encontrado: ignorar.
  }
};

await loadDotEnv(path.resolve(process.cwd(), '.env.local'));
await loadDotEnv(path.resolve(process.cwd(), '.env'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('Missing env vars: SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required with --apply');
  process.exit(1);
}

const supabase = (!DRY_RUN && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

const readJson = async (filePath) => {
  const txt = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(txt);
  return Array.isArray(parsed) ? parsed : [parsed];
};

const exists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const toIsoDate = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const asNumberOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const safeText = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const mapByLegacyId = (rows) => {
  const m = new Map();
  rows.forEach((r) => {
    if (r?.id != null) m.set(String(r.id), r);
  });
  return m;
};

const upsertByNaturalKey = async (table, key, payload) => {
  if (DRY_RUN) return { id: `dry-${table}-${payload[key]}` };

  const { data: existing, error: findError } = await supabase
    .from(table)
    .select('id')
    .eq(key, payload[key])
    .maybeSingle();

  if (findError) throw findError;

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from(table)
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabase
    .from(table)
    .insert(payload)
    .select('id')
    .single();

  if (createError) throw createError;
  return created;
};

const upsertConsumidor = async (payload) => {
  const hasCodigo = !!payload.codigo_interno;
  if (DRY_RUN) return { id: `dry-consumidor-${payload.codigo_interno || payload.nombre}` };

  let query = supabase.from('consumidor').select('id');
  query = hasCodigo ? query.eq('codigo_interno', payload.codigo_interno) : query.eq('nombre', payload.nombre);

  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError) throw findError;

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from('consumidor')
      .update(payload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabase
    .from('consumidor')
    .insert(payload)
    .select('id')
    .single();
  if (createError) throw createError;
  return created;
};

const main = async () => {
  const manifestPath = path.join(SEED_DIR, 'manifest.json');
  if (!(await exists(manifestPath))) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  console.log(`Seed dir: ${SEED_DIR}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY (writes enabled)'}`);
  console.log(`Manifest loaded${manifest?.generated_at ? ` (${manifest.generated_at})` : ''}`);

  const file = (...parts) => path.join(SEED_DIR, ...parts);

  const tipoCombustibleSrc = await readJson(file('TipoCombustible', 'TipoCombustible.json'));
  const precioCombustibleSrc = await readJson(file('PrecioCombustible', 'PrecioCombustible.json'));
  const tipoConsumidorSrc = await readJson(file('TipoConsumidor', 'TipoConsumidor.json'));
  const vehiculoSrc = await readJson(file('Vehiculo', 'Vehiculo.json'));
  const tarjetaSrc = await readJson(file('Tarjeta', 'Tarjeta.json'));
  const consumidorSrc = await readJson(file('Consumidor', 'Consumidor.json'));
  const configAlertaSrc = await readJson(file('ConfigAlerta', 'ConfigAlerta.json'));

  const movDir = file('Movimiento');
  const movFiles = (await fs.readdir(movDir))
    .filter((n) => /^Movimiento\.part_\d+\.json$/i.test(n))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

  if (movFiles.length === 0) throw new Error(`No movement part files found in ${movDir}`);

  const movimientoSrc = [];
  for (const f of movFiles) {
    const part = await readJson(path.join(movDir, f));
    movimientoSrc.push(...part);
  }

  const tipoCombByLegacyId = mapByLegacyId(tipoCombustibleSrc);
  const tipoConsByLegacyId = mapByLegacyId(tipoConsumidorSrc);
  const vehiculoByLegacyId = mapByLegacyId(vehiculoSrc);
  const tarjetaByLegacyId = mapByLegacyId(tarjetaSrc);
  const consumidorByLegacyId = mapByLegacyId(consumidorSrc);

  const tipoCombDbByNombre = new Map();
  const tipoConsDbByNombre = new Map();
  const vehiculoDbByChapa = new Map();
  const tarjetaDbByNumero = new Map();
  const consumidorDbByKey = new Map();

  const counters = {
    tipo_combustible: 0,
    precio_combustible: 0,
    tipo_consumidor: 0,
    vehiculo: 0,
    tarjeta: 0,
    consumidor: 0,
    config_alerta: 0,
    movimiento: 0,
  };

  // 1) Catálogos base
  for (const src of tipoCombustibleSrc) {
    const payload = {
      nombre: safeText(src.nombre),
      activa: src.activa == null ? true : Boolean(src.activa),
    };
    if (!payload.nombre) continue;
    const row = await upsertByNaturalKey('tipo_combustible', 'nombre', payload);
    tipoCombDbByNombre.set(payload.nombre.toLowerCase(), row.id);
    counters.tipo_combustible++;
  }

  for (const src of tipoConsumidorSrc) {
    const payload = {
      nombre: safeText(src.nombre),
      icono: safeText(src.icono) || 'truck',
      activo: src.activo == null ? true : Boolean(src.activo),
    };
    if (!payload.nombre) continue;
    const row = await upsertByNaturalKey('tipo_consumidor', 'nombre', payload);
    tipoConsDbByNombre.set(payload.nombre.toLowerCase(), row.id);
    counters.tipo_consumidor++;
  }

  // 2) Entidades dependientes
  for (const src of vehiculoSrc) {
    const legacyComb = tipoCombByLegacyId.get(String(src.combustible_id || ''));
    const payload = {
      chapa: safeText(src.chapa),
      marca: safeText(src.marca),
      modelo: safeText(src.modelo),
      ano: asNumberOrNull(src.ano),
      combustible_id: legacyComb ? (tipoCombDbByNombre.get(String(legacyComb.nombre).toLowerCase()) || null) : null,
      activo: src.activo == null ? true : Boolean(src.activo),
    };
    if (!payload.chapa) continue;
    const row = await upsertByNaturalKey('vehiculo', 'chapa', payload);
    vehiculoDbByChapa.set(payload.chapa.toLowerCase(), row.id);
    counters.vehiculo++;
  }

  for (const src of tarjetaSrc) {
    const payload = {
      id_tarjeta: safeText(src.id_tarjeta),
      alias: safeText(src.alias),
      moneda: safeText(src.moneda) || 'USD',
      saldo_inicial: asNumberOrNull(src.saldo_inicial) ?? 0,
      umbral_alerta: asNumberOrNull(src.umbral_alerta),
      activa: src.activa == null ? true : Boolean(src.activa),
    };
    if (!payload.id_tarjeta) continue;
    const row = await upsertByNaturalKey('tarjeta', 'id_tarjeta', payload);
    tarjetaDbByNumero.set(payload.id_tarjeta, row.id);
    counters.tarjeta++;
  }

  for (const src of consumidorSrc) {
    const legacyTipo = tipoConsByLegacyId.get(String(src.tipo_consumidor_id || ''));
    const legacyComb = tipoCombByLegacyId.get(String(src.combustible_id || ''));

    const tipoNombre = safeText(src.tipo_consumidor_nombre || legacyTipo?.nombre);
    const combNombre = safeText(src.combustible_nombre || legacyComb?.nombre);

    const payload = {
      tipo_consumidor_id: tipoNombre ? (tipoConsDbByNombre.get(tipoNombre.toLowerCase()) || null) : null,
      tipo_consumidor_nombre: tipoNombre,
      nombre: safeText(src.nombre),
      codigo_interno: safeText(src.codigo_interno),
      combustible_id: combNombre ? (tipoCombDbByNombre.get(combNombre.toLowerCase()) || null) : null,
      combustible_nombre: combNombre,
      activo: src.activo == null ? true : Boolean(src.activo),
      responsable: safeText(src.responsable),
      conductor: safeText(src.conductor),
      funcion: safeText(src.funcion),
      observaciones: safeText(src.observaciones),
      datos_vehiculo: src.datos_vehiculo ?? null,
      datos_tanque: src.datos_tanque ?? null,
      datos_equipo: src.datos_equipo ?? null,
    };

    if (!payload.nombre) continue;
    const row = await upsertConsumidor(payload);
    const key = payload.codigo_interno || payload.nombre;
    consumidorDbByKey.set(String(key).toLowerCase(), row.id);
    counters.consumidor++;
  }

  // 3) Precio combustible
  for (const src of precioCombustibleSrc) {
    const legacyComb = tipoCombByLegacyId.get(String(src.combustible_id || ''));
    const combNombre = safeText(src.combustible_nombre || legacyComb?.nombre);
    const combustibleId = combNombre ? tipoCombDbByNombre.get(combNombre.toLowerCase()) : null;
    if (!combustibleId) continue;

    const payload = {
      combustible_id: combustibleId,
      precio_por_litro: asNumberOrNull(src.precio_por_litro),
      fecha_desde: toIsoDate(src.fecha_desde),
      fecha_hasta: toIsoDate(src.fecha_hasta),
    };
    if (!payload.precio_por_litro || !payload.fecha_desde) continue;

    if (!DRY_RUN) {
      const { error } = await supabase.from('precio_combustible').insert(payload);
      if (error) throw error;
    }
    counters.precio_combustible++;
  }

  // 4) Config alertas
  for (const src of configAlertaSrc) {
    const legacyCons = consumidorByLegacyId.get(String(src.consumidor_id || ''));
    const consumerKey = safeText(legacyCons?.codigo_interno || legacyCons?.nombre);
    const consumidorId = consumerKey ? consumidorDbByKey.get(consumerKey.toLowerCase()) : null;
    if (!consumidorId) continue;

    const payload = {
      consumidor_id: consumidorId,
      email_destino: safeText(src.email_destino),
      umbral_alerta_pct: asNumberOrNull(src.umbral_alerta_pct) ?? 15,
      umbral_critico_pct: asNumberOrNull(src.umbral_critico_pct) ?? 30,
      alerta_email: src.alerta_email == null ? false : Boolean(src.alerta_email),
    };

    if (!DRY_RUN) {
      const { error } = await supabase.from('config_alerta').insert(payload);
      if (error) throw error;
    }
    counters.config_alerta++;
  }

  // 5) Movimientos
  for (const src of movimientoSrc) {
    const legacyTar = tarjetaByLegacyId.get(String(src.tarjeta_id || ''));
    const legacyComb = tipoCombByLegacyId.get(String(src.combustible_id || ''));
    const legacyCons = consumidorByLegacyId.get(String(src.consumidor_id || ''));
    const legacyConsOrigen = consumidorByLegacyId.get(String(src.consumidor_origen_id || ''));

    const tarjetaNum = safeText(src.id_tarjeta || src.tarjeta_alias || legacyTar?.id_tarjeta);
    const combNombre = safeText(src.combustible_nombre || legacyComb?.nombre);
    const consKey = safeText(legacyCons?.codigo_interno || legacyCons?.nombre || src.consumidor_nombre);
    const consOrigenKey = safeText(legacyConsOrigen?.codigo_interno || legacyConsOrigen?.nombre || src.consumidor_origen_nombre);

    const payload = {
      fecha: toIsoDate(src.fecha),
      tipo: safeText(src.tipo),
      tarjeta_id: tarjetaNum ? (tarjetaDbByNumero.get(tarjetaNum) || null) : null,
      tarjeta_alias: safeText(src.tarjeta_alias || legacyTar?.alias || legacyTar?.id_tarjeta || tarjetaNum),
      combustible_id: combNombre ? (tipoCombDbByNombre.get(combNombre.toLowerCase()) || null) : null,
      combustible_nombre: combNombre,
      consumidor_id: consKey ? (consumidorDbByKey.get(consKey.toLowerCase()) || null) : null,
      consumidor_nombre: safeText(src.consumidor_nombre || legacyCons?.nombre),
      consumidor_origen_id: consOrigenKey ? (consumidorDbByKey.get(consOrigenKey.toLowerCase()) || null) : null,
      consumidor_origen_nombre: safeText(src.consumidor_origen_nombre || legacyConsOrigen?.nombre),
      litros: asNumberOrNull(src.litros),
      monto: asNumberOrNull(src.monto),
      precio: asNumberOrNull(src.precio),
      odometro: asNumberOrNull(src.odometro),
      km_recorridos: asNumberOrNull(src.km_recorridos),
      consumo_real: asNumberOrNull(src.consumo_real),
      referencia: safeText(src.referencia),
      vehiculo_chapa: safeText(src.vehiculo_chapa),
      vehiculo_alias: safeText(src.vehiculo_alias),
      vehiculo_origen_chapa: safeText(src.vehiculo_origen_chapa),
      vehiculo_origen_alias: safeText(src.vehiculo_origen_alias),
    };

    if (!payload.fecha || !payload.tipo) continue;

    if (!DRY_RUN) {
      const { error } = await supabase.from('movimiento').insert(payload);
      if (error) throw error;
    }
    counters.movimiento++;
  }

  console.log('Import summary:');
  Object.entries(counters).forEach(([k, v]) => console.log(`  - ${k}: ${v}`));
  console.log('Done.');
};

main().catch((err) => {
  console.error('Import failed:', err.message || err);
  process.exit(1);
});
