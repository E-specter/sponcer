import { composeApp } from './compose';
import { loadEnv } from './config/env';
import { logger } from './shared/logger';

const env = loadEnv();
const { app, backfill } = composeApp(env);

void backfill.then((r) =>
  logger.info(`clasificados ${r.classified} perfiles (${r.failed} fallidos)`),
);
app.listen(env.PORT, () => logger.info(`core API en http://localhost:${env.PORT}`));
