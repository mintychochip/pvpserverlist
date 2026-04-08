import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  output: 'static',
  // Deploying to root domain guildpost.tech
  build: {
    assets: 'assets',
  },
  vite: {
    build: {
      rollupOptions: {
        external: ['minecraft-server-util', 'stripe']
      }
    }
  }
});