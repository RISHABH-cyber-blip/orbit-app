import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function Index() {
    const [session, setSession] = useState<Session | null | undefined>(undefined);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
    }, []);

    if (session === undefined) {
        return <View style={{ flex: 1, backgroundColor: "#14171F" }} />;
    }

    return <Redirect href={session ? "/(tabs)/dashboard" : "/login"} />;
}