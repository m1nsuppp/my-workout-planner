import { Hono } from 'hono';

const app = new Hono();

app.get('/api/hello', (c) => {
  return c.json({ message: 'hello' });
});

export default app;
