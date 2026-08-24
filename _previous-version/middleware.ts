import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtectedAdmin = path.startsWith('/admin') && !path.startsWith('/admin/login')
  const isProtectedBarber = path.startsWith('/barber-portal') && !path.startsWith('/barber-portal/login')

  if (!user && isProtectedAdmin) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  if (!user && isProtectedBarber) {
    return NextResponse.redirect(new URL('/barber-portal/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/admin/:path*', '/barber-portal/:path*'],
}
