import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query as fsQuery,
  where,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { Product, CreateProductDTO, UpdateProductDTO } from '@/types';
import { generateId } from '@/utils/uuid';
import { db } from './firebase';

const COLLECTION = 'products';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDoc(snap: { id: string; data(): Record<string, any> | undefined }): Product {
  const d = snap.data()!;
  return {
    id: snap.id,
    name: d.name,
    sku: d.sku ?? '',
    color: d.color,
    size: d.size ?? '',
    categoryId: d.categoryId ?? null,
    categoryName: d.categoryName ?? null,
    qrCode: d.qrCode ?? null,
    imageUri: d.imageUri ?? null,
    price: d.price,
    costPrice: d.costPrice ?? 0,
    stock: d.stock,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export const productService = {
  async getAll(categoryId?: string | null): Promise<Product[]> {
    const constraints = categoryId
      ? [orderBy('createdAt', 'desc'), where('categoryId', '==', categoryId)]
      : [orderBy('createdAt', 'desc')];
    const snap = await getDocs(fsQuery(collection(db, COLLECTION), ...constraints));
    return snap.docs.map(mapDoc);
  },

  async search(query: string, categoryId?: string | null): Promise<Product[]> {
    const all = await productService.getAll(categoryId);
    const q = query.toLowerCase();
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        (p.size ?? '').toLowerCase().includes(q),
    );
  },

  async getById(id: string): Promise<Product | null> {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? mapDoc(snap) : null;
  },

  async create(data: CreateProductDTO, categoryName?: string | null): Promise<Product> {
    const id = generateId();
    const now = Date.now();
    const docData: Record<string, unknown> = {
      name: data.name,
      sku: data.sku ?? '',
      color: data.color,
      size: data.size ?? '',
      categoryId: data.categoryId ?? null,
      categoryName: categoryName ?? null,
      qrCode: data.qrCode ?? null,
      imageUri: data.imageUri ?? null,
      price: data.price,
      costPrice: data.costPrice ?? 0,
      stock: data.stock,
      createdAt: now,
      updatedAt: now,
    };
    await setDoc(doc(db, COLLECTION, id), docData);
    return {
      id,
      name: data.name,
      sku: data.sku ?? '',
      color: data.color,
      size: data.size ?? '',
      categoryId: data.categoryId ?? null,
      categoryName: categoryName ?? null,
      qrCode: data.qrCode ?? null,
      imageUri: data.imageUri ?? null,
      price: data.price,
      costPrice: data.costPrice ?? 0,
      stock: data.stock,
      createdAt: now,
      updatedAt: now,
    };
  },

  async update(id: string, data: UpdateProductDTO & { categoryName?: string | null }): Promise<void> {
    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) updates.name = data.name;
    if (data.sku !== undefined) updates.sku = data.sku;
    if (data.color !== undefined) updates.color = data.color;
    if (data.size !== undefined) updates.size = data.size;
    if (data.categoryId !== undefined) updates.categoryId = data.categoryId ?? null;
    if (data.categoryName !== undefined) updates.categoryName = data.categoryName ?? null;
    if (data.qrCode !== undefined) updates.qrCode = data.qrCode ?? null;
    if (data.imageUri !== undefined) updates.imageUri = data.imageUri ?? null;
    if (data.price !== undefined) updates.price = data.price;
    if (data.costPrice !== undefined) updates.costPrice = data.costPrice;
    if (data.stock !== undefined) updates.stock = data.stock;
    await updateDoc(doc(db, COLLECTION, id), updates);
  },

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, id));
  },

  subscribeToAll(callback: (products: Product[]) => void, categoryId?: string | null): () => void {
    const constraints = categoryId
      ? [orderBy('createdAt', 'desc'), where('categoryId', '==', categoryId)]
      : [orderBy('createdAt', 'desc')];
    return onSnapshot(fsQuery(collection(db, COLLECTION), ...constraints), (snap) =>
      callback(snap.docs.map(mapDoc)),
    );
  },
};
