import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  site: "http://localhost:8080",
  adapter: node({
    mode: 'standalone',
    host: '0.0.0.0',
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000, 
  }),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
