import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_DATA_URL': JSON.stringify(env.VITE_DATA_URL || 'https://api.tibroish.bg'),
        'process.env.VITE_SUBMIT_URL': JSON.stringify(env.VITE_SUBMIT_URL || 'http://localhost:8787'),
        'process.env.VITE_SUBMIT_ENDPOINT': JSON.stringify(env.VITE_SUBMIT_ENDPOINT || 'submit'),
        'process.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify(env.VITE_TURNSTILE_SITE_KEY || ''),
        'process.env.VITE_ELECTION_DATE': JSON.stringify(env.VITE_ELECTION_DATE || '2026-04-19'),
        'process.env.VITE_FORM_URL': JSON.stringify(env.VITE_FORM_URL || 'https://tibroish.bg/signup')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true
      }
    };
});
