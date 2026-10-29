// Deletes print files once they are no longer needed: 24 hours after the order ends, or a day
// after upload when the job was never ordered. pg_cron calls this every hour. It only acts on what
// expired_print_files lists, so an outside call can at most make it clean up sooner.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { serviceKey, supabaseUrl } from '../_shared/keys.ts';

Deno.serve(async () => {
  const admin = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });

  const { data, error } = await admin.rpc('expired_print_files');
  if (error) {
    console.error('expired_print_files failed', error.message);
    return Response.json({ error: 'list failed' }, { status: 500 });
  }
  const expired = (data ?? []) as { job_id: string; file_path: string }[];
  if (expired.length === 0) return Response.json({ deleted: 0 });

  // Storage files must go through the Storage API; deleting rows in storage.objects would leave them.
  const { error: removeError } = await admin.storage.from('print-files').remove(expired.map((f) => f.file_path));
  if (removeError) {
    console.error('Removing print files failed', removeError.message);
    return Response.json({ error: 'remove failed' }, { status: 500 });
  }

  const { error: markError } = await admin.rpc('mark_print_files_deleted', { p_job_ids: expired.map((f) => f.job_id) });
  if (markError) console.error('mark_print_files_deleted failed', markError.message);
  return Response.json({ deleted: expired.length });
});
