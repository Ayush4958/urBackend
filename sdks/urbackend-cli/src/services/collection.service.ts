import { apiFetch } from "../core/api.js";
import type { Collection } from "../types/project.js";

interface CollectionResponse {
  data: Collection;
  message: string;
}

/**
 * Creates a new collection inside a project.
 * Endpoint: POST /projects/:projectId/collections
 */
export async function createCollection(
  projectId: string,
  payload: { name: string; model: Collection["model"] },
): Promise<Collection> {
  const res = await apiFetch<CollectionResponse>(
    `/projects/${projectId}/collections`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return res.data;
}

/**
 * Deletes a collection from a project.
 * Endpoint: DELETE /projects/:projectId/collections/:collectionName
 */
export async function deleteCollection(
  projectId: string,
  collectionName: string,
): Promise<void> {
  const encodedName = encodeURIComponent(collectionName);
  return apiFetch<void>(
    `/projects/${projectId}/collections/${encodedName}`,
    { method: "DELETE" },
  );
}
