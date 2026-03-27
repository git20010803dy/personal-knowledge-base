import { getDb } from '../db/database';
import type { GraphNode, GraphEdge, GraphData, ClusterGroup, GraphStats, KnowledgeType } from '@pkb/shared';

interface LinkRow {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string | null;
  strength: number;
}

export class GraphService {
  /**
   * Get all graph data (nodes + edges) in a single query batch
   */
  async getGraphData(): Promise<GraphData> {
    const db = await getDb();

    // Get all knowledge items as potential nodes
    const itemsRes = db.exec(
      'SELECT id, title, type, tags, category FROM knowledge_items ORDER BY created_at DESC',
    );

    const nodes: GraphNode[] = [];
    if (itemsRes.length > 0) {
      for (const row of itemsRes[0].values) {
        nodes.push({
          id: row[0] as string,
          title: row[1] as string,
          type: row[2] as KnowledgeType,
          tags: JSON.parse((row[3] as string) || '[]'),
          category: row[4] as string | null,
          importance: 0, // will be calculated below
        });
      }
    }

    // Get all links as edges
    const linksRes = db.exec(
      'SELECT id, source_id, target_id, relation_type, strength FROM knowledge_links',
    );

    const edges: GraphEdge[] = [];
    const degreeMap = new Map<string, number>();

    if (linksRes.length > 0) {
      // Build node ID set for validation (sql.js doesn't enforce FK constraints)
      const nodeIds = new Set(nodes.map((n) => n.id));

      for (const row of linksRes[0].values) {
        const source_id = row[1] as string;
        const target_id = row[2] as string;

        // Skip edges referencing deleted nodes
        if (!nodeIds.has(source_id) || !nodeIds.has(target_id)) continue;

        const edge: GraphEdge = {
          id: row[0] as string,
          source_id,
          target_id,
          relation_type: row[3] as string | null,
          strength: row[4] as number,
        };
        edges.push(edge);

        // Calculate degree centrality
        degreeMap.set(source_id, (degreeMap.get(source_id) || 0) + 1);
        degreeMap.set(target_id, (degreeMap.get(target_id) || 0) + 1);
      }
    }

    // Set importance on nodes
    for (const node of nodes) {
      node.importance = degreeMap.get(node.id) || 0;
    }

    return { nodes, edges };
  }

  /**
   * Get clustering results - group nodes by shared tags and category
   */
  async getClusters(): Promise<ClusterGroup[]> {
    const db = await getDb();
    const itemsRes = db.exec('SELECT id, tags, category FROM knowledge_items');

    if (itemsRes.length === 0) return [];

    const tagGroups = new Map<string, string[]>();
    const categoryGroups = new Map<string, string[]>();

    for (const row of itemsRes[0].values) {
      const id = row[0] as string;
      const tags: string[] = JSON.parse((row[1] as string) || '[]');
      const category = row[2] as string | null;

      // Group by tags
      for (const tag of tags) {
        if (!tagGroups.has(tag)) tagGroups.set(tag, []);
        tagGroups.get(tag)!.push(id);
      }

      // Group by category
      if (category) {
        if (!categoryGroups.has(category)) categoryGroups.set(category, []);
        categoryGroups.get(category)!.push(id);
      }
    }

    const clusters: ClusterGroup[] = [];

    // Add category clusters (named with prefix)
    for (const [name, nodeIds] of categoryGroups) {
      if (nodeIds.length > 1) {
        clusters.push({ name: `分类: ${name}`, nodeIds });
      }
    }

    // Add tag clusters (only if > 1 node shares the tag)
    for (const [name, nodeIds] of tagGroups) {
      if (nodeIds.length > 1) {
        clusters.push({ name: `标签: ${name}`, nodeIds });
      }
    }

    return clusters;
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    const db = await getDb();

    const nodeCountRes = db.exec('SELECT COUNT(*) FROM knowledge_items');
    const edgeCountRes = db.exec('SELECT COUNT(*) FROM knowledge_links');

    const totalNodes = nodeCountRes.length > 0 ? (nodeCountRes[0].values[0][0] as number) : 0;
    const totalEdges = edgeCountRes.length > 0 ? (edgeCountRes[0].values[0][0] as number) : 0;

    const clusters = await this.getClusters();

    return {
      totalNodes,
      totalEdges,
      clusters: clusters.length,
      avgConnections: totalNodes > 0 ? (totalEdges * 2) / totalNodes : 0,
    };
  }
}
