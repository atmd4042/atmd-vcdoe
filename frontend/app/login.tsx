import { Redirect } from "expo-router";

// Desktop/web entry link for service providers: /login
export default function LoginRedirect() {
  return <Redirect href="/(auth)/login" />;
}
