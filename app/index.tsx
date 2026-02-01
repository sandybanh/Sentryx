import { useAuthStore } from '@/store/auth';
import { Redirect } from 'expo-router';

export default function Index() {
  const { user, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return null;
  }

  if (user) {
    return <Redirect href="/(main)/camera" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
