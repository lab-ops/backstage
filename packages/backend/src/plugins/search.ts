import { useHotCleanup } from '@backstage/backend-common';
import { createRouter } from '@backstage/plugin-search-backend';
import {
  IndexBuilder,
  LunrSearchEngine,
} from '@backstage/plugin-search-backend-node';
import { PluginEnvironment } from '../types';
import { DefaultCatalogCollatorFactory } from '@backstage/plugin-search-backend-module-catalog';
import { DefaultTechDocsCollatorFactory } from '@backstage/plugin-search-backend-module-techdocs';
import { Router } from 'express';
import { DefaultAdrCollatorFactory } from '@backstage/plugin-adr-backend';
import { ElasticSearchSearchEngine } from '@backstage/plugin-search-backend-module-elasticsearch';
import { PgSearchEngine } from '@backstage/plugin-search-backend-module-pg';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  let searchEngine = null;

  switch (process.env.SEARCH_ENGINE) {
    case 'lunr':
      searchEngine = new LunrSearchEngine({
        logger: env.logger,
      });
      break;
    case 'elastic':
      searchEngine = await ElasticSearchSearchEngine.fromConfig({
        logger: env.logger,
        config: env.config,
      });
      break;
    case 'database':
      searchEngine = await PgSearchEngine.fromConfig(
        env.config,
        { database: env.database }
      );
      break;
    default:
      searchEngine = new LunrSearchEngine({
        logger: env.logger,
      });
      break;
  }

  const indexBuilder = new IndexBuilder({
    logger: env.logger,
    searchEngine,
  });

  const schedule = env.scheduler.createScheduledTaskRunner({
    frequency: { minutes: 10 },
    timeout: { minutes: 15 },
    // A 3 second delay gives the backend server a chance to initialize before
    // any collators are executed, which may attempt requests against the API.
    initialDelay: { seconds: 3 },
  });

  // Collators are responsible for gathering documents known to plugins. This
  // collator gathers entities from the software catalog.
  indexBuilder.addCollator({
    schedule,
    factory: DefaultCatalogCollatorFactory.fromConfig(env.config, {
      discovery: env.discovery,
      tokenManager: env.tokenManager,
    }),
  });

  // collator gathers entities from techdocs.
  indexBuilder.addCollator({
    schedule,
    factory: DefaultTechDocsCollatorFactory.fromConfig(env.config, {
      discovery: env.discovery,
      logger: env.logger,
      tokenManager: env.tokenManager,
    }),
  });

  indexBuilder.addCollator({
    schedule,
    factory: DefaultAdrCollatorFactory.fromConfig({
      cache: env.cache,
      config: env.config,
      discovery: env.discovery,
      logger: env.logger,
      reader: env.reader,
      tokenManager: env.tokenManager,
    }),
  });

  // The scheduler controls when documents are gathered from collators and sent
  // to the search engine for indexing.
  const { scheduler } = await indexBuilder.build();
  scheduler.start();

  useHotCleanup(module, () => scheduler.stop());

  return await createRouter({
    engine: indexBuilder.getSearchEngine(),
    types: indexBuilder.getDocumentTypes(),
    permissions: env.permissions,
    config: env.config,
    logger: env.logger,
  });
}
