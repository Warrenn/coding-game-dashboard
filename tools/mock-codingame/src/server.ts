// Placeholder. Real mock CodinGame routes land in Step 2.
import express from 'express';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ ok: true }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  createApp().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mock-codingame listening on :${port}`);
  });
}
