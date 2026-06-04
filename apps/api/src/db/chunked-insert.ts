import type { BatchItem } from 'drizzle-orm/batch';

// Cloudflare D1은 한 쿼리의 바인딩 변수를 최대 100개로 제한한다.
// 여러 행을 한 INSERT VALUES로 넣으면 (행 수 × 컬럼 수)가 그 한도를 넘을 수 있어, 행을 청크로 쪼갠다.
const D1_MAX_VARS = 100;

// values를 컬럼 수에 맞춰 청크로 나누고, 각 청크를 build로 INSERT 문으로 만들어 배치 항목 배열로 돌려준다.
// 빈 배열이면 빈 배열(INSERT 생략). 컬럼 수는 첫 행의 키 수로 추정한다(모든 행이 같은 형태라는 전제).
export function chunkedInserts<T extends object>(
  values: T[],
  build: (chunk: T[]) => BatchItem<'sqlite'>,
): Array<BatchItem<'sqlite'>> {
  if (values.length === 0) {
    return [];
  }
  const columnsPerRow = Math.max(1, Object.keys(values[0]).length);
  const rowsPerChunk = Math.max(1, Math.floor(D1_MAX_VARS / columnsPerRow));

  const out: Array<BatchItem<'sqlite'>> = [];
  for (let i = 0; i < values.length; i += rowsPerChunk) {
    out.push(build(values.slice(i, i + rowsPerChunk)));
  }

  return out;
}
