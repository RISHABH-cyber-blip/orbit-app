import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { requestNotificationPermission } from "@/lib/notifications";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    requestNotificationPermission();
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    const inTabsGroup = segments[0] === "(tabs)";
    if (!session && inTabsGroup) {
      router.replace("/login");
    } else if (session && !inTabsGroup) {
      router.replace("/(tabs)/dashboard");
    }
  }, [session, segments]);

  if (session === undefined) return <View style={{ flex: 1, backgroundColor: "#14171F" }} />;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#14171F" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
