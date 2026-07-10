import { BaseNode } from '../schema/types.js';

export interface ScoredNode {
  node: BaseNode;
  score: number;
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have',
  'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him',
  'himself', 'his', 'how', 'hows', 'i', 'id', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it',
  'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over',
  'own', 'same', 'shanant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such',
  'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres',
  'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent',
  'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom',
  'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your',
  'yours', 'yourself', 'yourselves'
]);

export function tokenize(text: string): string[] {
  // Split camelCase to support words like "OAuthLogin" -> "oauth login"
  const camelSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  return camelSplit
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function extractMetadataText(obj: unknown): string {
  if (typeof obj === 'string') {
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(extractMetadataText).join(' ');
  }
  if (obj && typeof obj === 'object') {
    return Object.values(obj)
      .map(extractMetadataText)
      .join(' ');
  }
  return '';
}

export function searchTfidf(
  nodes: BaseNode[],
  query: string,
  limit: number
): BaseNode[] {
  if (nodes.length === 0 || !query.trim()) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  // 1. Extract and tokenize text for all documents (nodes)
  const corpusTokens = nodes.map(node => {
    const text = [
      node.title,
      node.type,
      node.status,
      ...(node.tags || []),
      extractMetadataText(node.metadata)
    ].join(' ');
    return tokenize(text);
  });

  const N = nodes.length;

  // 2. Compute Document Frequency (DF) for each term in the corpus
  const dfMap = new Map<string, number>();
  for (const tokens of corpusTokens) {
    const uniqueTokens = new Set(tokens);
    for (const token of uniqueTokens) {
      dfMap.set(token, (dfMap.get(token) || 0) + 1);
    }
  }

  // Helper to compute IDF
  const getIdf = (term: string): number => {
    const df = dfMap.get(term) || 0;
    if (df === 0) return 0;
    return Math.log(1 + N / df);
  };

  // 3. Compute Term Frequency (TF) for each document
  const docTfs = corpusTokens.map(tokens => {
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    return tf;
  });

  // 4. Compute Query Vector (TF-IDF weights for query terms)
  const queryTf = new Map<string, number>();
  for (const token of queryTokens) {
    queryTf.set(token, (queryTf.get(token) || 0) + 1);
  }

  const queryWeights = new Map<string, number>();
  let queryNormSq = 0;
  for (const [token, count] of queryTf.entries()) {
    const idf = getIdf(token);
    const weight = count * idf;
    queryWeights.set(token, weight);
    queryNormSq += weight * weight;
  }
  const queryNorm = Math.sqrt(queryNormSq);

  if (queryNorm === 0) {
    return [];
  }

  // 5. Calculate Cosine Similarity for each document
  const scoredNodes: ScoredNode[] = [];

  for (let i = 0; i < N; i++) {
    const node = nodes[i];
    const tfMap = docTfs[i];

    // Compute weights for all terms in this document to calculate document norm
    const docWeights = new Map<string, number>();
    let docNormSq = 0;
    
    for (const [token, count] of tfMap.entries()) {
      const idf = getIdf(token);
      const weight = count * idf;
      docWeights.set(token, weight);
      docNormSq += weight * weight;
    }
    const docNorm = Math.sqrt(docNormSq);

    if (docNorm === 0) {
      scoredNodes.push({ node, score: 0 });
      continue;
    }

    // Dot product with query terms
    let dotProduct = 0;
    for (const token of queryTf.keys()) {
      const qWeight = queryWeights.get(token) || 0;
      const dWeight = docWeights.get(token) || 0;
      dotProduct += qWeight * dWeight;
    }

    const similarity = dotProduct / (docNorm * queryNorm);
    scoredNodes.push({ node, score: similarity });
  }

  // 6. Sort and filter out zero-similarity results, then return top `limit`
  return scoredNodes
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.node);
}
