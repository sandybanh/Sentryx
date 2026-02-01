import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function EmergencyContactsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/(main)/emergency-contacts');
  }, [router]);

  return null;
}
