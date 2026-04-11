/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        // Brand colors
        'gp-cyan': '#00d9ff',
        'gp-pink': '#ff006e',
        'gp-purple': '#8338ec',
        
        // Backgrounds
        'gp-bg': '#0a0f1c',
        'gp-bg-secondary': '#111827',
        'gp-bg-tertiary': '#1e293b',
        
        // Text
        'gp-text': '#f8fafc',
        'gp-text-secondary': '#94a3b8',
        'gp-text-muted': '#64748b',
        
        // UI
        'gp-border': '#334155',
        'gp-border-subtle': '#1e293b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Orbitron', 'Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 30px -5px rgba(0, 217, 255, 0.4)',
        'glow-pink': '0 0 30px -5px rgba(255, 0, 110, 0.4)',
        'glow-purple': '0 0 30px -5px rgba(131, 56, 236, 0.4)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 217, 255, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}