import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { getDb, closeDb } from './db/database';
import { createKnowledgeRepo } from './db/knowledgeRepo';
import { OpenAIAdapter } from './services/llm/index';
import { KnowledgeService } from './services/knowledgeService';
import { GraphService } from './services/graphService';
import { ClusteringService } from './services/clusteringService';
import { RagService } from './services/ragService';
import { knowledgeRoutes, agentRoutes, providerRoutes, graphRoutes, reviewRoutes, tokenRoutes, categoryRoutes, promptRoutes } from './routes/index';
import { initDefaultCategories } from './services/categoryService';

async function main() {
  const app = Fastify({ logger: true });

  // CORS
  await app.register(cors, {
    origin: true,
  });

  // Multipart for file uploads
  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  // Initialize database
  await getDb();

  // Initialize repositories
  const knowledgeRepo = createKnowledgeRepo();

  // Initialize LLM adapter
  const llm = new OpenAIAdapter(config.llm);

  // Initialize services
  const knowledgeService = new KnowledgeService(llm, knowledgeRepo);
  const graphService = new GraphService();
  const clusteringService = new ClusteringService();
  const ragService = new RagService();

  // Initialize built-in templates
  await knowledgeService.initTemplates();

  // Initialize default categories
  await initDefaultCategories();

  // Register routes
  await app.register(async (instance) => {
    await knowledgeRoutes(instance, { repo: knowledgeRepo, service: knowledgeService, ragService });
  });
  await app.register(async (instance) => {
    await agentRoutes(instance);
  });
  await app.register(async (instance) => {
    await providerRoutes(instance);
  });
  await app.register(async (instance) => {
    await graphRoutes(instance, { service: graphService, clusteringService });
  });
  await app.register(async (instance) => {
    await reviewRoutes(instance);
  });
  await app.register(async (instance) => {
    await tokenRoutes(instance);
  });
  await app.register(async (instance) => {
    await categoryRoutes(instance);
  });
  await app.register(async (instance) => {
    await promptRoutes(instance);
  });

  // Health check
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down...`);
      closeDb();
      await app.close();
      process.exit(0);
    });
  }

  // Start server
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`🚀 Server running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
