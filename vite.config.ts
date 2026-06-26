import { createLogger, defineConfig, loadEnv, type Logger } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

function isKnownDevDependencyWarning(message: string): boolean {
  return (
    message.includes('The above dynamic import cannot be analyzed by Vite') &&
    message.includes('react-router-dom.js')
  );
}

function createNomiLogger(): Logger {
  const logger = createLogger();
  const warn = logger.warn.bind(logger);
  logger.warn = (message, options) => {
    if (typeof message === 'string' && isKnownDevDependencyWarning(message)) return;
    warn(message, options);
  };
  return logger;
}

function createManualChunks(id: string): string | undefined {
  if (
    id.includes('/node_modules/prosemirror-') ||
    id.includes('/node_modules/orderedmap/') ||
    id.includes('/node_modules/w3c-keyname/')
  ) {
    return 'prosemirror-vendor';
  }
  if (
    id.includes('/node_modules/@tiptap/') ||
    id.includes('/node_modules/@prosemirror')
  ) {
    return 'tiptap-vendor';
  }
  if (
    id.includes('/node_modules/react-markdown/') ||
    id.includes('/node_modules/remark-') ||
    id.includes('/node_modules/rehype-') ||
    id.includes('/node_modules/unified/') ||
    id.includes('/node_modules/mdast-') ||
    id.includes('/node_modules/hast-')
  ) {
    return 'markdown-vendor';
  }
  if (id.includes('/node_modules/three/')) return 'three-vendor';
  if (
    id.includes('/node_modules/@react-three/') ||
    id.includes('/node_modules/three-stdlib/') ||
    id.includes('/node_modules/tunnel-rat/') ||
    id.includes('/node_modules/suspend-react/')
  ) {
    return 'r3f-vendor';
  }
  if (id.includes('/src/ui/stats/')) return 'app-stats';
  if (id.includes('/src/api/')) return 'app-api';
  return undefined;
}

export default defineConfig(({ command, mode }) => {
  loadEnv(mode, process.cwd(), 'VITE_');

  if (command === 'build' && mode !== 'production') {
    throw new Error(
      `[nomi] Dev build is disabled. Use \`vite build --mode production\` (current mode: ${mode}).`,
    );
  }

  return {
    base: './',
    customLogger: createNomiLogger(),
    plugins: [react()],
    resolve: {
      alias: [
        { find: 'react/jsx-dev-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-dev-runtime.js') },
        { find: 'react/jsx-runtime', replacement: resolve(__dirname, 'node_modules/react/jsx-runtime.js') },
        { find: 'react-dom/client', replacement: resolve(__dirname, 'node_modules/react-dom/client.js') },
        { find: 'react-dom', replacement: resolve(__dirname, 'node_modules/react-dom') },
        { find: 'react', replacement: resolve(__dirname, 'node_modules/react') },
        { find: 'three', replacement: resolve(__dirname, 'node_modules/three') },
      ],
      dedupe: ['react', 'react-dom', 'three'],
    },
    optimizeDeps: {
      entries: ['index.html'],
      force: command === 'serve',
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'three',
        '@tanstack/react-virtual',
        '@react-three/fiber',
        '@react-three/drei',
        '@radix-ui/react-switch',
        '@mantine/core',
        '@mantine/modals',
        '@mantine/notifications',
        '@tabler/icons-react',
        'framer-motion',
        'react-router-dom',
        'swr',
        'zustand',
        'zustand/middleware',
        'zustand/middleware/immer',
      ],
    },
    server: {
      port: 5173,
      host: true,
      fs: {
        allow: [resolve(__dirname)],
      },
    },
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
      rollupOptions: {
        output: {
          manualChunks: createManualChunks,
        },
      },
    },
  };
});
