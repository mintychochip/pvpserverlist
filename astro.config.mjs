import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  outDir: 'dist',
  // Deploying to root domain guildpost.tech
  build: {
    assets: 'assets',
  },
});