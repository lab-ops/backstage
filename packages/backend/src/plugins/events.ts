import {
  EventsBackend,
  HttpPostIngressEventPublisher,
} from '@backstage/plugin-events-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';
import { createGithubSignatureValidator, GithubEventRouter } from '@backstage/plugin-events-backend-module-github';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const eventsRouter = Router();


  const http = HttpPostIngressEventPublisher.fromConfig({
    config: env.config,
    ingresses: {
      github: {
        validator: createGithubSignatureValidator(env.config),
      },
    },
    logger: env.logger,
  });
  http.bind(eventsRouter);

  const githubEventRouter = new GithubEventRouter();

  await new EventsBackend(env.logger)
    .addPublishers(githubEventRouter)
    .addSubscribers(githubEventRouter)
    .setEventBroker(env.eventBroker)
    .addPublishers(http)
    .start();

  return eventsRouter;
}
