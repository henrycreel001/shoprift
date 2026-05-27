import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const shop = request.nextUrl.searchParams.get('shop');

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
