import React from 'react';
import { useSession } from '../../api/auth';
import MobileDeviceFrame from './MobileDeviceFrame';
import MobileLogin from './MobileLogin';

interface AuthGateProps {
  children: React.ReactNode;
}

/** Renders children only with a session; otherwise the login screen inside the phone chassis. */
export default function AuthGate({ children }: AuthGateProps): React.ReactElement {
  const session = useSession();
  if (session) return <>{children}</>;
  return (
    <MobileDeviceFrame>
      <MobileLogin />
    </MobileDeviceFrame>
  );
}
