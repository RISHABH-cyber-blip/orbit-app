import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabaseClient";
import { scheduleClassAlarm, cancelAlarm } from "@/lib/notifications";
import type { TimetableEvent } from "@/lib/types";

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const PALETTE = ["#F2A65A","#6FCF97","#7FB3F2","#E8735A","#C792EA","#5AD1C6"];

export default function Timetable() {
  const [events, setEvents] = useState<TimetableEvent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [subject, setSubject] = useState("");
  const [dayIdx, setDayIdx] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:55");

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("timetable_events").select("*").order("day_of_week").order("start_time");
    setEvents((data as TimetableEvent[]) || []);
  }

  async function handleUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "Allow photo access to upload your timetable."); return; }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;

    setUploading(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-timetable", {
        body: { imageBase64: result.assets[0].base64, mediaType: "image/jpeg" },
      });
      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      const { data: { user } } = await supabase.auth.getUser();
      for (let i = 0; i < fnData.events.length; i++) {
        const ev = fnData.events[i];
        const notifId = await scheduleClassAlarm(ev.day_of_week, ev.start_time, ev.subject);
        await supabase.from("timetable_events").insert({
          user_id: user!.id,
          day_of_week: ev.day_of_week,
          start_time: ev.start_time,
          end_time: ev.end_time,
          subject: ev.subject,
          color: PALETTE[i % PALETTE.length],
          alarm_enabled: true,
          notif_id: notifId,
        });
      }
      await load();
      Alert.alert("Done", "Timetable loaded and weekly alarms scheduled.");
    } catch (err: any) {
      Alert.alert("Couldn't read that timetable", err.message || "Try a clearer photo.");
    } finally {
      setUploading(false);
    }
  }

  async function addManual() {
    if (!subject.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const notifId = await scheduleClassAlarm(dayIdx, startTime, subject.trim());
    await supabase.from("timetable_events").insert({
      user_id: user!.id,
      day_of_week: dayIdx,
      start_time: startTime,
      end_time: endTime,
      subject: subject.trim(),
      color: PALETTE[events.length % PALETTE.length],
      alarm_enabled: true,
      notif_id: notifId,
    });
    setSubject("");
    load();
  }

  async function toggleAlarm(ev: TimetableEvent) {
    if (ev.alarm_enabled) {
      await cancelAlarm(ev.notif_id);
      await supabase.from("timetable_events").update({ alarm_enabled: false, notif_id: null }).eq("id", ev.id);
    } else {
      const notifId = await scheduleClassAlarm(ev.day_of_week, ev.start_time, ev.subject);
      await supabase.from("timetable_events").update({ alarm_enabled: true, notif_id: notifId }).eq("id", ev.id);
    }
    load();
  }

  async function deleteEvent(ev: TimetableEvent) {
    await cancelAlarm(ev.notif_id);
    await supabase.from("timetable_events").delete().eq("id", ev.id);
    load();
  }

  const byDay = DAY_NAMES.map((name, idx) => ({ name, idx, events: events.filter((e) => e.day_of_week === idx) }));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upload a photo</Text>
        <TouchableOpacity onPress={handleUpload} style={styles.primaryBtn} disabled={uploading}>
          <Text style={styles.primaryBtnText}>{uploading ? "Reading timetable…" : "Choose timetable photo"}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>AI reads it and schedules a weekly alarm for every class automatically.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Or add one manually</Text>
        <View style={styles.dayRow}>
          {DAY_NAMES.map((d, i) => (
            <TouchableOpacity key={i} onPress={() => setDayIdx(i)} style={[styles.dayChip, dayIdx === i && styles.dayChipActive]}>
              <Text style={[styles.dayChipText, dayIdx === i && styles.dayChipTextActive]}>{d.slice(0, 3)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor="#8B8FA3" style={[styles.input, { flex: 1 }]} />
          <TextInput value={endTime} onChangeText={setEndTime} placeholder="09:55" placeholderTextColor="#8B8FA3" style={[styles.input, { flex: 1 }]} />
        </View>
        <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor="#8B8FA3" style={styles.input} />
        <TouchableOpacity onPress={addManual} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Add class</Text>
        </TouchableOpacity>
      </View>

      {byDay.filter((d) => d.events.length).map((d) => (
        <View key={d.idx} style={{ marginBottom: 16 }}>
          <Text style={styles.dayHeader}>{d.name}</Text>
          {d.events.map((ev) => (
            <View key={ev.id} style={[styles.classRow, { borderLeftColor: ev.color }]}>
              <Text style={styles.classTime}>{ev.start_time}–{ev.end_time}</Text>
              <Text style={styles.classSubject}>{ev.subject}</Text>
              <Switch value={ev.alarm_enabled} onValueChange={() => toggleAlarm(ev)} trackColor={{ true: "#6FCF97", false: "#2A2F42" }} />
              <TouchableOpacity onPress={() => deleteEvent(ev)}><Text style={styles.deleteX}>✕</Text></TouchableOpacity>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14171F" },
  card: { backgroundColor: "#1E2230", borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { color: "#EDEBE3", fontWeight: "700", fontSize: 14, marginBottom: 10 },
  primaryBtn: { backgroundColor: "#F2A65A", borderRadius: 12, padding: 12, alignItems: "center" },
  primaryBtnText: { color: "#14171F", fontWeight: "700", fontSize: 13 },
  secondaryBtn: { backgroundColor: "#181B26", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 12, padding: 12, alignItems: "center", marginTop: 4 },
  secondaryBtnText: { color: "#EDEBE3", fontWeight: "600", fontSize: 13 },
  hint: { color: "#8B8FA3", fontSize: 11, marginTop: 8 },
  input: { backgroundColor: "#181B26", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 10, padding: 10, color: "#EDEBE3", marginBottom: 8, fontSize: 13 },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  dayChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#181B26" },
  dayChipActive: { backgroundColor: "#F2A65A" },
  dayChipText: { color: "#8B8FA3", fontSize: 11 },
  dayChipTextActive: { color: "#14171F", fontWeight: "700" },
  dayHeader: { color: "#F2A65A", fontWeight: "700", fontSize: 13, marginBottom: 8 },
  classRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#181B26", borderRadius: 10, padding: 10, marginBottom: 6, borderLeftWidth: 3 },
  classTime: { color: "#8B8FA3", fontSize: 11, minWidth: 85 },
  classSubject: { color: "#EDEBE3", fontSize: 13, flex: 1 },
  deleteX: { color: "#8B8FA3", fontSize: 13, paddingHorizontal: 4 },
});
