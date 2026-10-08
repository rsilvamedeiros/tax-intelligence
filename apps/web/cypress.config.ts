import { defineConfig } from 'cypress';
export default defineConfig({
  e2e: {
    setupNodeEvents(on) {
      on('task', {
        authCheckpoint(label: unknown) {
          if (
            !['app_loaded', 'provider_ready', 'session_active'].includes(
              String(label),
            )
          )
            throw new Error('Unknown authentication checkpoint');
          console.info(`Authentication E2E checkpoint: ${label}`);
          return null;
        },
      });
    },
    baseUrl: 'http://127.0.0.1:3000',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.ts',
  },
  video: false,
});
