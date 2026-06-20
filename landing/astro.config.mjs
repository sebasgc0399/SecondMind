// @ts-check
import { defineConfig } from 'astro/config';

// Landing estática del apex getsecondmind.co (SPEC-feature-63).
// output 'static' es el default de Astro (sin adapter) → HTML puro, zero-JS.
export default defineConfig({
  site: 'https://getsecondmind.co',
  trailingSlash: 'never',
  build: {
    // 'file' → /privacy.html (servido como /privacy con cleanUrls de Firebase Hosting).
    format: 'file',
  },
});
