import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function CrmProtectedRoute({ children }) {
  const [ok, setOk] = useState(null); // null = loading, false/true after check

  useEffect(() => {
    let mounted = true;

    async function run() {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return mounted && setOk(false);

      // Check role in profiles
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error) return mounted && setOk(false);

      mounted && setOk(profile?.role === "admin" || profile?.role === "tech");
    }

    run();
    return () => { mounted = false; };
  }, []);

  if (ok === null) return <div style={{ padding: 20 }}>Loading...</div>;
  if (!ok) return <Navigate to="/crm-login" replace />;
  return children;
}
