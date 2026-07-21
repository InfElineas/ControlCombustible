-- Función SECURITY DEFINER: obtiene o crea la fila de rol del usuario actual.
-- Bypasea RLS completamente — elimina la dependencia circular donde para
-- saber tu rol necesitas permiso para leer user_roles, y ese permiso
-- depende de conocer tu rol de antemano.
--
-- Seguridad: auth.uid() es inyectado por Supabase (no manipulable desde el cliente).
-- La función solo opera sobre la fila cuyo user_id = auth.uid().

CREATE OR REPLACE FUNCTION get_or_create_user_role(p_email text, p_full_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role    text;
  v_name    text;
BEGIN
  -- Requiere sesión autenticada
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Leer fila existente
  SELECT role, full_name INTO v_role, v_name
  FROM user_roles
  WHERE user_id = v_user_id;

  -- Crear con rol 'auditor' si no existe
  IF v_role IS NULL THEN
    INSERT INTO user_roles (user_id, email, full_name, role)
    VALUES (v_user_id, p_email, p_full_name, 'auditor')
    ON CONFLICT (user_id) DO NOTHING;

    -- Leer de nuevo (el ON CONFLICT puede haber dejado la fila existente)
    SELECT role, full_name INTO v_role, v_name
    FROM user_roles
    WHERE user_id = v_user_id;
  END IF;

  RETURN json_build_object(
    'role',      COALESCE(v_role, 'auditor'),
    'full_name', COALESCE(v_name, p_full_name)
  );
END;
$$;

-- Permitir ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_or_create_user_role(text, text) TO authenticated;
