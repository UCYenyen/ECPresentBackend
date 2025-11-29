import express from 'express';
import { PORT } from './utils/env-util';
import { publicRouter } from './routes/public-api';
import { errorMiddleware } from './middlewares/error-middleware';
import { privateRouter } from './routes/private-api';

const app = express();

app.use(express.json());
app.use("/api", publicRouter);
app.use("/api", privateRouter);
app.use(errorMiddleware);

const port = Number(PORT) || 3000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log(`url: http://localhost:${port}`)
})