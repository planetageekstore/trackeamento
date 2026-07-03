import { type NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Middleware: mantém a sessão do Supabase atualizada e protege rotas do painel.
 * Rotas públicas: /login, /auth/*, /api/track, /api/heatmap e /api/webhooks/* (ingestão).
 */
const PUBLIC_PATHS = ["/login", "/auth", "/api/track", "/api/heatmap", "/api/identify", "/api/webhooks", "/api/oauth", "/api/cron"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Resiliência: qualquer falha do Supabase (env ausente/indisponível) NÃO pode
  // derrubar o site inteiro — trata como "sem sessão" e deixa o roteamento seguir.
  let user = null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    try {
      const supabase = createServerClient(url, anon, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      });
      ({
        data: { user },
      } = await supabase.auth.getUser());
    } catch {
      user = null;
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|html|ico|txt|woff2?)$).*)",
  ],
};
