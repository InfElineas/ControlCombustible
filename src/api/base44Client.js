import { supabase } from './supabaseClient';
import { logAudit } from './auditLog';

const FIELD_MAP = {
  created_date: 'created_date',
  fecha: 'fecha',
};

// Human-readable label extractor per table
const ENTITY_LABEL = {
  tarjeta:            d => d?.alias || d?.id_tarjeta,
  movimiento:         d => [d?.tipo, d?.consumidor_nombre || d?.vehiculo_chapa].filter(Boolean).join(' '),
  consumidor:         d => d?.nombre,
  tipo_consumidor:    d => d?.nombre,
  tipo_combustible:   d => d?.nombre,
  precio_combustible:     d => [d?.combustible_nombre, d?.fecha_vigencia].filter(Boolean).join(' · '),
  precio_despacho_tipo:   d => [d?.tipo_consumidor_id, d?.fecha_desde].filter(Boolean).join(' · '),
  concepto_precio:        d => d?.nombre,
  conductor:          d => d?.nombre,
  vehiculo:           d => d?.nombre || d?.chapa,
  config_alerta:      d => d?.nombre,
};

function createEntity(tableName, entityName) {
  const getLabel = ENTITY_LABEL[tableName] ?? (d => d?.id);

  return {
    async list(sort, limit) {
      let query = supabase.from(tableName).select('*');
      if (sort) {
        const desc = sort.startsWith('-');
        const raw  = desc ? sort.slice(1) : sort;
        const col  = FIELD_MAP[raw] ?? raw;
        query = query.order(col, { ascending: !desc });
      }
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },

    async create(data) {
      const { data: result, error } = await supabase
        .from(tableName)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      logAudit({ action: 'CREATE', entityType: entityName, entityId: result?.id, entityLabel: getLabel(result), payload: result });
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase
        .from(tableName)
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      logAudit({ action: 'UPDATE', entityType: entityName, entityId: id, entityLabel: getLabel(result), payload: result, metadata: { changes: data } });
      return result;
    },

    async delete(id) {
      // Snapshot before delete so the audit entry contains what was removed
      let snapshot = null;
      try {
        const { data } = await supabase.from(tableName).select('*').eq('id', id).single();
        snapshot = data;
      } catch {}
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      logAudit({ action: 'DELETE', entityType: entityName, entityId: id, entityLabel: snapshot ? getLabel(snapshot) : null, payload: snapshot });
    },
  };
}

export const base44 = {
  entities: {
    Tarjeta:           createEntity('tarjeta',            'Tarjeta'),
    Movimiento:        createEntity('movimiento',          'Movimiento'),
    Consumidor:        createEntity('consumidor',          'Consumidor'),
    TipoConsumidor:    createEntity('tipo_consumidor',     'TipoConsumidor'),
    TipoCombustible:   createEntity('tipo_combustible',    'TipoCombustible'),
    PrecioCombustible: createEntity('precio_combustible',  'PrecioCombustible'),
    Conductor:         createEntity('conductor',           'Conductor'),
    Vehiculo:          createEntity('vehiculo',            'Vehiculo'),
    ConfigAlerta:      createEntity('config_alerta',       'ConfigAlerta'),
    Marcador:               createEntity('marcador',                  'Marcador'),
    RutaMarcador:           createEntity('ruta_marcador',             'RutaMarcador'),
    Ruta:                   createEntity('ruta',                     'Ruta'),
    AsignacionRuta:         createEntity('asignacion_ruta',          'AsignacionRuta'),
    ReporteChatTransporte:  createEntity('reporte_chat_transporte',  'ReporteChatTransporte'),
    PrecioDespachoTipo:     createEntity('precio_despacho_tipo',     'PrecioDespachoTipo'),
    ConceptoPrecio:         createEntity('concepto_precio',          'ConceptoPrecio'),
    Beneficiario:           createEntity('beneficiario',             'Beneficiario'),
    VentaTrabajador:        createEntity('venta_trabajador',         'VentaTrabajador'),
  },

  auth: {
    async me() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw Object.assign(new Error('Not authenticated'), { status: 401 });
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role, full_name')
        .eq('user_id', user.id)
        .single();
      return {
        id:        user.id,
        email:     user.email,
        full_name: roleRow?.full_name ?? user.user_metadata?.full_name ?? user.email,
        role:      roleRow?.role ?? 'auditor',
      };
    },

    async logout() {
      await supabase.auth.signOut();
      window.location.href = '/Login';
    },

    redirectToLogin() {
      window.location.href = '/Login';
    },
  },
};
