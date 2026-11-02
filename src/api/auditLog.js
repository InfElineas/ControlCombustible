import { supabase } from './supabaseClient';
import { authClient } from './authClient';

// Quién firma la entrada. El servidor (la pasarela) fija user_id/user_email/user_name
// a partir del token, así que lo que se envíe aquí no cuenta: es solo informativo.
function usuarioParaAuditoria() {
  const u = authClient.usuarioActual();
  return u ? { user_id: u.id, user_email: u.email, user_name: u.name ?? u.email } : null;
}

// Never throws — audit failures must never break the main app flow.
export async function logAudit({ action, entityType, entityId, entityLabel, payload, metadata }) {
  try {
    const user = usuarioParaAuditoria();
    await supabase.from('audit_log').insert({
      user_id:      user?.user_id    ?? null,
      user_email:   user?.user_email ?? null,
      user_name:    user?.user_name  ?? null,
      action,
      entity_type:  entityType,
      entity_id:    entityId != null ? String(entityId) : null,
      entity_label: entityLabel ?? null,
      payload:      payload    ?? null,
      metadata:     metadata   ?? null,
    });
  } catch (err) {
    console.warn('[audit]', err?.message ?? err);
  }
}
