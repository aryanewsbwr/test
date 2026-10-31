import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from './session';

export interface UserPermissions {
  can_collect: boolean;          // Receipt / Payment collection
  can_view_delivery: boolean;    // Daily customer delivery sheet & counts
  can_mark_discontinue: boolean; // Vacation hold / discontinue
  can_retail_sale: boolean;      // Retail sales
  can_access_master: boolean;    // Masters (Publication, Rates, Customer, Hawker, Area)
  can_billing: boolean;          // Monthly bill generation
  can_reports: boolean;          // Financial & billing reports
  can_manage_users: boolean;     // User & role permissions
}

export interface AppUser {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'hawker' | 'operator' | 'billing';
  hawker_id?: number; // Linked hawker ID if role is hawker
  phone?: string;
  is_active: boolean;
  permissions: UserPermissions;
  created_at: string;
  updated_at: string;
}

const AUTH_SALT = process.env.AUTH_SECRET_SALT || '';

if (!AUTH_SALT && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: AUTH_SECRET_SALT is not set in environment variables!');
}

export function hashPassword(password: string): string {
  const salt = AUTH_SALT || 'fallback_dev_salt';
  return crypto.createHash('sha256').update(salt + password.trim()).digest('hex');
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  can_collect: true,
  can_view_delivery: true,
  can_mark_discontinue: true,
  can_retail_sale: true,
  can_access_master: true,
  can_billing: true,
  can_reports: true,
  can_manage_users: true
};

export const DEFAULT_HAWKER_PERMISSIONS: UserPermissions = {
  can_collect: true,
  can_view_delivery: true,
  can_mark_discontinue: true,
  can_retail_sale: true,
  can_access_master: false,
  can_billing: false,
  can_reports: false,
  can_manage_users: false
};

export const DEFAULT_OPERATOR_PERMISSIONS: UserPermissions = {
  can_collect: true,
  can_view_delivery: true,
  can_mark_discontinue: true,
  can_retail_sale: true,
  can_access_master: true,
  can_billing: false,
  can_reports: true,
  can_manage_users: false
};

const DEFAULT_USERS: AppUser[] = [
  {
    id: 'user_admin_001',
    username: 'ananews',
    password_hash: 'e27bde481d7a5ae355be1026d3098ff01badff78475185268dc18ccea57da07d',
    name: 'Main Administrator',
    role: 'admin',
    is_active: true,
    permissions: DEFAULT_ADMIN_PERMISSIONS,
    created_at: '2026-10-07T00:00:00.000Z',
    updated_at: '2026-10-07T00:00:00.000Z'
  }
];

// app_users holds password hashes, so only the server key may touch it
export async function usersDb() {
  const { supabaseAdmin } = await import('./supabaseAdmin');
  return supabaseAdmin;
}

// The main administrator is always available, so saving another user can't lock anyone out
export function withDefaultUsers(users: AppUser[]): AppUser[] {
  const saved = new Set(users.map(u => u.username.toLowerCase()));
  return [...users, ...DEFAULT_USERS.filter(u => !saved.has(u.username.toLowerCase()))];
}

export async function getAllUsers(): Promise<AppUser[]> {
  try {
    const db = await usersDb();
    const { data, error } = await db.from('app_users').select('*');
    if (error) {
      console.warn('Supabase app_users query notice:', error.message || error);
    } else if (data && data.length > 0) {
      return withDefaultUsers(data.map(u => ({
        ...u,
        permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : (u.permissions || DEFAULT_HAWKER_PERMISSIONS)
      })));
    }
  } catch (err: any) {
    console.warn('Error reading from app_users:', err?.message || err);
  }

  return DEFAULT_USERS;
}

// Who is calling, read fresh so a removed or switched-off user stops working at once
export async function currentUser(req: NextRequest): Promise<AppUser | null> {
  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const users = await getAllUsers();
  return users.find(u => u.id === userId && u.is_active !== false) || null;
}

// A refusal to return from the route, or null when the user may go ahead
export async function refuseWithout(req: NextRequest, permission: keyof UserPermissions): Promise<NextResponse | null> {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Please log in again' }, { status: 401 });
  if (!user.permissions?.[permission]) {
    return NextResponse.json({ error: 'You do not have permission for this' }, { status: 403 });
  }
  return null;
}

export async function authenticateUser(username: string, password: string): Promise<AppUser | null> {
  const cleanUsername = username.trim().toLowerCase();
  const users = await getAllUsers();
  
  const user = users.find(u => u.username.toLowerCase() === cleanUsername && u.is_active !== false);
  if (!user) return null;

  if (verifyPassword(password, user.password_hash)) {
    return user;
  }
  return null;
}
