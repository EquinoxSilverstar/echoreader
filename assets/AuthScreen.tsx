import React, { useState } from 'react';
import {
  Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from './src/Theme';
import { Icon } from './src/Icon';

type Props = {
  onContinueAsGuest: () => void;
};

type AuthMode = 'signIn' | 'createAccount';

export default function AuthScreen({ onContinueAsGuest }: Props) {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState('');

  const isCreatingAccount = mode === 'createAccount';

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage('');
  };

  const submit = () => {
    const normalizedEmail = email.trim();
    if (isCreatingAccount && !name.trim()) {
      setMessage('Enter your name to create an account.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setMessage('Enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setMessage('Your password must be at least 8 characters.');
      return;
    }

    setMessage('Authentication is not connected yet. Continue as a guest to explore EchoReader.');
  };

  const requestPasswordReset = () => {
    setMessage('Password reset will be available when authentication is connected.');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Image source={require('./EchoReaderLogo.jpeg')} style={styles.logo} />
            <Text style={styles.brand}>EchoReader</Text>
            <Text style={styles.tagline}>Your next chapter is just a listen away.</Text>

            <View style={styles.modeTabs}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: !isCreatingAccount }}
                style={[styles.modeTab, !isCreatingAccount && styles.modeTabActive]}
                onPress={() => changeMode('signIn')}
              >
                <Text style={[styles.modeTabText, !isCreatingAccount && styles.modeTabTextActive]}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: isCreatingAccount }}
                style={[styles.modeTab, isCreatingAccount && styles.modeTabActive]}
                onPress={() => changeMode('createAccount')}
              >
                <Text style={[styles.modeTabText, isCreatingAccount && styles.modeTabTextActive]}>Create account</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.heading}>{isCreatingAccount ? 'Create your account' : 'Welcome back'}</Text>
            <Text style={styles.description}>
              {isCreatingAccount ? 'Save your place and keep your library close.' : 'Sign in to pick up where you left off.'}
            </Text>

            {isCreatingAccount && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Name</Text>
                <View style={styles.inputWrap}>
                  <Icon name="person-outline" size={18} color={C.textMuted} />
                  <TextInput
                    accessibilityLabel="Name"
                    style={styles.input}
                    placeholder="Your name"
                    placeholderTextColor={C.textMuted}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Icon name="mail-outline" size={18} color={C.textMuted} />
                <TextInput
                  accessibilityLabel="Email"
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={C.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Password</Text>
                {!isCreatingAccount && (
                  <TouchableOpacity onPress={requestPasswordReset} accessibilityRole="button">
                    <Text style={styles.link}>Forgot password?</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.inputWrap}>
                <Icon name="lock-closed-outline" size={18} color={C.textMuted} />
                <TextInput
                  accessibilityLabel="Password"
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={C.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!passwordVisible}
                  textContentType={isCreatingAccount ? 'newPassword' : 'password'}
                  returnKeyType="done"
                  onSubmitEditing={submit}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  hitSlop={8}
                >
                  <Icon name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={19} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {!!message && (
              <View style={styles.messageBox} accessibilityLiveRegion="polite">
                <Icon name="information-circle-outline" size={18} color={C.cyan} />
                <Text style={styles.messageText}>{message}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.submitButton} onPress={submit} activeOpacity={0.85}>
              <Text style={styles.submitText}>{isCreatingAccount ? 'Create account' : 'Sign in'}</Text>
              <Icon name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.guestButton} onPress={onContinueAsGuest} activeOpacity={0.8}>
              <Icon name="headset-outline" size={18} color={C.cyan} />
              <Text style={styles.guestText}>Continue as a guest</Text>
            </TouchableOpacity>

            <Text style={styles.footerText}>Listen to your books, your way.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  keyboardAvoiding: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 28 },
  card: {
    width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'stretch',
    backgroundColor: C.surface, borderRadius: 28, borderWidth: 1, borderColor: C.border, padding: 26,
  },
  logo: {
    width: 76, height: 76, borderRadius: 38, alignSelf: 'center', marginBottom: 10,
    shadowColor: C.purple, shadowOpacity: 0.75, shadowRadius: 16, shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  brand: { color: C.text, fontSize: 23, fontWeight: '800', textAlign: 'center', letterSpacing: 0.4 },
  tagline: { color: C.textMuted, fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 24 },
  modeTabs: {
    flexDirection: 'row', backgroundColor: C.bg, borderRadius: 13, padding: 4, marginBottom: 24,
    borderWidth: 1, borderColor: C.border,
  },
  modeTab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  modeTabActive: { backgroundColor: C.purple },
  modeTabText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  modeTabTextActive: { color: '#fff' },
  heading: { color: C.text, fontSize: 22, fontWeight: '800' },
  description: { color: C.textDim, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  fieldGroup: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { color: C.textDim, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  link: { color: C.cyan, fontSize: 12, fontWeight: '700', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14,
    backgroundColor: C.bg, borderRadius: 13, borderWidth: 1, borderColor: C.border,
  },
  input: { flex: 1, minWidth: 0, color: C.text, fontSize: 14, paddingVertical: 13 },
  messageBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, marginBottom: 14,
    backgroundColor: C.surfaceAlt, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: C.cyan,
  },
  messageText: { flex: 1, color: C.textDim, fontSize: 12, lineHeight: 18 },
  submitButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, minHeight: 52,
    backgroundColor: C.purple, borderRadius: 14, borderWidth: 1, borderColor: C.magenta,
    shadowColor: C.purple, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  divider: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  guestButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, minHeight: 50,
    backgroundColor: C.surfaceAlt, borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  guestText: { color: C.text, fontSize: 14, fontWeight: '700' },
  footerText: { color: C.textMuted, textAlign: 'center', fontSize: 11, marginTop: 22 },
});
