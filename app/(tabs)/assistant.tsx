import { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { supabase } from "@/lib/supabaseClient";
import { todayStr } from "@/lib/scheduling";

interface ChatMessage { role: "user" | "assistant"; text: string; }

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "Hi — I can see your timetable and tasks. Ask me to help plan today or decide what to cut." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send() {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setInput("");
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      const { data: todayTasks } = await supabase.from("tasks").select("title,status,start_time,end_time").eq("task_date", todayStr());
      const { data: pending } = await supabase.from("tasks").select("title,task_date").eq("status", "pending").lt("task_date", todayStr());
      const dow = new Date().getDay();
      const { data: classes } = await supabase.from("timetable_events").select("subject,start_time,end_time").eq("day_of_week", dow);

      const context = {
        goals: profile?.goals || "not set",
        field: profile?.field_of_study || "not set",
        wake: profile?.wake_time, sleep: profile?.sleep_time,
        todays_classes: classes, todays_tasks: todayTasks, overdue_tasks: pending,
      };

      const { data, error } = await supabase.functions.invoke("assistant", { body: { message: userMsg, context } });
      if (error) throw error;
      setMessages((m) => [...m, { role: "assistant", text: data?.reply || data?.error || "No response." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong reaching the assistant." }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container} keyboardVerticalOffset={90}>
      <ScrollView ref={scrollRef} style={styles.chatArea} contentContainerStyle={{ padding: 16 }}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={m.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAssistant}>{m.text}</Text>
          </View>
        ))}
        {loading && <Text style={styles.thinking}>thinking…</Text>}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          value={input} onChangeText={setInput} onSubmitEditing={send}
          placeholder="Ask about today, your goals, what to cut…" placeholderTextColor="#8B8FA3"
          style={styles.input}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}><Text style={styles.sendBtnText}>Send</Text></TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14171F" },
  chatArea: { flex: 1 },
  bubble: { maxWidth: "85%", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  bubbleUser: { backgroundColor: "#F2A65A", alignSelf: "flex-end" },
  bubbleAssistant: { backgroundColor: "#1E2230", alignSelf: "flex-start" },
  bubbleTextUser: { color: "#14171F", fontSize: 13 },
  bubbleTextAssistant: { color: "#EDEBE3", fontSize: 13 },
  thinking: { color: "#8B8FA3", fontSize: 11, marginLeft: 4 },
  inputRow: { flexDirection: "row", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#2A2F42" },
  input: { flex: 1, backgroundColor: "#1E2230", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: "#EDEBE3", fontSize: 13 },
  sendBtn: { backgroundColor: "#F2A65A", borderRadius: 12, paddingHorizontal: 18, justifyContent: "center" },
  sendBtnText: { color: "#14171F", fontWeight: "700", fontSize: 13 },
});
