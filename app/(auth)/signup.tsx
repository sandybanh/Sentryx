import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

import { Button, Input, Logo, ScreenContainer, Header } from '@/components/ui';
import { useAuthStore } from '@/store/auth';
import { Colors, Typography, Spacing } from '@/constants/theme';

export default function SignupScreen() {
  const router = useRouter();
  const { signUp, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const validateForm = (): boolean => {
    let isValid = true;
    clearError();
    setEmailError('');
    setPasswordError('');
    setConfirmError('');

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

    if (!confirmPassword) {
      setConfirmError('Please confirm your password');
      isValid = false;
    } else if (password !== confirmPassword) {
      setConfirmError('Passwords do not match');
      isValid = false;
    }

    return isValid;
  };

  const handleSignup = async () => {
    if (!validateForm()) return;

    const { error } = await signUp(email.trim().toLowerCase(), password);

    if (!error) {
      Alert.alert(
        'Emergency contacts',
        'Next, choose 3 emergency contacts. If email confirmation is required, you can finish after verifying.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/emergency-contacts') }]
      );
    }
  };

  return (
    <ScreenContainer scroll avoidKeyboard>
      <Header showBack />

      <View style={styles.content}>
        <View style={styles.header}>
          <Logo size="sm" showText={false} />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start monitoring your car today</Text>
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
            placeholder="Create a password"
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

          <Input
            label="Confirm Password"
            placeholder="Confirm your password"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setConfirmError('');
            }}
            secureTextEntry
            autoComplete="password"
            leftIcon="lock-closed-outline"
            error={confirmError}
          />

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Button
            title="Create Account"
            onPress={handleSignup}
            loading={isLoading}
            size="lg"
            fullWidth
          />

          <Text style={styles.terms}>
            By signing up, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
            <Text style={styles.footerLink}>Sign in</Text>
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
  terms: {
    ...Typography.sizes.sm,
    color: Colors.neutral[100],
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  termsLink: {
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
