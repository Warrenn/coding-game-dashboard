import type { PropsWithChildren, ReactNode } from 'react';
import { useAuth } from './auth-context.js';
import type { Role } from './types.js';

interface RoleGateProps extends PropsWithChildren {
  allow: Role | Role[];
  fallback?: ReactNode;
}

/** Renders children only when the signed-in role matches `allow`. */
export function RoleGate({ allow, fallback = null, children }: RoleGateProps) {
  const { status, role } = useAuth();
  if (status !== 'signed-in') return <>{fallback}</>;
  const allowed = Array.isArray(allow) ? allow.includes(role!) : allow === role;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}

export function PayerOnly({ children, fallback }: PropsWithChildren<{ fallback?: ReactNode }>) {
  return (
    <RoleGate allow="PAYER" fallback={fallback}>
      {children}
    </RoleGate>
  );
}

export function PlayerOnly({ children, fallback }: PropsWithChildren<{ fallback?: ReactNode }>) {
  return (
    <RoleGate allow="PLAYER" fallback={fallback}>
      {children}
    </RoleGate>
  );
}
