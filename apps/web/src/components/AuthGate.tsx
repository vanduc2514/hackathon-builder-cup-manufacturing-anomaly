// AuthGate: renders the dashboard only with a signed-in session, so no API call or stream opens without a token.
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
