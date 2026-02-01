import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Input, Logo, ScreenContainer, Header } from '@/components/ui';
import { useAuthStore } from '@/store/auth';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const validateForm = (): boolean => {
    let isValid = true;
    clearError();
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Please enter a valid email');
      isValid = false;
    }

    if (!password) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }

    return isValid;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    const { error } = await signIn(email.trim().toLowerCase(), password);

    if (!error) {
      router.replace('/(main)/home');
    }
  };

  return (
    <ScreenContainer scroll avoidKeyboard>
      <Header showBack />

      <View style={styles.content}>
        <View style={styles.header}>
          <Logo size="sm" showText={false} />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setEmailError('');
            }}
            keyboardType="email-address"
            autoComplete="email"
            leftIcon="mail-outline"
            error={emailError}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError('');
            }}
            secureTextEntry
            autoComplete="password"
            leftIcon="lock-closed-outline"
            error={passwordError}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            size="lg"
            fullWidth
          />

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.footerLink}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  title: {
    ...Typography.sizes['2xl'],
    fontWeight: Typography.weights.bold,
    color: Colors.neutral[0],
    marginTop: Spacing.lg,
  },
  subtitle: {
    ...Typography.sizes.base,
    color: Colors.neutral[100],
    marginTop: Spacing.xs,
  },
  form: {
    gap: Spacing.xs,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.sizes.sm,
    color: Colors.error,
    textAlign: 'center',
  },
  forgotPassword: {
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
  forgotPasswordText: {
    ...Typography.sizes.sm,
    color: Colors.primary[500],
    fontWeight: Typography.weights.medium,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: Spacing['2xl'],
  },
  footerText: {
    ...Typography.sizes.base,
    color: Colors.neutral[100],
  },
  footerLink: {
    ...Typography.sizes.base,
    color: Colors.primary[500],
    fontWeight: Typography.weights.semibold,
  },
});
