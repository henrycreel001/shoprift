import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const shop = request.nextUrl.searchParams.get('shop');

  // Serve landing page at root for non-Shopify visitors
  if (pathname === '/' && !shop) {
    const response = NextResponse.rewrite(new URL('/landing-page.html', request.url));
    response.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
    return response;
  }

  const response = NextResponse.next();
  const csp =
    shop && shop.endsWith('.myshopify.com')
      ? `frame-ancestors https://${shop} https://admin.shopify.com`
      : `frame-ancestors https://*.myshopify.com https://admin.shopify.com`;

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
