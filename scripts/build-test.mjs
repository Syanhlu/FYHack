import { spawnSync } from 'node:child_process';

// Reuse the pnpm CLI that launched this script, including when invoked through
// npx. Setting the environment in Node also works in Windows shells.
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run this script through pnpm build:test.');

const result = spawnSync(process.execPath, [pnpmCli, '--dir', 'apps/extension', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, PROFILE_LENS_TEST: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
