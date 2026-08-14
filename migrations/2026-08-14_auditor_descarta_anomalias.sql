-- El auditor pasa a poder descartar y restaurar anomalias.
--
-- Al crear la tabla se dejo fuera al auditor por considerar que descartar era
-- una accion de operacion. Es al reves: revisar los avisos, analizarlos y darles
-- termino es precisamente su trabajo, y sin este permiso quien audita podia ver
-- la lista pero no cerrarla.
--
-- Marcar un caso como revisado no altera ningun dato operativo: no toca
-- movimientos, bonificaciones ni stock. Solo declara que ese aviso concreto ya
-- se miro y es correcto, dejando constancia de quien lo hizo y cuando. El
-- auditor sigue sin poder escribir en el resto de tablas.

DROP POLICY IF EXISTS "anomalia_descartada_insert_ops" ON anomalia_descartada;
DROP POLICY IF EXISTS "anomalia_descartada_delete_ops" ON anomalia_descartada;

CREATE POLICY "anomalia_descartada_insert_ops" ON anomalia_descartada
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('superadmin', 'operador', 'economico', 'auditor'));

CREATE POLICY "anomalia_descartada_delete_ops" ON anomalia_descartada
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('superadmin', 'operador', 'economico', 'auditor'));
