-- Agregar 'cajero' a los roles permitidos en user_roles
-- El CHECK constraint original solo incluía: superadmin | operador | auditor | economico

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE user_roles
  ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('superadmin', 'operador', 'auditor', 'economico', 'cajero'));
