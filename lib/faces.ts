import { supabase } from '@/lib/supabase';

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:5000';

export interface FamiliarFace {
  id: string;
  name: string;
  created_at: string;
}

export async function fetchFamiliarFaces(): Promise<FamiliarFace[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const res = await fetch(`${BACKEND_URL}/api/faces?user_id=${user.id}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.faces ?? [];
  } catch {
    return [];
  }
}

export async function addFamiliarFace(
  name: string,
  imageUri: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  try {
    const formData = new FormData();
    formData.append('image', {
      uri: imageUri,
      name: 'face.jpg',
      type: 'image/jpeg',
    } as any);
    formData.append('user_id', user.id);
    formData.append('name', name);

    const res = await fetch(`${BACKEND_URL}/api/faces`, {
      method: 'POST',
      headers: { 'X-User-Id': user.id },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      return { ok: false, error: err.error ?? 'Failed to add face' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteFamiliarFace(id: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  try {
    const res = await fetch(`${BACKEND_URL}/api/faces/${id}?user_id=${user.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': user.id },
    });
    return res.ok;
  } catch {
    return false;
  }
}
