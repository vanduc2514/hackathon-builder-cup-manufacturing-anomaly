// AuthGate: renders the factory floor only with a signed-in session.
import React from 'react';
import { useSession } from '../lib/auth';
import LoginScreen from './LoginScreen';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps): React.ReactElement {
  const session = useSession();
  return session ? <>{children}</> : <LoginScreen />;
}
