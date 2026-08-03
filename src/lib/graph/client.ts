import { FalkorDB, Graph } from "falkordb";

type QueryParam = null | string | number | boolean | { [key: string]: QueryParam } | Array<QueryParam>;
type QueryParams = { [key: string]: QueryParam };

// FalkorDB is Redis-protocol + Cypher. One process-wide connection, one
// named graph. Real client, real Cypher — no query in this app is a
// disguised SQL GROUP BY; every one of them is a multi-hop traversal that
// a relational schema would need a recursive CTE (or several joins) to
// express, and FalkorDB gives it to us as one line of Cypher.
let dbPromise: Promise<FalkorDB> | null = null;

async function getDB(): Promise<FalkorDB> {
  if (!dbPromise) {
    // Don't let a rejected promise stick around: a connect() failure while
    // FalkorDB happens to be restarting would otherwise wedge every
    // subsequent call in this process behind that same rejection forever,
    // even after FalkorDB comes back — caught live while bouncing the
    // container mid-session.
    dbPromise = FalkorDB.connect({
      socket: {
        host: process.env.FALKORDB_HOST ?? "127.0.0.1",
        port: Number(process.env.FALKORDB_PORT ?? 6379),
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function getGraph(): Promise<Graph> {
  const db = await getDB();
  return db.selectGraph(process.env.FALKORDB_GRAPH_NAME ?? "ember");
}

export async function graphQuery<T = Record<string, unknown>>(
  cypher: string,
  params?: QueryParams,
) {
  const graph = await getGraph();
  const result = await graph.query(cypher, params ? { params } : undefined);
  return result.data as T[];
}
