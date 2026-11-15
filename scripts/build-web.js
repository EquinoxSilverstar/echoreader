const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

const env = { ...process.env, EXPO_NO_DOTENV: '1' };
delete env.EXPO_PUBLIC_ELEVENLABS_KEY;
delete env.EXPO_PUBLIC_GOOGLE_TTS_KEY;

const expoCli = path.resolve('node_modules/expo/bin/cli');
const result = spawnSync(process.execPath, [expoCli, 'export', '--platform', 'web'], {
  env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

mkdirSync('dist', { recursive: true });
writeFileSync(path.join('dist', '.nojekyll'), '');
