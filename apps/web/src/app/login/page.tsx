import { LoginGate, LoginScreen } from "./login-screen";

export default function LoginPage() {
  return (
    <LoginGate>
      <LoginScreen />
    </LoginGate>
  );
}
