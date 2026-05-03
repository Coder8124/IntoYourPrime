/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: ({ opacityValue }) =>
          opacityValue !== undefined
            ? `rgba(var(--accent-rgb), ${opacityValue})`
            : 'rgb(var(--accent-rgb))',
        'accent-2': ({ opacityValue }) =>
          opacityValue !== undefined
            ? `rgba(var(--accent-2-rgb), ${opacityValue})`
            : 'rgb(var(--accent-2-rgb))',
        'accent-3': ({ opacityValue }) =>
          opacityValue !== undefined
            ? `rgba(var(--accent-3-rgb), ${opacityValue})`
            : 'rgb(var(--accent-3-rgb))',
        brand: {
          bg: '#0a0a0f',
          surface: '#0f0f1a',
          card: '#13131f',
          border: '#1e1e2e',
          blue: '#3b82f6',
          'blue-dim': '#1d4ed8',
          green: '#22c55e',
          yellow: '#eab308',
          orange: '#f97316',
          red: '#ef4444',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-rep': 'pulseRep 0.35s cubic-bezier(0.4,0,0.6,1)',
        'grid-scroll': 'gridScroll 22s linear infinite',
        'glow-danger': 'glowDanger 0.6s ease-in-out infinite alternate',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'fade-in-delay': 'fadeIn 0.5s ease-out 0.2s forwards',
        'fade-in-delay-2': 'fadeIn 0.5s ease-out 0.4s forwards',
      },
      keyframes: {
        pulseRep: {
          '0%':   { transform: 'scale(1)',    color: '#ffffff' },
          '40%':  { transform: 'scale(1.18)', color: '#3b82f6' },
          '100%': { transform: 'scale(1)',    color: '#ffffff' },
        },
        gridScroll: {
          '0%':   { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(60px)' },
        },
        glowDanger: {
          '0%':   { boxShadow: '0 0 20px rgba(239,68,68,0.6), 0 0 50px rgba(239,68,68,0.2)' },
          '100%': { boxShadow: '0 0 40px rgba(239,68,68,0.9), 0 0 80px rgba(239,68,68,0.35)' },
        },
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
