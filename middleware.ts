import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAnonymousSupabaseUser } from "@/lib/supabase/auth";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

const publicPagePaths = new Set(["/login", "/auth/callback"]);

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  );
}

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL("/login", request.url);

  if (request.nextUrl.pathname !== "/") {
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
  }

  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api") || isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });
  const config = getSupabasePublicConfig();
  const supabase = createServerClient(config.url, config.publicKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isSignedIn = Boolean(user) && !isAnonymousSupabaseUser(user);

  if (publicPagePaths.has(pathname)) {
    if (pathname === "/login" && isSignedIn) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return response;
  }

  if (!isSignedIn) {
    return redirectToLogin(request);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
