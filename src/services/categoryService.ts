import {
  collection,
  doc,
  setDoc,
  query as fsQuery,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { ProductCategory } from '@/types';
import { generateId } from '@/utils/uuid';
import { db } from './firebase';

const COLLECTION = 'categories';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(snap: { id: string; data(): Record<string, any> | undefined }): ProductCategory {
  const d = snap.data()!;
  return { id: snap.id, name: d.name, createdAt: d.createdAt };
}

export const categoryService = {
  async create(name: string): Promise<ProductCategory> {
    const id = generateId();
    const now = Date.now();
    await setDoc(doc(db, COLLECTION, id), { name: name.trim(), createdAt: now });
    return { id, name: name.trim(), createdAt: now };
  },

  async delete(id: string): Promise<void> {
    const batch = writeBatch(db);
    const { getDocs } = await import('firebase/firestore');
    const products = await getDocs(fsQuery(collection(db, 'products'), where('categoryId', '==', id)));
    products.docs.forEach((d) =>
      batch.update(d.ref, { categoryId: null, categoryName: null, updatedAt: Date.now() }),
    );
    batch.delete(doc(db, COLLECTION, id));
    await batch.commit();
  },

  subscribeToAll(callback: (categories: ProductCategory[]) => void): () => void {
    return onSnapshot(fsQuery(collection(db, COLLECTION), orderBy('name', 'asc')), (snap) =>
      callback(snap.docs.map(mapDoc)),
    );
  },
};
