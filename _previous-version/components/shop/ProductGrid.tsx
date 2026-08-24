import type { ShopProduct } from '@/lib/shopify'
import ProductCard from './ProductCard'

export default function ProductGrid({ products }: { products: ShopProduct[] }) {
  if (products.length === 0) {
    return (
      <p className="text-muted font-sans text-sm">
        Butikken er tom akkurat nå. Nye produkter er på vei — kom tilbake snart.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {products.map(p => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  )
}
