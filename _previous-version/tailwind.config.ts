import type { Config } from 'tailwindcss'

// Semantic tokens backed by OKLCH CSS variables in globals.css.
// Light and dark values live there; these names never change per theme.
const token = (name: string) => `oklch(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        fg: token('fg'),
        'fg-soft': token('fg-soft'),
        muted: token('muted'),
        line: token('line'),
        'line-2': token('line-2'),
        accent: token('accent'),
        'accent-hover': token('accent-hover'),
        'accent-soft': token('accent-soft'),
        'accent-fg': token('accent-fg'),
        danger: token('danger'),
      },
      fontFamily: {
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
