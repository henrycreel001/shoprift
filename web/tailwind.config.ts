import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'Menlo', 'monospace'],
      },
      colors: {
        void: '#0A0B0F',     // kept: primary button text (dark text on mint bg)
        page: '#F6F6F7',     // page background — matches Shopify admin
        surface: '#FFFFFF',  // card and input surfaces
        mint: {
          DEFAULT: '#00E5A0',
          hover: '#00CC8E',
          dark: '#007A52',   // mint-colored text on light backgrounds (a11y contrast)
        },
        portal: '#6B8AFF',
        ink: {
          DEFAULT: '#1A1A1A',
          '2': '#4A4F54',
          '3': '#6D7175',
          '4': '#8C9196',
          '5': '#C9CCCF',
        },
        wire: {
          DEFAULT: '#E1E3E5',
          subtle: '#F1F2F3',
          strong: '#C9CCCF',
        },
      },
      animation: {
        spin: 'spin 0.7s linear infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
