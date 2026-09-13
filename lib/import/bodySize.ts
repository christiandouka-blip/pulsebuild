import { MAX_IMPORT_FILE_BYTES } from "@/lib/import/fileGuard";

/**
 * Pilot import envelope.
 *
 * Application file maximum: 4 MB (MAX_IMPORT_FILE_BYTES).
 * Vercel Function request maximum: 4.5 MB. Next.js bodySizeLimit cannot
 * raise that platform ceiling.
 * 4 MB was chosen so a valid file plus multipart/form-data overhead stays
 * under the Vercel 4.5 MB request cap.
 */
export const IMPORT_MULTIPART_OVERHEAD_BYTES = 256 * 1024;
export const VERCEL_FUNCTION_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
export const IMPORT_SERVER_ACTION_BODY_SIZE_BYTES =
  MAX_IMPORT_FILE_BYTES + IMPORT_MULTIPART_OVERHEAD_BYTES;
export const IMPORT_SERVER_ACTION_BODY_SIZE_LIMIT = "4352kb";

export function importBodyLimitCoversApprovedUpload(): boolean {
  return (
    IMPORT_SERVER_ACTION_BODY_SIZE_BYTES >=
    MAX_IMPORT_FILE_BYTES + IMPORT_MULTIPART_OVERHEAD_BYTES
  );
}

export function importEnvelopeFitsVercelFunctionLimit(): boolean {
  return (
    MAX_IMPORT_FILE_BYTES + IMPORT_MULTIPART_OVERHEAD_BYTES <=
      VERCEL_FUNCTION_BODY_LIMIT_BYTES &&
    IMPORT_SERVER_ACTION_BODY_SIZE_BYTES <= VERCEL_FUNCTION_BODY_LIMIT_BYTES
  );
}
