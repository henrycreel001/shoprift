import { redirect } from 'next/navigation'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const { shop } = await searchParams
  const migrateHref = shop ? `/migrate?shop=${encodeURIComponent(shop)}` : '/migrate'
  redirect(migrateHref)
}
