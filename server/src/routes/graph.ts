import type { FastifyInstance } from 'fastify';
import type { GraphService } from '../services/graphService';
import type { ClusteringService, ClusteringParams } from '../services/clusteringService';

export async function graphRoutes(
  app: FastifyInstance,
  deps: { service: GraphService; clusteringService: ClusteringService },
) {
  const { service, clusteringService } = deps;

  // GET /api/graph - returns all nodes and edges
  app.get('/api/graph', async () => {
    const data = await service.getGraphData();
    return data;
  });

  // GET /api/graph/cluster - returns cached or fresh clustering results
  app.get('/api/graph/cluster', async () => {
    const cached = await clusteringService.getCachedClusters();
    if (cached) {
      return { data: cached };
    }
    // Fall back to tag/category based clustering
    const clusters = await service.getClusters();
    return { data: { clusters, stats: null, params: clusteringService.getDefaultParams(), computationTime: 0 } };
  });

  // GET /api/graph/stats - returns graph statistics
  app.get('/api/graph/stats', async () => {
    const stats = await service.getStats();
    return { data: stats };
  });

  // POST /api/graph/cluster/run - run Louvain clustering with params
  app.post('/api/graph/cluster/run', async (req) => {
    const body = (req.body || {}) as Partial<ClusteringParams>;
    const result = await clusteringService.runClustering({
      keywordWeight: body.keywordWeight,
      tagWeight: body.tagWeight,
      categoryWeight: body.categoryWeight,
      threshold: body.threshold,
    });
    return { data: result };
  });

  // GET /api/graph/cluster/params - get current/default clustering params
  app.get('/api/graph/cluster/params', async () => {
    const cached = await clusteringService.getCachedClusters();
    return { data: cached?.params || clusteringService.getDefaultParams() };
  });
}
