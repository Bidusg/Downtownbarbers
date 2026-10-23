import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CUSTOMER_COOKIE, CUSTOMER_FLAG, sessionCookieOptions } from "@/lib/customer-session-shared";

/** Beskyttede områder krever innlogging. Rolle sjekkes i hvert områdes layout. */
const PROTECTED = ["/admin", "/kasse", "/ansatt"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED.some((p) => path.startsWith(p));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("login", "1");
    url.searchParams.set("ansatt", "1"); // admin/kasse/revisor → åpne ansatt-fanen
    return NextResponse.redirect(url);
  }

  // Kunde som åpner Min side-lenken (fra e-post/SMS) forblir innlogget på
  // enheten, så neste gang holder det å trykke «Min side».
  const m = /^\/min-side\/([0-9a-f-]{36})$/i.exec(path);
  if (m && request.cookies.get(CUSTOMER_COOKIE)?.value !== m[1]) {
    const o = sessionCookieOptions();
    response.cookies.set(CUSTOMER_COOKIE, m[1], o.token);
    response.cookies.set(CUSTOMER_FLAG, "1", o.flag);
  }

  // Test-adressen på Vercel (*.vercel.app) skal aldri i søkemotorene –
  // bare downtownbarbers.no. (Gjelder ikke det egne domenet.)
  const host = request.headers.get("host") ?? "";
  if (/\.vercel\.app$/i.test(host.split(":")[0])) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}
