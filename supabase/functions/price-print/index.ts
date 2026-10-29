// Counts the pages of a student's uploaded PDF and prices their print job.
//
// The student app calls this with the student's session. Their own row-level security decides
// whether they can see the job; only then does the function read the private file with its
// service key and record the page count through set_print_pages, which works out the price.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

import { publishableKey, serviceKey, supabaseUrl } from '../_shared/keys.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply({ error: 'Sign in first' }, 401);
  const asStudent = createClient(supabaseUrl(), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asStudent.auth.getUser();
  if (!auth.user) return reply({ error: 'Sign in first' }, 401);

  const { jobId } = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof jobId !== 'string') return reply({ error: 'Which print job?' }, 400);

  // Row-level security shows a student only their own jobs.
  const { data: job } = await asStudent.from('print_jobs').select('id, file_path').eq('id', jobId).maybeSingle();
  if (!job) return reply({ error: 'Print job not found' }, 404);

  const admin = createClient(supabaseUrl(), serviceKey(), { auth: { persistSession: false } });
  const { data: file, error: downloadError } = await admin.storage.from('print-files').download(job.file_path);
  if (downloadError || !file) return reply({ error: 'The file did not upload. Try again.' }, 400);

  let pages: number;
  try {
    const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
    pages = pdf.getPageCount();
  } catch {
    return reply({ error: 'That file is not a PDF the shop can print. Save it as a PDF and try again.' }, 400);
  }

  const { data: priced, error: priceError } = await admin.rpc('set_print_pages', { p_job_id: job.id, p_pages: pages });
  if (priceError) return reply({ error: priceError.message }, 400);
  const result = priced as { pages: number; price_paise: number };
  return reply({ pages: result.pages, pricePaise: result.price_paise });
});
