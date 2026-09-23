import { createApp } from './app';
import { MemoryStore } from './store';

const port = Number(process.env.PORT ?? 3000);
const store = new MemoryStore();
const app = createApp(store);

app.listen({ hostname: '0.0.0.0', port });
console.log(`BueBanana backend listening on http://localhost:${port}`);
console.log('Storage: in-memory development mode (no database credentials required).');
console.log('Data is cleared when the server restarts.');
