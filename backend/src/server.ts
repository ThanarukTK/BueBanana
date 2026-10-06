import { type Config, loadConfig } from './config';
import { createRepository } from './repository';
import { createApp } from './app';

const config = loadConfig();
const repo = await createRepository(config);
if (repo.ping) await repo.ping();

const app = createApp({ repo, config });
app.listen({ hostname: '0.0.0.0', port: config.port });

const base = `http://localhost:${config.port}`;
console.log(`BueBanana backend listening on ${base}`);
console.log(`Storage: ${repo.describe()}`);
if (config.store === 'memory') {
  console.log('Data is cleared when the server restarts. Set STORE=postgres in backend/.env for durability.');
}
console.log('');
console.log('Channels (docs/api-contract.md):');
console.log(`  reader  REST  POST ${base}/api/v1/scans   (header X-Device-Key: ${config.deviceKey})`);
console.log(`  reader  WSS   ws://localhost:${config.port}/ws/reader?deviceKey=${config.deviceKey}`);
console.log(`  staff   WSS   ws://localhost:${config.port}/ws/admin?token=${config.staffToken}`);
console.log(`  staff   REST  GET  ${base}/api/v1/groups?status=active   (header Authorization: Bearer ${config.staffToken})`);

export type { Config };
