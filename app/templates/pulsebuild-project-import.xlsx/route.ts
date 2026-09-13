import { NextResponse } from "next/server";

import { TEMPLATE_SHEETS } from "@/lib/import/template";
import { writeXlsxWorkbook } from "@/lib/import/xlsxIo";

export function GET() {
  const bytes = writeXlsxWorkbook(
    Object.entries(TEMPLATE_SHEETS).map(([name, rows]) => ({ name, rows })),
  );
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="pulsebuild-project-import.xlsx"',
    },
  });
}
