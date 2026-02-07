import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './vitest.setup.ts',
        coverage: {
            provider: 'v8',
            include: ['components/utils/**/*.{ts,tsx}', 'src/worker.ts'],
            exclude: ['**/*.test.ts', '**/*.test.tsx', 'components/utils/api.ts'],
            reporter: ['text', 'text-summary'],
            thresholds: {
                lines: 90,
                functions: 90,
                branches: 85,
                statements: 90,
            },
        },
    },
});
