import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { getAllowedCorsOrigins } from './utils/corsOrigins.js';

const app = express();
const allowedOrigins = new Set(getAllowedCorsOrigins());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  maxAge: 86400,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
