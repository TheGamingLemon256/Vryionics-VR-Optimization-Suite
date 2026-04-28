/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        glass: {
          bg: 'rgba(15, 15, 25, 0.85)',
          border: 'rgba(255, 255, 255, 0.08)',
          hover: 'rgba(255, 255, 255, 0.04)',
          active: 'rgba(255, 255, 255, 0.06)'
        },
        accent: {
          primary: 'var(--accent-primary)',
          secondary: 'var(--accent-secondary)',
          success: '#4ade80',
          warning: '#fbbf24',
          danger: '#f87171'
        },
        vr: {
          healthy: '#4ade80',
          warning: '#fbbf24',
          critical: '#f87171',
          scanning: '#60a5fa',
          fixed: '#a78bfa'
        }
      },
      backdropBlur: {
        glass: '20px'
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
      },
      borderRadius: {
        theme: 'var(--radius)'
      }
    }
  },
  plugins: []
}
