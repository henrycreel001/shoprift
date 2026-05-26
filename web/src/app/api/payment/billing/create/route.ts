/**
 * POST /api/payment/billing/create
 * Body: { shop, storeUrl, storeData, skipUrls?, amount, planName }
 * Creates an import job (status: pending_payment), stores extraction data,
 * then creates a Shopify AppPurchaseOneTime charge.
 * Returns { confirmationUrl, jobId }.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sessionStorage } from '@/lib/shopify';

const SHOPIFY_API_VERSION = '2026-04';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

async function getAccessToken(shop: string): Promise<string | null> {
  const session = await sessionStorage.loadSession(`offline_${shop}`);
  return session?.accessToken ?? null;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: {
    shop?: unknown;
    storeUrl?: unknown;
    storeData?: unknown;
    skipUrls?: unknown;
    amount?: unknown;
    planName?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { shop, storeUrl, storeData, skipUrls, amount, planName } = body;

  if (!shop || typeof shop !== 'string' || !shop.endsWith('.myshopify.com')) {
    return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
  }
  if (!storeUrl || typeof storeUrl !== 'string') {
    return NextResponse.json({ error: 'storeUrl required' }, { status: 400 });
  }
  if (!storeData || typeof storeData !== 'object') {
    return NextResponse.json({ error: 'storeData required' }, { status: 400 });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const accessToken = await getAccessToken(shop);
  if (!accessToken) {
    return NextResponse.json(
      { error: 'No active Shopify session — reinstall the app' },
      { status: 401 },
    );
  }

  const supabase = createServerSupabaseClient();

  const { data: jobRow, error: insertError } = await supabase
    .from('import_jobs')
    .insert({
      account_id: shop,
      store_url: storeUrl,
      status: 'pending_payment',
      store_data: storeData,
      skip_urls: Array.isArray(skipUrls) && skipUrls.length > 0 ? skipUrls : [],
    })
    .select('id')
    .single();

  if (insertError || !jobRow) {
    return NextResponse.json(
      { error: `Failed to create job: ${insertError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const jobId = jobRow.id;
  const appUrl = requireEnv('SHOPIFY_APP_URL');
  const returnUrl = `${appUrl}/api/payment/billing/callback?jobId=${jobId}`;
  const chargeLabel = typeof planName === 'string' ? planName : 'Shoprift Migration';
  const isTest = process.env.NODE_ENV !== 'production';

  const mutation = `
    mutation CreateCharge($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
      appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
        appPurchaseOneTime { id }
        confirmationUrl
        userErrors { field message }
      }
    }
  `;

  let gqlRes: Response;
  try {
    gqlRes = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          name: chargeLabel,
          price: { amount: String(amount), currencyCode: 'INR' },
          returnUrl,
          test: isTest,
        },
      }),
    });
  } catch (err) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'Shopify API unreachable' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Shopify API unreachable' }, { status: 502 });
  }

  if (!gqlRes.ok) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: `Shopify billing API error: ${gqlRes.status}` })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Shopify billing API error' }, { status: 502 });
  }

  const gqlData = await gqlRes.json() as {
    data?: {
      appPurchaseOneTimeCreate?: {
        appPurchaseOneTime?: { id: string };
        confirmationUrl?: string;
        userErrors?: Array<{ field: string; message: string }>;
      };
    };
  };

  const result = gqlData.data?.appPurchaseOneTimeCreate;
  if (!result) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'Empty billing response' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'Empty billing response from Shopify' }, { status: 500 });
  }

  if (result.userErrors?.length) {
    const errMsg = result.userErrors.map((e) => e.message).join('; ');
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: errMsg })
      .eq('id', jobId);
    return NextResponse.json({ error: errMsg }, { status: 400 });
  }

  const confirmationUrl = result.confirmationUrl;
  if (!confirmationUrl) {
    await supabase
      .from('import_jobs')
      .update({ status: 'failed', error: 'No confirmation URL from Shopify' })
      .eq('id', jobId);
    return NextResponse.json({ error: 'No confirmation URL from Shopify' }, { status: 500 });
  }

  return NextResponse.json({ confirmationUrl, jobId });
}
