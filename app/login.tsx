import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      // navigation handled automatically by the root layout's auth listener
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>ORBIT</Text>
        <Text style={styles.tagline}>{mode === "login" ? "Welcome back." : "Create your account."}</Text>

        <TextInput
          placeholder="Email" placeholderTextColor="#8B8FA3" autoCapitalize="none" keyboardType="email-address"
          value={email} onChangeText={setEmail} style={styles.input}
        />
        <TextInput
          placeholder="Password" placeholderTextColor="#8B8FA3" secureTextEntry
          value={password} onChangeText={setPassword} style={styles.input}
        />
        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity onPress={submit} disabled={loading} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === "login" ? "signup" : "login")}>
          <Text style={styles.switchText}>{mode === "login" ? "No account? Sign up" : "Already have an account? Log in"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14171F", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#1E2230", borderRadius: 20, padding: 28 },
  brand: { color: "#EDEBE3", fontSize: 28, fontWeight: "700", letterSpacing: 2 },
  tagline: { color: "#8B8FA3", fontSize: 13, marginTop: 4, marginBottom: 20 },
  input: { backgroundColor: "#181B26", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 12, padding: 14, color: "#EDEBE3", marginBottom: 12, fontSize: 14 },
  error: { color: "#E8735A", fontSize: 12, marginBottom: 10 },
  primaryBtn: { backgroundColor: "#F2A65A", borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 10 },
  primaryBtnText: { color: "#14171F", fontWeight: "700", fontSize: 14 },
  switchText: { color: "#8B8FA3", fontSize: 12, textAlign: "center" },
});
