import type { CampusClient, OrderRow, PayMethod } from './api';
import type { OrderMode } from './orders';

/**
 * Print Store: students upload a PDF, the price-print Edge Function counts its pages and prices it,
 * and the job becomes an order for the shop, which downloads the file through a short-lived link.
 */

export const PRINT_FILE_MAX_BYTES = 20 * 1024 * 1024;

/** Shops taking print orders now, with their per-page rates. */
export async function listPrintShops(client: CampusClient) {
  const { data, error } = await client
    .from('print_settings')
    .select('shop_id, bw_page_paise, color_page_paise, max_pages, shops (name, is_open, does_delivery, does_pickup)')
    .eq('active', true);
  if (error) throw error;
  return data;
}

export type PrintJobInput = {
  /** A fresh UUID: the file is stored as <student id>/<job id>.pdf. */
  jobId: string;
  studentId: string;
  shopId: string;
  fileName: string;
  pdf: ArrayBuffer;
  copies: number;
  color: boolean;
  doubleSided: boolean;
};

/** Uploads the PDF to the student's own folder, then records the job (unpriced). */
export async function uploadPrintJob(client: CampusClient, job: PrintJobInput) {
  if (job.pdf.byteLength > PRINT_FILE_MAX_BYTES) throw new Error('PDFs can be up to 20 MB.');
  const path = `${job.studentId}/${job.jobId}.pdf`;
  const { error: uploadError } = await client.storage
    .from('print-files')
    .upload(path, job.pdf, { contentType: 'application/pdf' });
  if (uploadError) throw uploadError;
  const { error } = await client.from('print_jobs').insert({
    id: job.jobId,
    shop_id: job.shopId,
    file_path: path,
    file_name: job.fileName.slice(0, 120),
    copies: job.copies,
    color: job.color,
    double_sided: job.doubleSided,
  });
  if (error) throw error;
}

/** Has the server count the pages and price the job. Throws with the reason a file can't be printed. */
export async function pricePrintJob(client: CampusClient, jobId: string): Promise<{ pages: number; pricePaise: number }> {
  const { data, error } = await client.functions.invoke<{ pages: number; pricePaise: number }>('price-print', {
    body: { jobId },
  });
  if (error) {
    // The function answers errors as {"error": "..."}; show that rather than a generic HTTP message.
    const context: unknown = 'context' in error ? error.context : null;
    const body = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(typeof body?.error === 'string' ? body.error : 'Could not check the file. Try again.');
  }
  if (!data) throw new Error('Could not check the file. Try again.');
  return data;
}

export type PrintOrderInput = {
  jobId: string;
  mode: OrderMode;
  payMethod: PayMethod;
  dropPointId?: string;
  roomNote?: string;
};

/** Turns a priced print job into an order. The database re-checks the job and the shop. */
export async function placePrintOrder(client: CampusClient, input: PrintOrderInput): Promise<OrderRow> {
  const { data, error } = await client.rpc('place_print_order', {
    p_job_id: input.jobId,
    p_mode: input.mode,
    p_pay_method: input.payMethod,
    p_drop_point_id: input.dropPointId,
    p_room_note: input.roomNote,
  });
  if (error) throw error;
  return data;
}

/** A 10-minute download link for the shop that a print job was ordered from. */
export async function printFileLink(client: CampusClient, filePath: string): Promise<string> {
  const { data, error } = await client.storage.from('print-files').createSignedUrl(filePath, 600);
  if (error) throw error;
  return data.signedUrl;
}
