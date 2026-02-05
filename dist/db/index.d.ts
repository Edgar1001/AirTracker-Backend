import { Pool, QueryResult, QueryResultRow } from 'pg';
declare const pool: Pool;
export declare const query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
export { pool };
//# sourceMappingURL=index.d.ts.map