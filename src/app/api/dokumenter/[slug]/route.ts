import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getUserRole } from "@/lib/auth";
import { COMPANY_DOCS } from "@/lib/company-docs";

export const dynamic = "force-dynamic";

/** Felles ansattdokumenter (PDF). Bare ansatte, kasse og ledelse. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const me = await getUserRole();
  if (!me) return NextResponse.redirect(new URL("/?login=1&ansatt=1", req.url));
  if (!["staff", "shop", "admin", "eier"].includes(me.role)) {
    return NextResponse.redirect(new URL("/ingen-tilgang", req.url));
  }
  const { slug } = await params;
  const doc = COMPANY_DOCS.find((d) => d.slug === slug);
  if (!doc) return new NextResponse("Fant ikke dokumentet.", { status: 404 });
  try {
    const bytes = await readFile(path.join(process.cwd(), "private", "dokumenter", doc.file));
    const name = `${doc.title} – Downtown Barbers.pdf`;
    const download = req.nextUrl.searchParams.has("last-ned");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.slug}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Dokumentet er ikke tilgjengelig.", { status: 404 });
  }
}
