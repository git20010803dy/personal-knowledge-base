import { getDb, saveDb } from '../db/database';
import type { ClusterGroup } from '@pkb/shared';

export interface ClusteringParams {
  keywordWeight: number;
  tagWeight: number;
  categoryWeight: number;
  threshold: number;
}

export interface ClusteringResult {
  clusters: ClusterGroup[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    totalClusters: number;
    avgClusterSize: number;
  };
  params: ClusteringParams;
  computationTime: number;
}

interface FeatureRow {
  itemId: string;
  keywords: string[];
  tags: string[];
  category: string | null;
}

interface Edge {
  source: string;
  target: string;
  weight: number;
}

interface Graph {
  nodes: string[];
  edges: Edge[];
  adjacencyList: Map<string, Map<string, number>>;
}

const DEFAULT_PARAMS: ClusteringParams = {
  keywordWeight: 0.5,
  tagWeight: 0.4,
  categoryWeight: 0.1,
  threshold: 0.2,
};

export class ClusteringService {
  getDefaultParams(): ClusteringParams {
    return { ...DEFAULT_PARAMS };
  }

  /**
   * Compute Jaccard similarity between two string arrays (case-insensitive)
   */
  private jaccard(a: string[], b: string[]): number {
    const setA = new Set(a.map((s) => s.toLowerCase()));
    const setB = new Set(b.map((s) => s.toLowerCase()));

    if (setA.size === 0 && setB.size === 0) return 0;

    let intersection = 0;
    for (const s of setA) {
      if (setB.has(s)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Build similarity graph from clustering_features
   */
  private buildSimilarityGraph(features: FeatureRow[], params: ClusteringParams): Graph {
    const adjacencyList = new Map<string, Map<string, number>>();
    const edges: Edge[] = [];

    // Initialize adjacency list for all nodes
    for (const f of features) {
      adjacencyList.set(f.itemId, new Map());
    }

    // Normalize weights so they sum to 1
    const totalWeight = params.keywordWeight + params.tagWeight + params.categoryWeight;
    const kw = totalWeight > 0 ? params.keywordWeight / totalWeight : 0;
    const tw = totalWeight > 0 ? params.tagWeight / totalWeight : 0;
    const cw = totalWeight > 0 ? params.categoryWeight / totalWeight : 0;

    // Compute pairwise similarities
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const a = features[i];
        const b = features[j];

        const kwSim = this.jaccard(a.keywords, b.keywords);
        const tagSim = this.jaccard(a.tags, b.tags);
        const catSim =
          a.category && b.category && a.category.toLowerCase() === b.category.toLowerCase() ? 1 : 0;

        const similarity = kw * kwSim + tw * tagSim + cw * catSim;

        if (similarity >= params.threshold) {
          edges.push({ source: a.itemId, target: b.itemId, weight: similarity });
          adjacencyList.get(a.itemId)!.set(b.itemId, similarity);
          adjacencyList.get(b.itemId)!.set(a.itemId, similarity);
        }
      }
    }

    return {
      nodes: features.map((f) => f.itemId),
      edges,
      adjacencyList,
    };
  }

  /**
   * Louvain community detection (single-phase modularity optimization)
   */
  private louvain(graph: Graph): Map<string, number> {
    const { nodes, adjacencyList } = graph;
    const community = new Map<string, number>();

    if (nodes.length === 0) return community;

    // Initialize: each node in its own community
    for (let i = 0; i < nodes.length; i++) {
      community.set(nodes[i], i);
    }

    // Compute total edge weight (2m)
    let totalWeight = 0;
    for (const [, neighbors] of adjacencyList) {
      for (const [, w] of neighbors) {
        totalWeight += w;
      }
    }
    // totalWeight is sum of all edge weights in adjacency list (each edge counted twice)
    // So 2m = totalWeight, m = totalWeight / 2

    if (totalWeight === 0) return community; // No edges, each node is its own community

    const m = totalWeight / 2;

    // Compute node strengths (k_i)
    const nodeStrength = new Map<string, number>();
    for (const [node, neighbors] of adjacencyList) {
      let strength = 0;
      for (const [, w] of neighbors) {
        strength += w;
      }
      nodeStrength.set(node, strength);
    }

    // Precompute: community -> { sumIn (Σ_in), sumTot (Σ_tot) }
    // sumIn = sum of weights of links inside community (counted once for the community)
    // sumTot = sum of weights of links incident to nodes in community
    const communitySumIn = new Map<number, number>();
    const communitySumTot = new Map<number, number>();

    // Initialize community stats
    for (const node of nodes) {
      const c = community.get(node)!;
      communitySumTot.set(c, (communitySumTot.get(c) || 0) + (nodeStrength.get(node) || 0));
      // sumIn for singleton is 0
      communitySumIn.set(c, 0);
    }

    // For edges, add to sumIn
    for (const edge of graph.edges) {
      const c1 = community.get(edge.source)!;
      const c2 = community.get(edge.target)!;
      if (c1 === c2) {
        communitySumIn.set(c1, (communitySumIn.get(c1) || 0) + 2 * edge.weight);
      }
    }

    // Phase 1: iteratively move nodes to maximize modularity
    let improved = true;
    let iterations = 0;
    const MAX_ITERATIONS = 20;

    while (improved && iterations < MAX_ITERATIONS) {
      improved = false;
      iterations++;

      for (const node of nodes) {
        const currentCommunity = community.get(node)!;
        const ki = nodeStrength.get(node) || 0;
        const neighbors = adjacencyList.get(node);

        if (!neighbors || neighbors.size === 0) continue;

        // Collect neighbor communities and ki_in for each
        const communityKiIn = new Map<number, number>();
        for (const [neighbor, weight] of neighbors) {
          const neighborCommunity = community.get(neighbor)!;
          communityKiIn.set(neighborCommunity, (communityKiIn.get(neighborCommunity) || 0) + weight);
        }

        // Remove node from current community
        const oldCommunity = currentCommunity;

        // Update community stats for removal
        const kiInOld = communityKiIn.get(oldCommunity) || 0;
        communitySumTot.set(oldCommunity, (communitySumTot.get(oldCommunity) || 0) - ki);
        communitySumIn.set(oldCommunity, (communitySumIn.get(oldCommunity) || 0) - 2 * kiInOld);

        // Find best community to move to
        let bestCommunity = oldCommunity;
        let bestGain = 0;

        for (const [targetCommunity, kiIn] of communityKiIn) {
          if (targetCommunity === oldCommunity) continue;

          const sigmaTot = communitySumTot.get(targetCommunity) || 0;

          // Modularity gain: ΔQ = (k_i_in / m) - (k_i * Σ_tot) / (2 * m²)
          // Simplified from: ΔQ = (Σ_in + 2*k_i_in) / (2*m) - ((Σ_tot + k_i) / (2*m))² - [Σ_in/(2m) - (Σ_tot/(2m))² - (k_i/(2m))²]
          const gain = (kiIn / m) - (ki * sigmaTot) / (2 * m * m);

          if (gain > bestGain) {
            bestGain = gain;
            bestCommunity = targetCommunity;
          }
        }

        // Move node to best community
        community.set(node, bestCommunity);

        // Update community stats for new placement
        const kiInNew = communityKiIn.get(bestCommunity) || 0;
        communitySumTot.set(bestCommunity, (communitySumTot.get(bestCommunity) || 0) + ki);
        communitySumIn.set(bestCommunity, (communitySumIn.get(bestCommunity) || 0) + 2 * kiInNew);

        if (bestCommunity !== oldCommunity) {
          improved = true;
        }
      }
    }

    // Renumber communities to be consecutive
    const communityMap = new Map<number, number>();
    let nextId = 0;
    const result = new Map<string, number>();

    for (const node of nodes) {
      const c = community.get(node)!;
      if (!communityMap.has(c)) {
        communityMap.set(c, nextId++);
      }
      result.set(node, communityMap.get(c)!);
    }

    return result;
  }

  /**
   * Run full clustering pipeline
   */
  async runClustering(params?: Partial<ClusteringParams>): Promise<ClusteringResult> {
    const startTime = Date.now();
    const mergedParams: ClusteringParams = { ...DEFAULT_PARAMS, ...params };

    const db = await getDb();

    // Read features
    const res = db.exec(
      'SELECT item_id, keywords, tags, category FROM clustering_features',
    );

    const features: FeatureRow[] = [];
    if (res.length > 0) {
      for (const row of res[0].values) {
        features.push({
          itemId: row[0] as string,
          keywords: JSON.parse((row[1] as string) || '[]'),
          tags: JSON.parse((row[2] as string) || '[]'),
          category: (row[3] as string) || null,
        });
      }
    }

    if (features.length === 0) {
      const result: ClusteringResult = {
        clusters: [],
        stats: { totalNodes: 0, totalEdges: 0, totalClusters: 0, avgClusterSize: 0 },
        params: mergedParams,
        computationTime: Date.now() - startTime,
      };
      return result;
    }

    // Build similarity graph
    const graph = this.buildSimilarityGraph(features, mergedParams);

    // Run Louvain
    const communityMap = this.louvain(graph);

    // Group nodes by community
    const clusterGroups = new Map<number, string[]>();
    for (const [nodeId, communityId] of communityMap) {
      if (!clusterGroups.has(communityId)) {
        clusterGroups.set(communityId, []);
      }
      clusterGroups.get(communityId)!.push(nodeId);
    }

    // Get item titles for cluster names
    const titleRes = db.exec(
      'SELECT id, title FROM knowledge_items WHERE id IN (' +
        features.map((f) => '?').join(',') +
        ')',
      features.map((f) => f.itemId),
    );
    const titleMap = new Map<string, string>();
    if (titleRes.length > 0) {
      for (const row of titleRes[0].values) {
        titleMap.set(row[0] as string, row[1] as string);
      }
    }

    // Format clusters
    const clusters: ClusterGroup[] = [];
    for (const [communityId, nodeIds] of clusterGroups) {
      // Name cluster by first item's title or category
      const firstId = nodeIds[0];
      const feature = features.find((f) => f.itemId === firstId);
      const name = feature?.category
        ? `社区 ${communityId + 1}: ${feature.category}`
        : `社区 ${communityId + 1}`;

      clusters.push({ name, nodeIds });
    }

    // Sort by size descending
    clusters.sort((a, b) => b.nodeIds.length - a.nodeIds.length);

    const computationTime = Date.now() - startTime;

    const result: ClusteringResult = {
      clusters,
      stats: {
        totalNodes: features.length,
        totalEdges: graph.edges.length,
        totalClusters: clusters.length,
        avgClusterSize: clusters.length > 0 ? features.length / clusters.length : 0,
      },
      params: mergedParams,
      computationTime,
    };

    // Cache result
    try {
      db.run(
        'INSERT OR REPLACE INTO clustering_cache (id, clusters, params, item_count, computed_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        ['latest', JSON.stringify(clusters), JSON.stringify(mergedParams), features.length],
      );
      saveDb();
    } catch (e) {
      console.error('Failed to cache clustering result:', e);
    }

    return result;
  }

  /**
   * Get cached clustering results if valid
   */
  async getCachedClusters(): Promise<ClusteringResult | null> {
    const db = await getDb();

    // Check current item count
    const countRes = db.exec('SELECT COUNT(*) FROM clustering_features');
    const currentCount = countRes.length > 0 ? (countRes[0].values[0][0] as number) : 0;

    // Read cache
    const cacheRes = db.exec(
      'SELECT clusters, params, item_count, computed_at FROM clustering_cache WHERE id = ?',
      ['latest'],
    );

    if (cacheRes.length === 0 || cacheRes[0].values.length === 0) return null;

    const row = cacheRes[0].values[0];
    const cachedItemCount = row[2] as number;

    // Cache invalid if item count changed
    if (cachedItemCount !== currentCount) return null;

    const clusters: ClusterGroup[] = JSON.parse(row[0] as string);
    const params: ClusteringParams = JSON.parse(row[1] as string);

    return {
      clusters,
      stats: {
        totalNodes: currentCount,
        totalEdges: 0, // Not cached
        totalClusters: clusters.length,
        avgClusterSize: clusters.length > 0 ? currentCount / clusters.length : 0,
      },
      params,
      computationTime: 0,
    };
  }
}
