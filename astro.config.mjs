import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  integrations: [tailwind()],
  output: 'server',
  adapter: cloudflare({
    imageService: 'passthrough'
  }),
  // Deploying to root domain guildpost.tech
  build: {
    assets: 'assets',
  },
  vite: {
    build: {
      rollupOptions: {
        external: ['minecraft-server-util']
      }
    }
  }
});