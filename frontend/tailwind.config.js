/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Sora"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        navy: {
          950: '#080f1a',
          900: '#0d1829',
          800: '#132035',
          700: '#1a2d4a',
          600: '#1e3a5f',
          500: '#25497a',
        },
        azure: {
          600: '#1d4ed8',
          500: '#2563eb',
          400: '#3b82f6',
          300: '#93c5fd',
        },
        slate: {
          950: '#020617',
        }
      },
    },
  },
  plugins: [],
}
