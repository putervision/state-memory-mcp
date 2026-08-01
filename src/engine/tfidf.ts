import crypto from 'crypto';
import { BaseNode } from '../schema/types.js';

interface ScoredNode {
  node: BaseNode;
  score: number;
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'arent',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'cant',
  'cannot',
  'could',
  'couldnt',
  'did',
  'didnt',
  'do',
  'does',
  'doesnt',
  'doing',
  'dont',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'hadnt',
  'has',
  'hasnt',
  'have',
  'havent',
  'having',
  'he',
  'hed',
  'hell',
  'hes',
  'her',
  'here',
  'heres',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'hows',
  'i',
  'id',
  'im',
  'ive',
  'if',
  'in',
  'into',
  'is',
  'isnt',
  'it',
  'its',
  'itself',
  'lets',
  'me',
  'more',
  'most',
  'mustnt',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'shant',
  'she',
  'shed',
  'shell',
  'shes',
  'should',
  'shouldnt',
  'so',
  'some',
  'such',
  'than',
  'that',
  'thats',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'theres',
  'these',
  'they',
  'theyd',
  'theyll',
  'theyre',
  'theyve',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'wasnt',
  'we',
  'wed',
  'well',
  'were',
  'weve',
  'werent',
  'what',
  'whats',
  'when',
  'whens',
  'where',
  'wheres',
  'which',
  'while',
  'who',
  'whos',
  'whom',
  'why',
  'whys',
  'with',
  'wont',
  'would',
  'wouldnt',
  'you',
  'youd',
  'youll',
  'youre',
  'youve',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

export function tokenize(text: string): string[] {
  // Split camelCase to support words like "OAuthLogin" -> "oauth login"
  const camelSplit = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  return camelSplit
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
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
    return Object.values(obj).map(extractMetadataText).join(' ');
  }
  return '';
}

interface CachedCorpus {
  fingerprint: string;
  dfMap: Map<string, number>;
  docTfs: Map<string, Map<string, number>>;
  docNorms: Map<string, number>;
  docWeightsList: Map<string, Map<string, number>>;
}

const MAX_CORPUS_CACHE_ENTRIES = 10;
const MAX_TOKENIZED_NODES_ENTRIES = 2000;

const corpusCache = new Map<string, CachedCorpus>();
const tokenizedNodesCache = new Map<string, { tokens: string[]; updatedAt: string }>();

export function clearTfidfCache(nodeId?: string) {
  if (nodeId) {
    tokenizedNodesCache.delete(nodeId);
  } else {
    tokenizedNodesCache.clear();
    corpusCache.clear();
  }
}

function setTokenizedNodeCache(id: string, value: { tokens: string[]; updatedAt: string }) {
  if (tokenizedNodesCache.size >= MAX_TOKENIZED_NODES_ENTRIES) {
    const oldestKey = tokenizedNodesCache.keys().next().value;
    if (oldestKey) tokenizedNodesCache.delete(oldestKey);
  }
  tokenizedNodesCache.set(id, value);
}

function setCorpusCache(projectKey: string, corpus: CachedCorpus) {
  if (corpusCache.size >= MAX_CORPUS_CACHE_ENTRIES) {
    const oldestKey = corpusCache.keys().next().value;
    if (oldestKey) corpusCache.delete(oldestKey);
  }
  corpusCache.set(projectKey, corpus);
}

function getOrTokenizeNode(node: BaseNode): string[] {
  const cached = tokenizedNodesCache.get(node.id);
  if (cached && cached.updatedAt === node.updated_at) {
    return cached.tokens;
  }
  const text = [
    node.title,
    node.type,
    node.status,
    ...(node.tags || []),
    extractMetadataText(node.metadata),
  ].join(' ');
  const tokens = tokenize(text);
  setTokenizedNodeCache(node.id, { tokens, updatedAt: node.updated_at || '' });
  return tokens;
}

export function searchTfidf(nodes: BaseNode[], query: string, limit: number): BaseNode[] {
  if (nodes.length === 0 || !query.trim()) {
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }

  const N = nodes.length;

  // Compute corpus fingerprint (includes all node IDs to be order-independent)
  const sortedIds = nodes.map((n) => n.id).sort();
  let maxUpdatedAt = '';
  const project = nodes[0].project || '';
  for (const node of nodes) {
    if (node.updated_at && node.updated_at > maxUpdatedAt) {
      maxUpdatedAt = node.updated_at;
    }
  }
  const rawIdString = sortedIds.join(',');
  const hash = crypto.createHash('sha256').update(rawIdString).digest('hex').substring(0, 16);
  const fingerprint = `${project}:${N}:${maxUpdatedAt}:${hash}`;

  let corpus = corpusCache.get(project);
  if (!corpus || corpus.fingerprint !== fingerprint) {
    const docTfs = new Map<string, Map<string, number>>();
    const dfMap = new Map<string, number>();

    // 1. Tokenize all nodes and compute DF Map
    for (const node of nodes) {
      const tokens = getOrTokenizeNode(node);

      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        dfMap.set(token, (dfMap.get(token) || 0) + 1);
      }
    }

    // 2. Compute TF-IDF vector weights for each document
    const docWeightsList = new Map<string, Map<string, number>>();
    const docNorms = new Map<string, number>();

    for (const node of nodes) {
      const tokens = getOrTokenizeNode(node);
      const tfMap = new Map<string, number>();
      for (const token of tokens) {
        tfMap.set(token, (tfMap.get(token) || 0) + 1);
      }
      docTfs.set(node.id, tfMap);

      let docNormSq = 0;
      const docWeights = new Map<string, number>();
      for (const [token, tf] of tfMap.entries()) {
        const df = dfMap.get(token) || 0;
        const idf = Math.log(1 + N / df);
        const tfidf = tf * idf;
        docWeights.set(token, tfidf);
        docNormSq += tfidf * tfidf;
      }

      docWeightsList.set(node.id, docWeights);
      docNorms.set(node.id, Math.sqrt(docNormSq));
    }

    corpus = {
      fingerprint,
      dfMap,
      docTfs,
      docNorms,
      docWeightsList,
    };
    setCorpusCache(project, corpus);
  }

  const { dfMap, docTfs, docNorms, docWeightsList } = corpus;

  const getIdf = (term: string): number => {
    const df = dfMap.get(term) || 0;
    if (df === 0) return 0;
    return Math.log(1 + N / df);
  };

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

  const scoredNodes: ScoredNode[] = [];

  for (const node of nodes) {
    const tfMap = docTfs.get(node.id);
    const docNorm = docNorms.get(node.id);
    const docWeights = docWeightsList.get(node.id);

    if (!tfMap || !docWeights || docNorm === undefined || docNorm === 0) {
      scoredNodes.push({ node, score: 0 });
      continue;
    }

    // Skip zero-term scoring
    let hasOverlap = false;
    for (const token of queryTokens) {
      if (tfMap.has(token)) {
        hasOverlap = true;
        break;
      }
    }
    if (!hasOverlap) {
      scoredNodes.push({ node, score: 0 });
      continue;
    }

    let dotProduct = 0;
    for (const token of queryTf.keys()) {
      const qWeight = queryWeights.get(token) || 0;
      const dWeight = docWeights.get(token) || 0;
      dotProduct += qWeight * dWeight;
    }

    const similarity = dotProduct / (docNorm * queryNorm);
    scoredNodes.push({ node, score: similarity });
  }

  return scoredNodes
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.node);
}
