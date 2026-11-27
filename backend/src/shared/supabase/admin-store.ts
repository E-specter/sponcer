import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminStore } from '../admin';
import { unwrap } from './unwrap';

interface Row {
  email: string;
  granted_by: string | null;
  granted_at: string;
}

export const createSupabaseAdminStore = (supabase: SupabaseClient): AdminStore => ({
  async list() {
    return unwrap(await supabase.from('admin_users').select('*').returns<Row[]>()).map((r) => ({
      email: r.email,
      grantedBy: r.granted_by,
      grantedAt: new Date(r.granted_at),
    }));
  },
  async add(a) {
    unwrap(
      await supabase
        .from('admin_users')
        .upsert(
          { email: a.email, granted_by: a.grantedBy, granted_at: a.grantedAt.toISOString() },
          { onConflict: 'email', ignoreDuplicates: true },
        ),
    );
  },
  async remove(email) {
    unwrap(await supabase.from('admin_users').delete().eq('email', email));
  },
});
