-- Actualizar estados de venta_trabajador a los nuevos valores
-- Nuevos: PENDIENTE | ENTREGADO | PAGADO_FINALIZADO | CANCELADO
-- Se mantienen los legacy (RETIRADO, PAGADO, ANULADO) para compatibilidad con datos existentes

ALTER TABLE venta_trabajador DROP CONSTRAINT IF EXISTS venta_trabajador_estado_check;

ALTER TABLE venta_trabajador
  ADD CONSTRAINT venta_trabajador_estado_check
  CHECK (estado IN (
    'PENDIENTE', 'ENTREGADO', 'PAGADO_FINALIZADO', 'CANCELADO',
    'RETIRADO', 'PAGADO', 'ANULADO'
  ));

-- Migrar datos existentes al nuevo esquema
UPDATE venta_trabajador SET estado = 'ENTREGADO'         WHERE estado = 'RETIRADO';
UPDATE venta_trabajador SET estado = 'PAGADO_FINALIZADO' WHERE estado = 'PAGADO';
UPDATE venta_trabajador SET estado = 'CANCELADO'         WHERE estado = 'ANULADO';

-- Una vez migrados los datos, dejar solo los nuevos valores
ALTER TABLE venta_trabajador DROP CONSTRAINT IF EXISTS venta_trabajador_estado_check;

ALTER TABLE venta_trabajador
  ADD CONSTRAINT venta_trabajador_estado_check
  CHECK (estado IN ('PENDIENTE', 'ENTREGADO', 'PAGADO_FINALIZADO', 'CANCELADO'));
