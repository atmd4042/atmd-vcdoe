import { useEffect } from "react";
import { useAuth } from "@/src/auth";
import { registerForPush } from "@/src/push";

export default function PushRegistrar() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.id) registerForPush(user.id);
  }, [user?.id]);
  return null;
}
