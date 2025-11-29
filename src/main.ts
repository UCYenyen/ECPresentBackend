import express from 'express';
import { PORT } from './utils/env-utils';
import { publicRouter } from './routes/public_api';
import { errorMiddleware } from './middlewares/errorMiddleware';
import { privateRouter } from './routes/private-api';

const app = express();

app.use(express.json());
app.use("/api/", publicRouter);
app.use("/api/", privateRouter);
app.use(errorMiddleware);
app.listen(PORT || 3000, () => {
  console.log(`connected to port ${PORT}`);
});

