import { defineConfig } from 'cypress';
export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:3000',
    supportFile: false,
    specPattern: 'cypress/e2e/**/*.cy.ts',
  },
  video: false,
});
