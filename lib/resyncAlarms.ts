import { supabase } from "./supabaseClient";
import { scheduleClassAlarm, scheduleTaskAlarm, cancelAllAlarms } from "./notifications";
import { todayStr } from "./scheduling";

export async function resyncAlarms() {
    await cancelAllAlarms();

    const { data: classes } = await supabase.from("timetable_events").select("*").eq("alarm_enabled", true);
    for (const c of classes ?? []) {
        const id = await scheduleClassAlarm(c.day_of_week, c.start_time, c.subject);
        await supabase.from("timetable_events").update({ notif_id: id }).eq("id", c.id);
    }

    const { data: tasks } = await supabase
        .from("tasks").select("*")
        .eq("alarm_enabled", true).eq("status", "pending")
        .gte("task_date", todayStr()).not("start_time", "is", null);
    for (const t of tasks ?? []) {
        const id = await scheduleTaskAlarm(t.task_date, t.start_time, t.title);
        await supabase.from("tasks").update({ notif_id: id }).eq("id", t.id);
    }

    for (const c of classes ?? []) {
        try {
            const id = await scheduleClassAlarm(c.day_of_week, c.start_time, c.subject);
            await supabase.from("timetable_events").update({ notif_id: id }).eq("id", c.id);
        } catch (e) {
            console.error("Class alarm failed:", c.subject, e);
        }
    }
}
