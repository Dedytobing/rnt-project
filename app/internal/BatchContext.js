'use client';

import { createContext } from 'react';

export const BatchContext = createContext({ selectedBatch: null });

export function candidatesUrl(batchId, stage) {
  const params = new URLSearchParams();
  if (stage) params.set('stage', stage);
  if (batchId) params.set('batch_id', batchId);
  return `/api/candidates?${params.toString()}`;
}
