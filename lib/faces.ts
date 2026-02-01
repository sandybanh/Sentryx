import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
const LOCAL_FACES_KEY = 'demo_familiar_faces_v1';

export interface FamiliarFace {
  id: string;
  name: string;
  created_at: string;
  image_uri?: string;
}

async function loadLocalFaces(): Promise<FamiliarFace[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_FACES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalFaces(faces: FamiliarFace[]) {
  try {
    await AsyncStorage.setItem(LOCAL_FACES_KEY, JSON.stringify(faces));
  } catch {
    // Ignore local storage failures for demo mode
  }
}

export async function fetchFamiliarFaces(): Promise<{
  data: FamiliarFace[];
  error: string | null;
}> {
  const local = await loadLocalFaces();
  return { data: local, error: null };
}

export async function addFamiliarFace(
  name: string,
  imageUri: string
): Promise<{ ok: boolean; error?: string }> {
  const local = await loadLocalFaces();
  const newFace: FamiliarFace = {
    id: `local-${Date.now()}`,
    name,
    created_at: new Date().toISOString(),
    image_uri: imageUri,
  };
  await saveLocalFaces([newFace, ...local]);
  return { ok: true };
}

export async function deleteFamiliarFace(id: string): Promise<boolean> {
  const local = await loadLocalFaces();
  await saveLocalFaces(local.filter((face) => face.id !== id));
  return true;
}
