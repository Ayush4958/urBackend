export interface CollectionField {
  key: string;
  type: "String" | "Number" | "Boolean" | "Date" | "Object" | "Array" | "Ref";
  required: boolean;
  unique?: boolean;
  ref?: string;
  default?: unknown;
  fields?: CollectionField[];
}

export interface CollectionRLS {
  enabled: boolean;
  mode: "public-read" | "private" | "owner-write-only";
  ownerField: string;
  requireAuthForWrite: boolean;
}

export interface Collection {
  _id?: string;
  name: string;
  model: CollectionField[];
  rls?: CollectionRLS;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  publishableKey?: string;
  collections: Collection[];
  isAuthEnabled?: boolean;
  databaseUsed?: number;
  storageUsed?: number;
  updatedAt?: string;
}

export interface ProjectListItem {
  _id: string;
  name: string;
  description?: string;
  collections: Collection[];
  databaseUsed?: number;
  storageUsed?: number;
  updatedAt?: string;
}
