export interface Profile {
  id: string;
  full_name: string | null;
  field_of_study: string | null;
  goals: string | null;
  wake_time: string;
  sleep_time: string;
  travel_minutes: number;
}

export interface TimetableEvent {
  id: string;
  user_id: string;
  day_of_week: number; // 0=Sunday ... 6=Saturday
  start_time: string;  // "HH:MM"
  end_time: string;
  subject: string;
  color: string;
  alarm_enabled: boolean;
  notif_id: string | null;
}

export type TaskStatus = "pending" | "done" | "skipped" | "later" | "rejected";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  task_date: string; // "YYYY-MM-DD"
  start_time: string | null;
  end_time: string | null;
  status: TaskStatus;
  priority: "low" | "normal" | "high";
  original_date: string | null;
  created_at: string;
  alarm_enabled: boolean;
  notif_id: string | null;
}

export interface ScheduleBlock {
  start_time: string | null;
  end_time: string | null;
}
