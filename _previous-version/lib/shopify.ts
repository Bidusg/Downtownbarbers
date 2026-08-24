/**
 * Shopify Storefront API client (server-only).
 *
 * Mock mode: no credentials -> returns placeholder products so /shop is
 * fully designed and testable before the client's Shopify store exists.
 * Real mode: fetches products via Storefront GraphQL; checkout is delegated
 * to Shopify via cartCreate -> checkoutUrl redirect (payment, inventory,
 * shipping and receipts all handled by Shopify — by design).
 */

import { config } from './config'

export interface ShopProduct {
  id: string
  handle: string
  title: string
  description: string
  price: { amount: string; currencyCode: string }
  imageUrl: string | null
  imageAlt: string | null
  available: boolean
  /** First variant id — needed for cart/checkout */
  variantId: string
}

// ---------------------------------------------------------------------------
// Mock catalogue — replaced automatically the moment real credentials exist.
// Realistic barbershop retail so design/layout decisions are made on real-ish
// content, not lorem ipsum.
// ---------------------------------------------------------------------------
const MOCK_PRODUCTS: ShopProduct[] = [
  { id: 'mock-1', handle: 'matte-clay', title: 'Matte Clay', description: 'Kraftig hold med matt finish. For strukturerte, naturlige frisyrer.', price: { amount: '249.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-1-v1' },
  { id: 'mock-2', handle: 'styling-pomade', title: 'Styling Pomade', description: 'Klassisk pomade med middels hold og lett glans.', price: { amount: '229.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-2-v1' },
  { id: 'mock-3', handle: 'sea-salt-spray', title: 'Sea Salt Spray', description: 'Volum og tekstur — strandfølelse uten stranda.', price: { amount: '199.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-3-v1' },
  { id: 'mock-4', handle: 'beard-oil', title: 'Skjeggolje', description: 'Pleiende olje som myker opp skjegget og roer huden under.', price: { amount: '219.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-4-v1' },
  { id: 'mock-5', handle: 'beard-balm', title: 'Skjeggbalm', description: 'Form og pleie i ett — for skjegg som skal sitte hele dagen.', price: { amount: '239.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-5-v1' },
  { id: 'mock-6', handle: 'daily-shampoo', title: 'Daily Shampoo', description: 'Mild nok for daglig bruk, kraftig nok etter en dag med produkt.', price: { amount: '189.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-6-v1' },
  { id: 'mock-7', handle: 'aftershave-tonic', title: 'Aftershave Tonic', description: 'Klassisk barbershop-avslutning. Kjølende og frisk.', price: { amount: '259.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: false, variantId: 'mock-7-v1' },
  { id: 'mock-8', handle: 'premium-comb', title: 'Premium Kam', description: 'Håndlaget kam i cellulose-acetat. Skånsom mot hår og hodebunn.', price: { amount: '149.00', currencyCode: 'NOK' }, imageUrl: null, imageAlt: null, available: true, variantId: 'mock-8-v1' },
]

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------
const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($first: Int!) {
    products(first: $first, sortKey: BEST_SELLING) {
      edges {
        node {
          id
          handle
          title
          description
          availableForSale
          featuredImage { url altText }
          priceRange { minVariantPrice { amount currencyCode } }
          variants(first: 1) { edges { node { id } } }
        }
      }
    }
  }
`

const CART_CREATE_MUTATION = /* GraphQL */ `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { checkoutUrl }
      userErrors { field message }
    }
  }
`

async function shopifyFetch<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(config.shopify.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': config.shopify.storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
    // Product data may be cached briefly; checkout must not be.
    next: { revalidate: 60 },
  })

  if (!res.ok) {
    throw new Error(`Shopify Storefront API error: ${res.status}`)
  }
  const json = await res.json()
  if (json.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${json.errors[0].message}`)
  }
  return json.data as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getProducts(limit = 24): Promise<{
  products: ShopProduct[]
  isMock: boolean
}> {
  if (!config.shopify.enabled) {
    return { products: MOCK_PRODUCTS, isMock: true }
  }

  type Resp = {
    products: {
      edges: Array<{
        node: {
          id: string
          handle: string
          title: string
          description: string
          availableForSale: boolean
          featuredImage: { url: string; altText: string | null } | null
          priceRange: {
            minVariantPrice: { amount: string; currencyCode: string }
          }
          variants: { edges: Array<{ node: { id: string } }> }
        }
      }>
    }
  }

  const data = await shopifyFetch<Resp>(PRODUCTS_QUERY, { first: limit })

  const products: ShopProduct[] = data.products.edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    price: node.priceRange.minVariantPrice,
    imageUrl: node.featuredImage?.url ?? null,
    imageAlt: node.featuredImage?.altText ?? null,
    available: node.availableForSale,
    variantId: node.variants.edges[0]?.node.id ?? '',
  }))

  return { products, isMock: false }
}

/**
 * Create a single-line cart and return Shopify's hosted checkout URL.
 * In mock mode, returns null — the UI shows an explanatory demo state instead.
 */
export async function createCheckoutUrl(
  variantId: string,
  quantity = 1
): Promise<string | null> {
  if (!config.shopify.enabled) return null

  type Resp = {
    cartCreate: {
      cart: { checkoutUrl: string } | null
      userErrors: Array<{ message: string }>
    }
  }

  const data = await shopifyFetch<Resp>(CART_CREATE_MUTATION, {
    lines: [{ merchandiseId: variantId, quantity }],
  })

  if (data.cartCreate.userErrors.length) {
    throw new Error(data.cartCreate.userErrors[0].message)
  }
  return data.cartCreate.cart?.checkoutUrl ?? null
}
