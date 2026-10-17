import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Относительная база: работает и на GitHub Pages (/cyberhack/), и в Tauri/Capacitor
  base: './',
  plugins: [react()],
});
