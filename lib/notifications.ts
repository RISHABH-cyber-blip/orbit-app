import { Platform } from "react-native";
import Constants from "expo-constants";

// The expo-notifications library (SDK 53+) throws an error when imported in Expo Go on Android
// even if no functions are called. We use dynamic requires to avoid importing it at all in Expo Go.
const isExpoGo = Constants.appOwnership === "expo";
const shouldSkipNotifications = isExpoGo && Platform.OS === "android";

// We'll use this to hold the imported module
let Notifications: any = null;

if (!shouldSkipNotifications) {
  // Use require to avoid top-level import crash
  Notifications = require("expo-notifications");
  
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (shouldSkipNotifications) {
    console.warn("Notifications are disabled in Expo Go on Android to prevent crashes. Use a development build for full functionality.");
    return false;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orbit-alarms", {
      name: "Orbit alarms",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      showBadge: true,
      enableVibrate: true,
    });
  }
  return status === "granted";
}

/**
 * Schedules a WEEKLY REPEATING local notification for a timetable class.
 */
export async function scheduleClassAlarm(
  dayOfWeek: number, // 0=Sunday ... 6=Saturday (our DB convention)
  startTime: string, // "HH:MM"
  subject: string
): Promise<string> {
  if (shouldSkipNotifications) return "disabled-in-expo-go";
  const [hour, minute] = startTime.split(":").map(Number);
  const weekday = dayOfWeek + 1; // convert to expo's 1-7 convention

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Class starting",
      body: subject,
      sound: "default",
      data: { kind: "class", subject },
      ...Platform.select({
        android: { channelId: "orbit-alarms" },
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      weekday,
      hour,
      minute,
      repeats: true,
    },
  });
  return id;
}

/**
 * Schedules a ONE-TIME local notification for a task at a specific date + time.
 */
export async function scheduleTaskAlarm(
  taskDate: string, // "YYYY-MM-DD"
  startTime: string, // "HH:MM"
  title: string
): Promise<string | null> {
  if (shouldSkipNotifications) return null;
  const [hour, minute] = startTime.split(":").map(Number);
  const [year, month, day] = taskDate.split("-").map(Number);
  const fireDate = new Date(year, month - 1, day, hour, minute, 0);

  if (fireDate.getTime() <= Date.now()) return null; // don't schedule for the past

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Task time",
      body: title,
      sound: "default",
      data: { kind: "task", title },
      ...Platform.select({
        android: { channelId: "orbit-alarms" },
      }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireDate,
    },
  });
  return id;
}

export async function cancelAlarm(notifId: string | null) {
  if (!notifId || shouldSkipNotifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {
    // already fired or cancelled — safe to ignore
  }
}
