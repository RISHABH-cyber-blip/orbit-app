import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { supabase } from "@/lib/supabaseClient";
import { todayStr } from "@/lib/scheduling";
import type { TimetableEvent, Task } from "@/lib/types";

function dayOfWeek(d: string): number { return new Date(d + "T00:00:00").getDay(); }
interface DayStat { date: string; completed: number; total: number; rate: number; rejected: number; }

export default function Dashboard() {
  const [todayEvents, setTodayEvents] = useState<TimetableEvent[]>([]);
  const [weekStats, setWeekStats] = useState<DayStat[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [suggestion, setSuggestion] = useState("");
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: events } = await supabase.from("timetable_events").select("*").eq("day_of_week", dayOfWeek(todayStr()));
    setTodayEvents((events as TimetableEvent[]) || []);

    const { data: taskRows } = await supabase.from("tasks").select("*").eq("task_date", todayStr()).eq("status", "pending").order("start_time");
    setTodayTasks((taskRows as Task[]) || []);

    const { count } = await supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "pending").lt("task_date", todayStr());
    setPendingCount(count || 0);

    const since = new Date(); since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().slice(0, 10);
    const { data: recentTasks } = await supabase.from("tasks").select("task_date,status").gte("task_date", sinceStr).lte("task_date", todayStr());

    const byDate: Record<string, { total: number; done: number; rejected: number }> = {};
    (recentTasks || []).forEach((t: any) => {
      byDate[t.task_date] = byDate[t.task_date] || { total: 0, done: 0, rejected: 0 };
      byDate[t.task_date].total += 1;
      if (t.status === "done") byDate[t.task_date].done += 1;
      if (t.status === "rejected") byDate[t.task_date].rejected += 1;
    });
    const days: DayStat[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const stat = byDate[key] || { total: 0, done: 0, rejected: 0 };
      days.push({ date: key.slice(5), completed: stat.done, total: stat.total, rejected: stat.rejected, rate: stat.total ? Math.round((stat.done / stat.total) * 100) : 0 });
    }
    setWeekStats(days);

    if ((count || 0) > 2) setSuggestion(`You have ${count} overdue tasks piling up. Park the low-priority ones in "Later".`);
    else if (days.slice(-3).every((d) => d.rate >= 70)) setSuggestion("3-day streak of solid completion. Good pace.");
    else setSuggestion("");
  }

  const maxTotal = Math.max(1, ...weekStats.map((d) => d.total));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Today's schedule</Text>
        {(() => {
          const combined = [
            ...todayEvents.map((ev) => ({ id: "c-" + ev.id, time: ev.start_time, label: ev.subject, color: ev.color, kind: "class" as const })),
            ...todayTasks.map((t) => ({ id: "t-" + t.id, time: t.start_time || "—", label: t.title, color: "#F2A65A", kind: "task" as const })),
          ].sort((a, b) => a.time.localeCompare(b.time));
          if (combined.length === 0) return <Text style={styles.emptyText}>Nothing scheduled today.</Text>;
          return combined.map((item) => (
            <View key={item.id} style={[styles.classRow, { borderLeftColor: item.color }]}>
              <Text style={styles.classTime}>{item.time}</Text>
              <Text style={styles.classSubject}>{item.label}{item.kind === "task" ? " (task)" : ""}</Text>
            </View>
          ));
        })()}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.card, { flex: 1 }]}>
          <Text style={styles.label}>Overdue</Text>
          <Text style={styles.bigNumber}>{pendingCount}</Text>
        </View>
      </View>

      {suggestion !== "" && (
        <View style={[styles.card, { borderColor: "#F2A65A55", borderWidth: 1 }]}>
          <Text style={[styles.label, { color: "#F2A65A" }]}>Suggestion</Text>
          <Text style={styles.suggestionText}>{suggestion}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Tasks per day — last 7 days</Text>
        <View style={styles.chartRow}>
          {weekStats.map((d) => (
            <View key={d.date} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.barFillDone, { height: `${(d.completed / maxTotal) * 100}%` }]} />
                <View style={[styles.barFillRejected, { height: `${(d.rejected / maxTotal) * 100}%` }]} />
              </View>
              <Text style={styles.barLabel}>{d.date}</Text>
            </View>
          ))}
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#6FCF97" }]} /><Text style={styles.legendText}>Done</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: "#E8735A" }]} /><Text style={styles.legendText}>Rejected</Text></View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14171F" },
  card: { backgroundColor: "#1E2230", borderRadius: 16, padding: 16, marginBottom: 16 },
  label: { color: "#8B8FA3", fontSize: 12, fontWeight: "600", marginBottom: 8 },
  emptyText: { color: "#5B5F73", fontSize: 13, fontStyle: "italic" },
  classRow: { flexDirection: "row", gap: 10, backgroundColor: "#181B26", padding: 10, borderRadius: 8, marginBottom: 6, borderLeftWidth: 3 },
  classTime: { color: "#8B8FA3", fontSize: 12, fontVariant: ["tabular-nums"] },
  classSubject: { color: "#EDEBE3", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 12 },
  bigNumber: { color: "#EDEBE3", fontSize: 32, fontWeight: "700" },
  suggestionText: { color: "#C9CCDA", fontSize: 13 },
  chartRow: { flexDirection: "row", justifyContent: "space-between", height: 120, alignItems: "flex-end" },
  barColumn: { alignItems: "center", flex: 1 },
  barTrack: { width: 16, height: 100, backgroundColor: "#181B26", borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  barFillDone: { backgroundColor: "#6FCF97", width: "100%" },
  barFillRejected: { backgroundColor: "#E8735A", width: "100%" },
  barLabel: { color: "#5B5F73", fontSize: 9, marginTop: 4 },
  legendRow: { flexDirection: "row", gap: 16, marginTop: 12, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#8B8FA3", fontSize: 11 },
});
