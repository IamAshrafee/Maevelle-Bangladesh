import { startWorker, installWorkerShutdownHandlers } from '../apps/worker/src/server.ts';
import { phase07aConfig, assertPhase07aTarget } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const worker = await startWorker(phase07aConfig);
installWorkerShutdownHandlers(worker);
