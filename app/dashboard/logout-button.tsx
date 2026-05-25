"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }

  return (
    <button
      type="button"
      className="btn-primary"
      style={{ maxWidth: 200 }}
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? "Saindo..." : "Sair"}
    </button>
  );
}
