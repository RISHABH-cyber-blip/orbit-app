import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabIcon({ emoji }: { emoji: string }) {
  return <Text style={{ fontSize: 18 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#14171F" },
        headerTintColor: "#EDEBE3",
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: { backgroundColor: "#1E2230", borderTopColor: "#2A2F42" },
        tabBarActiveTintColor: "#F2A65A",
        tabBarInactiveTintColor: "#8B8FA3",
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: () => <TabIcon emoji="🏠" /> }} />
      <Tabs.Screen name="timetable" options={{ title: "Timetable", tabBarIcon: () => <TabIcon emoji="📅" /> }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks", tabBarIcon: () => <TabIcon emoji="✅" /> }} />
      <Tabs.Screen name="assistant" options={{ title: "Assistant", tabBarIcon: () => <TabIcon emoji="💬" /> }} />
    </Tabs>
  );
}
