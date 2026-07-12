import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#100F0D',
        'ink-soft': '#1C1A17',
        'ink-mid': '#2C2A25',
        cream: '#F3F0E7',
        'cream-dark': '#E8E4DA',
        forest: '#1B4032',
        'forest-mid': '#2D6650',
        'forest-light': '#3D8A69',
        muted: '#7A756E',
        stroke: '#D5D0C7',
        'stroke-dark': '#2A2820',
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
