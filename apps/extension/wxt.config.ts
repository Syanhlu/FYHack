import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'WingMan',
    description: 'Find a thoughtful way to start a conversation. Grounded in what they share.',
    version: '0.1.0',
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [
      'http://127.0.0.1/*',
      ...(process.env.PROFILE_LENS_TEST === '1' ? ['http://localhost/*'] : []),
    ],
    action: { default_title: 'Open WingMan' },
    // The in-page overlay embeds the panel; main.tsx refuses frames the user did not open.
    web_accessible_resources: [{ resources: ['panel.html'], matches: ['<all_urls>'] }],
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:8787",
    },
  },
});
