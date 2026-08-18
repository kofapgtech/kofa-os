/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Kofa P/G forest green — the logo circle and the site's nav bar.
        brand: {
          50: '#F1F7F3',
          100: '#DCEBE2',
          200: '#B9D6C5',
          300: '#8CBBA0',
          400: '#589878',
          500: '#367A57',
          600: '#2E5C41',
          700: '#244A34',
          800: '#1B3826',
          900: '#13261A',
        },
        // Warm canvas, from the site background and the logo's circle.
        cream: {
          50: '#FDFBF7',
          100: '#FBF6EE',
          200: '#F4EDE1',
          300: '#E9DFCE',
          400: '#D8CBB4',
        },
        // Peach accent — the "See Our Framework" button.
        accent: {
          50: '#FEF7EC',
          100: '#FDEBD1',
          200: '#FADCB0',
          300: '#F3C583',
          400: '#E5A752',
          500: '#C9862F',
          700: '#8A5A18',
        },
        // Warm neutrals. Cool greys read grubby against cream, so text uses
        // these instead of Tailwind's slate.
        ink: {
          50: '#F7F5F1',
          100: '#EDEAE3',
          200: '#DDD8CE',
          300: '#B5AEA0',
          400: '#7C7669',
          500: '#6A6458',
          600: '#545045',
          700: '#3F3B33',
          800: '#2C2923',
          900: '#1C1A16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(28 26 22 / 0.04), 0 1px 3px 0 rgb(28 26 22 / 0.07)',
      },
    },
  },
  plugins: [],
}
