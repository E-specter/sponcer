import { buildTestApp } from '../support/app';
import { describeFeedSearch } from '../support/feed-scenarios';

describeFeedSearch('adaptadores mock', async () => ({
  app: (await buildTestApp()).app,
  exact: true,
}));
