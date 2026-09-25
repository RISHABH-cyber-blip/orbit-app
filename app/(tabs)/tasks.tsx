import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert } from "react-native";
import { supabase } from "@/lib/supabaseClient";
import { findFreeSlot, findSlotSmart, addDays, dayOfWeekFromDate, diffMinutes, todayStr } from "@/lib/scheduling";
import { scheduleTaskAlarm, cancelAlarm } from "@/lib/notifications";
import type { Task, Profile, TimetableEvent } from "@/lib/types";
import * as Notifications from "expo-notifications";

type Tab = "today" | "pending" | "later";

export default function Tasks() {
  const [tab, setTab] = useState<Tab>("today");
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [laterTasks, setLaterTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [profile, setProfile] = useState<Pick<Profile, "wake_time" | "sleep_time">>({ wake_time: "07:00", sleep_time: "23:00" });
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { init(); }, []);

  async function debugCheckAlarms() {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    Alert.alert("Scheduled alarms", `${scheduled.length} pending:\n` + scheduled.map(s => s.content.body).join("\n"));
  }

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    const p = (prof as Profile) || profile;
    if (prof) setProfile(prof as Profile);
    await rolloverOverdue(p);
    await loadAll();
  }

  async function loadAll() {
    const { data: today } = await supabase.from("tasks").select("*").eq("task_date", todayStr()).neq("status", "later").order("start_time");
    const { data: pending } = await supabase.from("tasks").select("*").eq("status", "pending").lt("task_date", todayStr()).order("task_date");
    const { data: later } = await supabase.from("tasks").select("*").eq("status", "later").order("original_date", { ascending: false });
    setTodayTasks((today as Task[]) || []);
    setPendingTasks((pending as Task[]) || []);
    setLaterTasks((later as Task[]) || []);
  }

  async function rolloverOverdue(prof: Pick<Profile, "wake_time" | "sleep_time">) {
    const { data: overdue } = await supabase.from("tasks").select("*").eq("status", "pending").lt("task_date", todayStr());
    if (!overdue || !overdue.length) return;
    const dow = dayOfWeekFromDate(todayStr());
    const { data: classes } = await supabase.from("timetable_events").select("*").eq("day_of_week", dow);
    const { data: existingToday } = await supabase.from("tasks").select("*").eq("task_date", todayStr());
    let busy: { start_time: string | null; end_time: string | null }[] = [...((classes as TimetableEvent[]) || []), ...((existingToday as Task[]) || [])];
    for (const t of overdue as Task[]) {
      const dur = t.start_time && t.end_time ? diffMinutes(t.start_time, t.end_time) : 30;
      const slot = findFreeSlot(busy, dur, prof.wake_time, prof.sleep_time);
      if (slot) {
        await cancelAlarm(t.notif_id);
        const notifId = t.alarm_enabled ? await scheduleTaskAlarm(todayStr(), slot.start, t.title) : null;
        await supabase.from("tasks").update({ task_date: todayStr(), start_time: slot.start, end_time: slot.end, notif_id: notifId }).eq("id", t.id);
        busy.push({ start_time: slot.start, end_time: slot.end });
      }
    }
  }

  async function addTask() {
    if (!newTitle.trim() || !userId) return;
    const dow = dayOfWeekFromDate(todayStr());
    const { data: classes } = await supabase.from("timetable_events").select("*").eq("day_of_week", dow);
    const busy = [...((classes as TimetableEvent[]) || []), ...todayTasks];
    const slot = findSlotSmart(busy, 30, profile.wake_time, profile.sleep_time);
    const notifId = slot ? await scheduleTaskAlarm(todayStr(), slot.start, newTitle.trim()) : null;
    if (slot?.note) Alert.alert("Scheduled", slot.note);

    await supabase.from("tasks").insert({
      user_id: userId,
      title: newTitle.trim(),
      task_date: todayStr(),
      original_date: todayStr(),
      start_time: slot?.start || null,
      end_time: slot?.end || null,
      status: "pending",
      alarm_enabled: true,
      notif_id: notifId,
    });
    setNewTitle("");
    loadAll();
  }

  async function markDone(t: Task) {
    await cancelAlarm(t.notif_id);
    await supabase.from("tasks").update({ status: "done" }).eq("id", t.id);
    loadAll();
  }
  async function rejectTask(t: Task) {
    await cancelAlarm(t.notif_id);
    await supabase.from("tasks").update({ status: "rejected" }).eq("id", t.id);
    loadAll();
  }
  async function deleteTask(t: Task) {
    await cancelAlarm(t.notif_id);
    await supabase.from("tasks").delete().eq("id", t.id);
    loadAll();
  }
  async function skipTask(task: Task) {
    const tomorrow = addDays(todayStr(), 1);
    const dow = dayOfWeekFromDate(tomorrow);
    const { data: classes } = await supabase.from("timetable_events").select("*").eq("day_of_week", dow);
    const { data: tomorrowTasks } = await supabase.from("tasks").select("*").eq("task_date", tomorrow);
    const dur = task.start_time && task.end_time ? diffMinutes(task.start_time, task.end_time) : 30;
    const slot = findFreeSlot([...((classes as TimetableEvent[]) || []), ...((tomorrowTasks as Task[]) || [])], dur, profile.wake_time, profile.sleep_time);
    await cancelAlarm(task.notif_id);
    const notifId = slot && task.alarm_enabled ? await scheduleTaskAlarm(tomorrow, slot.start, task.title) : null;
    await supabase.from("tasks").update({ task_date: tomorrow, start_time: slot?.start || null, end_time: slot?.end || null, status: "pending", notif_id: notifId }).eq("id", task.id);
    loadAll();
  }
  async function shiftTask(task: Task) {
    const dow = dayOfWeekFromDate(todayStr());
    const { data: classes } = await supabase.from("timetable_events").select("*").eq("day_of_week", dow);
    const others = todayTasks.filter((t) => t.id !== task.id);
    const dur = task.start_time && task.end_time ? diffMinutes(task.start_time, task.end_time) : 30;
    const slot = findFreeSlot([...((classes as TimetableEvent[]) || []), ...others], dur, profile.wake_time, profile.sleep_time);
    if (slot) {
      await cancelAlarm(task.notif_id);
      const notifId = task.alarm_enabled ? await scheduleTaskAlarm(todayStr(), slot.start, task.title) : null;
      await supabase.from("tasks").update({ start_time: slot.start, end_time: slot.end, notif_id: notifId }).eq("id", task.id);
      loadAll();
    }
  }
  async function sendLater(t: Task) {
    await cancelAlarm(t.notif_id);
    await supabase.from("tasks").update({ status: "later", notif_id: null }).eq("id", t.id);
    loadAll();
  }
  async function restoreFromLater(task: Task) {
    const dow = dayOfWeekFromDate(todayStr());
    const { data: classes } = await supabase.from("timetable_events").select("*").eq("day_of_week", dow);
    const slot = findFreeSlot([...((classes as TimetableEvent[]) || []), ...todayTasks], 30, profile.wake_time, profile.sleep_time);
    const notifId = slot ? await scheduleTaskAlarm(todayStr(), slot.start, task.title) : null;
    await supabase.from("tasks").update({ status: "pending", task_date: todayStr(), start_time: slot?.start || null, end_time: slot?.end || null, notif_id: notifId }).eq("id", task.id);
    loadAll();
  }
  async function toggleAlarm(t: Task) {
    if (t.alarm_enabled) {
      await cancelAlarm(t.notif_id);
      await supabase.from("tasks").update({ alarm_enabled: false, notif_id: null }).eq("id", t.id);
    } else {
      const notifId = t.start_time ? await scheduleTaskAlarm(t.task_date, t.start_time, t.title) : null;
      await supabase.from("tasks").update({ alarm_enabled: true, notif_id: notifId }).eq("id", t.id);
    }
    loadAll();
  }

  const activeTodayTasks = todayTasks.filter((t) => t.status === "pending");
  const completedToday = todayTasks.filter((t) => t.status === "done" || t.status === "rejected");
  const list = tab === "today" ? activeTodayTasks : tab === "pending" ? pendingTasks : laterTasks;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.tabRow}>
        {(["today", "pending", "later"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabChip, tab === t && styles.tabChipActive]}>
            <Text style={[styles.tabChipText, tab === t && styles.tabChipTextActive]}>
              {t}{t === "pending" && pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "today" && (
        <View style={[styles.card, { flexDirection: "row", gap: 8 }]}>
          <TextInput value={newTitle} onChangeText={setNewTitle} onSubmitEditing={addTask} placeholder="Add a task…" placeholderTextColor="#8B8FA3" style={[styles.input, { flex: 1, marginBottom: 0 }]} />
          <TouchableOpacity onPress={addTask} style={styles.addBtn}><Text style={styles.addBtnText}>Add</Text></TouchableOpacity>
        </View>
      )}

      {list.length === 0 && (
        <Text style={styles.emptyText}>
          {tab === "today" && "Nothing scheduled yet."}
          {tab === "pending" && "Nothing overdue. Clean slate."}
          {tab === "later" && "No parked tasks."}
        </Text>
      )}

      {list.map((t) => (
        <View key={t.id} style={styles.taskCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {tab !== "later" && (
              <TouchableOpacity onPress={() => markDone(t)} style={[styles.checkbox, t.status === "done" && styles.checkboxDone]}>
                {t.status === "done" && <Text style={{ color: "#14171F", fontSize: 11 }}>✓</Text>}
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.taskTitle, t.status === "done" && styles.taskTitleDone]}>{t.title}</Text>
              {t.start_time && <Text style={styles.taskTime}>{t.start_time} – {t.end_time}</Text>}
              {tab === "pending" && <Text style={styles.overdueText}>overdue from {t.task_date}</Text>}
              {tab === "later" && <Text style={styles.parkedText}>parked since {t.original_date}</Text>}
            </View>
            {tab !== "later" && t.start_time && (
              <Switch value={t.alarm_enabled} onValueChange={() => toggleAlarm(t)} trackColor={{ true: "#6FCF97", false: "#2A2F42" }} />
            )}
          </View>
          <View style={styles.actionRow}>
            {tab === "today" && t.status === "pending" && (
              <>
                <TouchableOpacity onPress={() => shiftTask(t)} style={styles.actionBtn}><Text style={styles.actionBtnText}>Shift</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => skipTask(t)} style={styles.actionBtn}><Text style={styles.actionBtnText}>Skip</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => sendLater(t)} style={styles.actionBtn}><Text style={styles.actionBtnText}>Later</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => rejectTask(t)} style={styles.actionBtn}><Text style={[styles.actionBtnText, { color: "#E8735A" }]}>Reject</Text></TouchableOpacity>
              </>
            )}
            {tab === "pending" && (
              <>
                <TouchableOpacity onPress={() => skipTask(t)} style={styles.actionBtn}><Text style={styles.actionBtnText}>Retry today</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => sendLater(t)} style={styles.actionBtn}><Text style={styles.actionBtnText}>Later</Text></TouchableOpacity>
              </>
            )}
            {tab === "later" && (
              <TouchableOpacity onPress={() => restoreFromLater(t)} style={styles.restoreBtn}><Text style={styles.restoreBtnText}>Restore</Text></TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => deleteTask(t)}><Text style={styles.deleteX}>✕</Text></TouchableOpacity>
          </View>
        </View>
      ))}

      {tab === "today" && completedToday.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.emptyText}>Completed today ({completedToday.length})</Text>
          {completedToday.map((t) => (
            <View key={t.id} style={[styles.taskCard, { opacity: 0.5 }]}>
              <Text style={[styles.taskTitle, { textDecorationLine: "line-through" }]}>
                {t.title} {t.status === "rejected" ? "— rejected" : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
      <TouchableOpacity onPress={debugCheckAlarms} style={{ marginBottom: 12 }}>
        <Text style={{ color: "#8B8FA3", fontSize: 11 }}>Debug: check scheduled alarms</Text>
      </TouchableOpacity>
    </ScrollView>
  );

}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14171F" },
  tabRow: { flexDirection: "row", gap: 6, marginBottom: 16 },
  tabChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#1E2230" },
  tabChipActive: { backgroundColor: "#F2A65A" },
  tabChipText: { color: "#8B8FA3", fontSize: 12, textTransform: "capitalize" },
  tabChipTextActive: { color: "#14171F", fontWeight: "700" },
  card: { backgroundColor: "#1E2230", borderRadius: 16, padding: 12, marginBottom: 16 },
  input: { backgroundColor: "#181B26", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 10, padding: 10, color: "#EDEBE3", fontSize: 13 },
  addBtn: { backgroundColor: "#F2A65A", borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  addBtnText: { color: "#14171F", fontWeight: "700", fontSize: 13 },
  emptyText: { color: "#5B5F73", fontSize: 13, fontStyle: "italic" },
  taskCard: { backgroundColor: "#181B26", borderRadius: 12, padding: 12, marginBottom: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: "#4A4F66", alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: "#6FCF97", borderColor: "#6FCF97" },
  taskTitle: { color: "#EDEBE3", fontSize: 14 },
  taskTitleDone: { textDecorationLine: "line-through", opacity: 0.5 },
  taskTime: { color: "#8B8FA3", fontSize: 11, marginTop: 2 },
  overdueText: { color: "#E8735A", fontSize: 11, marginTop: 2 },
  parkedText: { color: "#8B8FA3", fontSize: 11, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" },
  actionBtn: { backgroundColor: "#14171F", borderColor: "#2A2F42", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actionBtnText: { color: "#EDEBE3", fontSize: 11 },
  restoreBtn: { backgroundColor: "#6FCF97", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  restoreBtnText: { color: "#14171F", fontWeight: "700", fontSize: 11 },
  deleteX: { color: "#8B8FA3", fontSize: 13, marginLeft: "auto", paddingHorizontal: 4 },
});
