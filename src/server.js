import 'dotenv/config';
import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = process.env.PORT || 5001;

async function start() {
  await connectDB();
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API base: http://localhost:${PORT}/api/v1`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Set PORT in backend/.env (5000 is often taken by macOS AirPlay).`);
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
