import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Profile Lens',
    description: 'Find a thoughtful way to start a conversation. Grounded in what they share.',
    version: '0.1.0',
    permissions: ['activeTab', 'scripting', 'storage', 'sidePanel'],
    host_permissions: [
      'http://127.0.0.1/*',
      ...(process.env.PROFILE_LENS_TEST === '1' ? ['http://localhost/*'] : []),
    ],
    action: { default_title: 'Open Profile Lens' },
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:8787",
    },
  },
});
