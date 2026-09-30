import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import packageJson from './package.json';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'remove-crossorigin',
        enforce: 'post',
        transformIndexHtml(html) {
          return html.replaceAll(' crossorigin', '');
        },
      },
    ],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    build: {
      outDir: 'dist-web',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion/react'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // No `tauri android dev` o WebView roda no celular: localhost seria o
      // próprio aparelho. Escutar em 0.0.0.0 permite alcançar o dev-server
      // pelo IP do host (ex.: `tauri android dev --host`).
      host: '0.0.0.0',
      port: 1420,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
