import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function getVersion() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export function versionCmd(wrap) {
  return {
    command: 'version',
    describe: 'Show version information',
    handler: wrap(async (_argv, app) => {
      const version = getVersion();
      app.ok({ version }, { summary: `jsn ${version}` });
    }),
  };
}
