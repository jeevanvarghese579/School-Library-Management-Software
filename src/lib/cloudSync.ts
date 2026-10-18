import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';

const pendingOperations = new Set<Promise<unknown>>();
const listeners = new Set<(count: number) => void>();

function notify() {
  listeners.forEach((listener) => listener(pendingOperations.size));
}

export function trackCloudOperation<T>(operation: Promise<T>): Promise<T> {
  pendingOperations.add(operation);
  notify();
  const finish = () => {
    pendingOperations.delete(operation);
    notify();
  };
  operation.then(finish, finish);
  return operation;
}

export function subscribeToCloudSync(listener: (count: number) => void) {
  listeners.add(listener);
  listener(pendingOperations.size);
  return () => {
    listeners.delete(listener);
  };
}

export async function waitForCloudSync() {
  while (pendingOperations.size > 0) {
    await Promise.allSettled([...pendingOperations]);
  }
  await waitForPendingWrites(db);
}
