/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        'gp-bg': '#0a0a0f',
        'gp-cyan': '#00f5d4',
        'gp-pink': '#ff3864',
        'gp-white': '#ffffff',
        'gp-muted': '#8892b0',
        'gp-card': '#12121a',
        'gp-border': '#2a2a3a',
      },
    },
  },
  plugins: [],
}