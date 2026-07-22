-- Añade campo status a user_roles y actualiza el RPC para crear nuevos
-- usuarios en estado 'pending' y retornar el status en la respuesta.

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'disabled'));

-- Actualizar RPC: nuevos usuarios quedan en 'pending', retorna status
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
  v_status  text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, full_name, status INTO v_role, v_name, v_status
  FROM user_roles
  WHERE user_id = v_user_id;

  IF v_role IS NULL THEN
    INSERT INTO user_roles (user_id, email, full_name, role, status)
    VALUES (v_user_id, p_email, p_full_name, 'auditor', 'pending')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT role, full_name, status INTO v_role, v_name, v_status
    FROM user_roles
    WHERE user_id = v_user_id;
  END IF;

  RETURN json_build_object(
    'role',      COALESCE(v_role, 'auditor'),
    'full_name', COALESCE(v_name, p_full_name),
    'status',    COALESCE(v_status, 'pending')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_or_create_user_role(text, text) TO authenticated;
