/** Shares the incident SSE connection state with headers deep in the mobile app. */
import { createContext } from 'react';
import type { StreamStatus } from '../../types';

export const StreamStatusContext = createContext<StreamStatus>('connecting');
